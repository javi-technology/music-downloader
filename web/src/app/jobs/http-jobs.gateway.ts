import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, filter, firstValueFrom, map, startWith, switchMap } from 'rxjs';
import { apiError } from '../core/api-error';
import { ServerEvent, ServerEvents } from '../core/server-events';
import { DownloadJob, JobTrack, SourceType, TrackStatus } from './job.model';
import { JobsGateway } from './jobs.gateway';

/** Formato devolvido pela API local (`JobView`/`TrackView` em `functions/src/local`). */
interface JobRow {
  id: string;
  sourceUrl: string;
  source: { type: SourceType; id: string };
  title?: string;
  totalTracks: number;
  completedTracks: number;
  failedTracks: number;
  createdAt: string;
}

interface TrackRow {
  id: string;
  position: number;
  status: TrackStatus;
  song: { name: string; artists: string[]; album: string };
  storagePath?: string;
  error?: string;
}

@Injectable()
export class HttpJobsGateway extends JobsGateway {
  private readonly http = inject(HttpClient);
  private readonly events = inject(ServerEvents);

  async createJob(url: string): Promise<{ jobId: string; totalTracks: number }> {
    try {
      return await firstValueFrom(
        this.http.post<{ jobId: string; totalTracks: number }>('/api/jobs', { url }),
      );
    } catch (error) {
      throw apiError(error);
    }
  }

  watchJobs(): Observable<DownloadJob[]> {
    return this.reloadOn((event) => event.type !== 'tools').pipe(
      switchMap(() => this.http.get<JobRow[]>('/api/jobs')),
      map((rows) => rows.map(toDownloadJob)),
    );
  }

  watchTracks(jobId: string): Observable<JobTrack[]> {
    return this.reloadOn(
      (event) => event.type === 'open' || (event.type === 'job' && event.jobId === jobId),
    ).pipe(
      switchMap(() => this.http.get<TrackRow[]>(`/api/jobs/${encodeURIComponent(jobId)}/tracks`)),
      map((rows) => rows.map(toJobTrack)),
    );
  }

  downloadUrl(jobId: string, trackId: string): string {
    return `/api/jobs/${encodeURIComponent(jobId)}/tracks/${encodeURIComponent(trackId)}/file`;
  }

  /** Dispara uma carga imediata e outra a cada evento relevante do servidor. */
  private reloadOn(relevant: (event: ServerEvent) => boolean): Observable<unknown> {
    return this.events.events().pipe(filter(relevant), startWith(null));
  }
}

function toDownloadJob(row: JobRow): DownloadJob {
  return {
    id: row.id,
    sourceUrl: row.sourceUrl,
    source: row.source,
    ...(row.title ? { title: row.title } : {}),
    totalTracks: row.totalTracks,
    completedTracks: row.completedTracks,
    failedTracks: row.failedTracks,
    createdAt: new Date(row.createdAt),
  };
}

function toJobTrack(row: TrackRow): JobTrack {
  const { name, artists, album } = row.song;
  return {
    id: row.id,
    position: row.position,
    status: row.status,
    song: { name, artists, album },
    ...(row.storagePath ? { storagePath: row.storagePath } : {}),
    ...(row.error ? { error: row.error } : {}),
  };
}
