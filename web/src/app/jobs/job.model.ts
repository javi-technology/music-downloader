export type SourceType = 'track' | 'album' | 'playlist';
export type TrackStatus = 'pending' | 'processing' | 'done' | 'failed';
export type JobStatus = 'pending' | 'processing' | 'done' | 'done-with-errors' | 'failed';

export interface DownloadJob {
  id: string;
  sourceUrl: string;
  source: { type: SourceType; id: string };
  /** Nome do álbum/playlist (ausente em faixa avulsa). */
  title?: string;
  totalTracks: number;
  completedTracks: number;
  failedTracks: number;
  createdAt: Date | null;
}

export interface JobTrack {
  id: string;
  position: number;
  status: TrackStatus;
  song: { name: string; artists: string[]; album: string };
  storagePath?: string;
  error?: string;
}

export interface JobProgress {
  finished: number;
  total: number;
  percent: number;
  status: JobStatus;
}

export function jobProgress(job: DownloadJob): JobProgress {
  const finished = job.completedTracks + job.failedTracks;
  const total = job.totalTracks;
  const percent = total === 0 ? 100 : Math.round((finished / total) * 100);

  let status: JobStatus = 'processing';
  if (finished === 0) status = 'pending';
  else if (finished >= total) {
    status =
      job.failedTracks === 0 ? 'done' : job.completedTracks === 0 ? 'failed' : 'done-with-errors';
  }

  return { finished, total, percent, status };
}
