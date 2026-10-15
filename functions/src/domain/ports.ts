import type { SearchResult, Song } from "./types.js";

export interface MusicSearcher {
  search(query: string): Promise<SearchResult[]>;
}

export interface AudioDownloader {
  /** Baixa o áudio do vídeo e converte para MP3; retorna o caminho local do arquivo. */
  download(videoId: string, outputDir: string): Promise<string>;
}

export interface AudioTagger {
  tag(filePath: string, song: Song): Promise<void>;
}

export interface FileStorage {
  upload(localPath: string, destination: string): Promise<void>;
}
