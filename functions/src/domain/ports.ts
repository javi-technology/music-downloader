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
  /** Salva o arquivo e devolve o caminho final (pode diferir de `destination` em colisões). */
  upload(localPath: string, destination: string): Promise<string>;
}
