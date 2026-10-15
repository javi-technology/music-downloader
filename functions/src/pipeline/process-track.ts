import type {
  AudioDownloader,
  AudioTagger,
  FileStorage,
  MusicSearcher,
} from "../domain/ports.js";
import type { Song } from "../domain/types.js";
import {
  type ScoredResult,
  pickBestMatch,
  pickIsrcMatch,
} from "../matching/matcher.js";

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
  return `${song.name.replace(/[/\\?%*:|"<>]/g, "_")}.mp3`;
}

export async function processTrack(
  song: Song,
  destinationDir: string,
  deps: ProcessTrackDeps,
): Promise<ProcessTrackOutcome> {
  const match = await findMatch(song, deps.searcher);
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

/** Como o spotDL: tenta o ISRC primeiro e só então a busca textual "artistas - título". */
async function findMatch(
  song: Song,
  searcher: MusicSearcher,
): Promise<ScoredResult | null> {
  if (song.isrc) {
    const match = pickIsrcMatch(song, await searcher.search(song.isrc));
    if (match) return match;
  }
  const results = await searcher.search(
    `${song.artists.join(", ")} - ${song.name}`,
  );
  return pickBestMatch(song, results);
}
