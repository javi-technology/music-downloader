import type { Song } from '../domain/types.js';
import type { ProcessTrackOutcome } from '../pipeline/process-track.js';
import { parseSpotifyUrl } from '../spotify/url.js';
import type { JobRepository, SongSource } from './types.js';

export const MAX_TRACKS_PER_JOB = 200;

export class EmptySourceError extends Error {
  constructor() {
    super('Nenhuma faixa encontrada para a URL informada');
    this.name = 'EmptySourceError';
  }
}

export class TooManyTracksError extends Error {
  constructor(total: number) {
    super(`A fonte tem ${total} faixas; o limite por job é ${MAX_TRACKS_PER_JOB}`);
    this.name = 'TooManyTracksError';
  }
}

export async function createDownloadJob(
  input: { ownerUid: string; url: string },
  deps: { songs: SongSource; repository: JobRepository },
): Promise<{ jobId: string; totalTracks: number }> {
  const source = parseSpotifyUrl(input.url);
  const songs = await deps.songs.getSongs(source);

  if (songs.length === 0) throw new EmptySourceError();
  if (songs.length > MAX_TRACKS_PER_JOB) throw new TooManyTracksError(songs.length);

  const jobId = await deps.repository.createJob({ ownerUid: input.ownerUid, sourceUrl: input.url, source, songs });
  return { jobId, totalTracks: songs.length };
}

export async function runTrack(
  input: { jobId: string; trackId: string; song: Song; destinationDir: string },
  deps: { repository: JobRepository; process: (song: Song, destinationDir: string) => Promise<ProcessTrackOutcome> },
): Promise<void> {
  const { jobId, trackId } = input;
  if (!(await deps.repository.claimTrack(jobId, trackId))) return;

  let outcome: ProcessTrackOutcome;
  try {
    // Pasta por faixa: faixas homônimas do mesmo job não sobrescrevem o mesmo arquivo.
    outcome = await deps.process(input.song, `${input.destinationDir}/${trackId}`);
  } catch (error) {
    await deps.repository.failTrack(jobId, trackId, error instanceof Error ? error.message : String(error));
    return;
  }

  // Falha aqui não é falha do download: propaga sem marcar a faixa como `failed`.
  await deps.repository.completeTrack(jobId, trackId, outcome);
}
