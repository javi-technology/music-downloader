import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { Song } from "../domain/types.js";
import type { JobRepository, NewJob, TrackStatus } from "../jobs/types.js";
import type { SpotifyResourceType } from "../spotify/url.js";

export interface JobView {
  id: string;
  sourceUrl: string;
  source: { type: SpotifyResourceType; id: string };
  title?: string;
  totalTracks: number;
  completedTracks: number;
  failedTracks: number;
  createdAt: string;
}

export interface TrackView {
  id: string;
  position: number;
  status: TrackStatus;
  song: Song;
  storagePath?: string;
  error?: string;
}

export interface PendingTrack {
  jobId: string;
  trackId: string;
  song: Song;
  jobTitle?: string;
}

interface JobRow {
  id: string;
  source_url: string;
  source_type: SpotifyResourceType;
  source_id: string;
  title: string | null;
  total_tracks: number;
  completed_tracks: number;
  failed_tracks: number;
  created_at: string;
}

interface TrackRow {
  id: string;
  position: number;
  status: TrackStatus;
  song: string;
  storage_path: string | null;
  error: string | null;
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    source_url TEXT NOT NULL,
    source_type TEXT NOT NULL,
    source_id TEXT NOT NULL,
    title TEXT,
    total_tracks INTEGER NOT NULL,
    completed_tracks INTEGER NOT NULL DEFAULT 0,
    failed_tracks INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS tracks (
    job_id TEXT NOT NULL REFERENCES jobs(id),
    id TEXT NOT NULL,
    position INTEGER NOT NULL,
    status TEXT NOT NULL,
    song TEXT NOT NULL,
    storage_path TEXT,
    video_id TEXT,
    score REAL,
    error TEXT,
    PRIMARY KEY (job_id, id)
  );
  CREATE INDEX IF NOT EXISTS tracks_status ON tracks (status);
`;

/**
 * Jobs e faixas em SQLite (`node:sqlite`). As operações são síncronas no processo único do
 * servidor local; as transações garantem que status e contadores mudem juntos.
 */
export class SqliteJobRepository implements JobRepository {
  private readonly now: () => Date;
  private readonly newId: () => string;
  private readonly onChange: (jobId: string) => void;

  constructor(
    private readonly db: DatabaseSync,
    options: {
      now?: () => Date;
      newId?: () => string;
      onChange?: (jobId: string) => void;
    } = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.newId = options.newId ?? randomUUID;
    this.onChange = options.onChange ?? (() => {});
    db.exec(SCHEMA);
  }

  async createJob(job: NewJob): Promise<string> {
    const id = this.newId();
    this.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO jobs (id, source_url, source_type, source_id, title, total_tracks, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          job.sourceUrl,
          job.source.type,
          job.source.id,
          job.title ?? null,
          job.songs.length,
          this.now().toISOString(),
        );
      const insertTrack = this.db.prepare(
        `INSERT INTO tracks (job_id, id, position, status, song) VALUES (?, ?, ?, 'pending', ?)`,
      );
      job.songs.forEach((song, position) =>
        insertTrack.run(
          id,
          String(position).padStart(3, "0"),
          position,
          JSON.stringify(song),
        ),
      );
    });
    this.onChange(id);
    return id;
  }

  async claimTrack(jobId: string, trackId: string): Promise<boolean> {
    const { changes } = this.db
      .prepare(
        `UPDATE tracks SET status = 'processing' WHERE job_id = ? AND id = ? AND status = 'pending'`,
      )
      .run(jobId, trackId);
    if (changes > 0) this.onChange(jobId);
    return changes > 0;
  }

  async completeTrack(
    jobId: string,
    trackId: string,
    result: { storagePath: string; videoId: string; score: number },
  ): Promise<void> {
    this.finish(
      jobId,
      `UPDATE tracks SET status = 'done', storage_path = ?, video_id = ?, score = ?
       WHERE job_id = ? AND id = ? AND status = 'processing'`,
      [result.storagePath, result.videoId, result.score, jobId, trackId],
      "completed_tracks",
    );
  }

  async failTrack(
    jobId: string,
    trackId: string,
    error: string,
  ): Promise<void> {
    this.finish(
      jobId,
      `UPDATE tracks SET status = 'failed', error = ?
       WHERE job_id = ? AND id = ? AND status = 'processing'`,
      [error, jobId, trackId],
      "failed_tracks",
    );
  }

  listJobs(): JobView[] {
    return (
      this.db
        .prepare(`SELECT * FROM jobs ORDER BY created_at DESC, rowid DESC`)
        .all() as unknown as JobRow[]
    ).map(toJobView);
  }

  getJob(jobId: string): JobView | undefined {
    const row = this.db
      .prepare(`SELECT * FROM jobs WHERE id = ?`)
      .get(jobId) as JobRow | undefined;
    return row && toJobView(row);
  }

  listTracks(jobId: string): TrackView[] {
    return (
      this.db
        .prepare(`SELECT * FROM tracks WHERE job_id = ? ORDER BY position`)
        .all(jobId) as unknown as TrackRow[]
    ).map(toTrackView);
  }

  getTrack(jobId: string, trackId: string): TrackView | undefined {
    const row = this.db
      .prepare(`SELECT * FROM tracks WHERE job_id = ? AND id = ?`)
      .get(jobId, trackId) as TrackRow | undefined;
    return row && toTrackView(row);
  }

  /** Primeira faixa pendente do job mais antigo. */
  nextPendingTrack(): PendingTrack | undefined {
    const row = this.db
      .prepare(
        `SELECT t.job_id, t.id, t.song, j.title FROM tracks t JOIN jobs j ON j.id = t.job_id
         WHERE t.status = 'pending' ORDER BY j.created_at, j.rowid, t.position LIMIT 1`,
      )
      .get() as
      | { job_id: string; id: string; song: string; title: string | null }
      | undefined;
    if (!row) return undefined;
    return {
      jobId: row.job_id,
      trackId: row.id,
      song: JSON.parse(row.song) as Song,
      ...(row.title ? { jobTitle: row.title } : {}),
    };
  }

  /** Faixas que estavam em processamento quando o app foi fechado voltam para a fila. */
  resetProcessing(): number {
    const { changes } = this.db
      .prepare(
        `UPDATE tracks SET status = 'pending' WHERE status = 'processing'`,
      )
      .run();
    return Number(changes);
  }

  private finish(
    jobId: string,
    sql: string,
    params: (string | number)[],
    counter: "completed_tracks" | "failed_tracks",
  ): void {
    const changed = this.transaction(() => {
      const { changes } = this.db.prepare(sql).run(...params);
      if (changes === 0) return false;
      this.db
        .prepare(`UPDATE jobs SET ${counter} = ${counter} + 1 WHERE id = ?`)
        .run(jobId);
      return true;
    });
    if (changed) this.onChange(jobId);
  }

  private transaction<T>(work: () => T): T {
    this.db.exec("BEGIN");
    try {
      const result = work();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
}

function toJobView(row: JobRow): JobView {
  return {
    id: row.id,
    sourceUrl: row.source_url,
    source: { type: row.source_type, id: row.source_id },
    ...(row.title ? { title: row.title } : {}),
    totalTracks: row.total_tracks,
    completedTracks: row.completed_tracks,
    failedTracks: row.failed_tracks,
    createdAt: row.created_at,
  };
}

function toTrackView(row: TrackRow): TrackView {
  return {
    id: row.id,
    position: row.position,
    status: row.status,
    song: JSON.parse(row.song) as Song,
    ...(row.storage_path ? { storagePath: row.storage_path } : {}),
    ...(row.error ? { error: row.error } : {}),
  };
}
