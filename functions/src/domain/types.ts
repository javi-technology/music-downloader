/** Faixa com metadados vindos do Spotify. */
export interface Song {
  spotifyId: string;
  name: string;
  artists: string[];
  album: string;
  durationSeconds: number;
  explicit?: boolean;
  trackNumber?: number;
  releaseYear?: string;
  coverUrl?: string;
  isrc?: string;
}

/** Resultado de busca no YouTube Music. */
export interface SearchResult {
  videoId: string;
  name: string;
  artists: string[];
  album?: string;
  durationSeconds: number;
  /** `true` quando o resultado é do tipo "song" (faixa oficial) no YouTube Music. */
  verified: boolean;
  explicit?: boolean;
}
