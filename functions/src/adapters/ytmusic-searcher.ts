import type { MusicSearcher } from "../domain/ports.js";
import type { SearchResult } from "../domain/types.js";

interface YTItem {
  videoId: string;
  name: string;
  artist: { name: string };
  album?: { name: string } | null;
  duration: number | null;
}

/** Subconjunto da API do pacote `ytmusic-api` usado aqui. */
export interface YTMusicApi {
  initialize(): Promise<unknown>;
  searchSongs(query: string): Promise<YTItem[]>;
  searchVideos(query: string): Promise<YTItem[]>;
}

/** Busca no YouTube Music músicas (resultados "verificados") e vídeos, como o spotDL. */
export class YTMusicSearcher implements MusicSearcher {
  private ready?: Promise<unknown>;

  constructor(private readonly api: YTMusicApi) {}

  async search(query: string): Promise<SearchResult[]> {
    this.ready ??= this.api.initialize();
    await this.ready;

    const [songs, videos] = await Promise.all([
      this.api.searchSongs(query),
      this.api.searchVideos(query),
    ]);
    return [
      ...songs.map((item) => toResult(item, true)),
      ...videos.map((item) => toResult(item, false)),
    ].filter((result): result is SearchResult => result !== null);
  }
}

function toResult(item: YTItem, verified: boolean): SearchResult | null {
  if (item.duration === null) return null;
  return {
    videoId: item.videoId,
    name: item.name,
    artists: splitArtists(item.artist.name),
    ...(item.album ? { album: item.album.name } : {}),
    durationSeconds: item.duration,
    verified,
  };
}

function splitArtists(value: string): string[] {
  return value
    .split(/\s*(?:,|&)\s*/)
    .map((artist) => artist.trim())
    .filter(Boolean);
}
