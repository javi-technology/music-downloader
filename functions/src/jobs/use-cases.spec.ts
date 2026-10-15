import { describe, expect, it, vi } from 'vitest';
import type { Song } from '../domain/types.js';
import { InvalidSpotifyUrlError } from '../spotify/url.js';
import { EmptySourceError, MAX_TRACKS_PER_JOB, TooManyTracksError, createDownloadJob, runTrack } from './use-cases.js';

const song = (id: string): Song => ({ spotifyId: id, name: `Song ${id}`, artists: ['A'], album: 'B', durationSeconds: 100 });

function makeRepo() {
  return {
    createJob: vi.fn().mockResolvedValue('job1'),
    markTrackProcessing: vi.fn().mockResolvedValue(undefined),
    markTrackDone: vi.fn().mockResolvedValue(undefined),
    markTrackFailed: vi.fn().mockResolvedValue(undefined),
  };
}

describe('createDownloadJob', () => {
  it('interpreta a URL, busca as faixas e cria o job', async () => {
    const repository = makeRepo();
    const songs = { getSongs: vi.fn().mockResolvedValue([song('1'), song('2')]) };
    const url = 'https://open.spotify.com/album/abc';

    const result = await createDownloadJob({ ownerUid: 'u1', url }, { songs, repository });

    expect(songs.getSongs).toHaveBeenCalledWith({ type: 'album', id: 'abc' });
    expect(repository.createJob).toHaveBeenCalledWith({
      ownerUid: 'u1',
      sourceUrl: url,
      source: { type: 'album', id: 'abc' },
      songs: [song('1'), song('2')],
    });
    expect(result).toEqual({ jobId: 'job1', totalTracks: 2 });
  });

  it('rejeita URL inválida sem consultar o Spotify', async () => {
    const songs = { getSongs: vi.fn() };
    await expect(createDownloadJob({ ownerUid: 'u1', url: 'xyz' }, { songs, repository: makeRepo() })).rejects.toBeInstanceOf(InvalidSpotifyUrlError);
    expect(songs.getSongs).not.toHaveBeenCalled();
  });

  it('rejeita fonte sem faixas', async () => {
    const songs = { getSongs: vi.fn().mockResolvedValue([]) };
    await expect(
      createDownloadJob({ ownerUid: 'u1', url: 'spotify:playlist:p' }, { songs, repository: makeRepo() }),
    ).rejects.toBeInstanceOf(EmptySourceError);
  });

  it(`rejeita mais de ${MAX_TRACKS_PER_JOB} faixas`, async () => {
    const many = Array.from({ length: MAX_TRACKS_PER_JOB + 1 }, (_, i) => song(String(i)));
    const repository = makeRepo();
    const songs = { getSongs: vi.fn().mockResolvedValue(many) };
    await expect(createDownloadJob({ ownerUid: 'u1', url: 'spotify:playlist:p' }, { songs, repository })).rejects.toBeInstanceOf(
      TooManyTracksError,
    );
    expect(repository.createJob).not.toHaveBeenCalled();
  });
});

describe('runTrack', () => {
  it('marca a faixa como processando e depois concluída', async () => {
    const repository = makeRepo();
    const outcome = { storagePath: 'p/x.mp3', videoId: 'v', score: 95 };
    const process = vi.fn().mockResolvedValue(outcome);

    await runTrack({ jobId: 'j', trackId: 't', song: song('1'), destinationDir: 'p' }, { repository, process });

    expect(repository.markTrackProcessing).toHaveBeenCalledWith('j', 't');
    expect(process).toHaveBeenCalledWith(song('1'), 'p');
    expect(repository.markTrackDone).toHaveBeenCalledWith('j', 't', outcome);
    expect(repository.markTrackFailed).not.toHaveBeenCalled();
  });

  it('marca a faixa como falha com a mensagem do erro, sem relançar', async () => {
    const repository = makeRepo();
    const process = vi.fn().mockRejectedValue(new Error('yt-dlp falhou'));

    await runTrack({ jobId: 'j', trackId: 't', song: song('1'), destinationDir: 'p' }, { repository, process });

    expect(repository.markTrackFailed).toHaveBeenCalledWith('j', 't', 'yt-dlp falhou');
    expect(repository.markTrackDone).not.toHaveBeenCalled();
  });
});
