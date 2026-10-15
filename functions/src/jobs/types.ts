import type { Song } from "../domain/types.js";
import type { SpotifyResource } from "../spotify/url.js";

export type TrackStatus = "pending" | "processing" | "done" | "failed";

export interface NewJob {
  ownerUid: string;
  sourceUrl: string;
  source: SpotifyResource;
  songs: Song[];
}

export interface JobRepository {
  /** Cria o job e um documento por faixa (status `pending`); retorna o id do job. */
  createJob(job: NewJob): Promise<string>;
  /**
   * Reivindica a faixa de forma atômica (`pending` → `processing`).
   * Retorna `false` se ela já foi reivindicada (entrega duplicada do evento).
   */
  claimTrack(jobId: string, trackId: string): Promise<boolean>;
  /** `processing` → `done` + incremento do contador, atomicamente; no-op em qualquer outro status. */
  completeTrack(
    jobId: string,
    trackId: string,
    result: { storagePath: string; videoId: string; score: number },
  ): Promise<void>;
  /** `processing` → `failed` + incremento do contador, atomicamente; no-op em qualquer outro status. */
  failTrack(jobId: string, trackId: string, error: string): Promise<void>;
}

export interface SongSource {
  getSongs(resource: SpotifyResource): Promise<Song[]>;
}
