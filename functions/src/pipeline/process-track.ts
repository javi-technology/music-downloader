import type {
  AudioDownloader,
  AudioTagger,
  FileStorage,
  MusicSearcher,
} from "../domain/ports.js";
import type { Song } from "../domain/types.js";
import { pickBestMatch } from "../matching/matcher.js";

export interface ProcessTrackDeps {
  searcher: MusicSearcher;
  downloader: AudioDownloader;
  tagger: AudioTagger;
  storage: FileStorage;
  workDir: string;
}

export interface ProcessTrackOutcome {
  videoId: string;
  score: number;
  storagePath: string;
}

export class NoMatchError extends Error {
  constructor(song: Song) {
    super(
      `Nenhuma correspondência encontrada no YouTube Music para "${song.artists.join(", ")} - ${song.name}"`,
    );
    this.name = "NoMatchError";
  }
}

export function buildFileName(song: Song): string {
  const raw = `${song.artists.join(", ")} - ${song.name}`;
  return `${raw.replace(/[/\\?%*:|"<>]/g, "_")}.mp3`;
}

export async function processTrack(
  song: Song,
  destinationDir: string,
  deps: ProcessTrackDeps,
): Promise<ProcessTrackOutcome> {
  const results = await deps.searcher.search(
    `${song.artists.join(", ")} - ${song.name}`,
  );
  const match = pickBestMatch(song, results);
  if (!match) throw new NoMatchError(song);

  const localPath = await deps.downloader.download(
    match.result.videoId,
    deps.workDir,
  );
  await deps.tagger.tag(localPath, song);

  const storagePath = `${destinationDir}/${buildFileName(song)}`;
  await deps.storage.upload(localPath, storagePath);

  return { videoId: match.result.videoId, score: match.score, storagePath };
}
