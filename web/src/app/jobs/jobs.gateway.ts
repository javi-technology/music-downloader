import { Observable } from 'rxjs';
import { DownloadJob, JobTrack } from './job.model';

export abstract class JobsGateway {
  abstract createJob(url: string): Promise<{ jobId: string; totalTracks: number }>;
  /** Jobs mais recentes primeiro, atualizados conforme o processamento avança. */
  abstract watchJobs(): Observable<DownloadJob[]>;
  abstract watchTracks(jobId: string): Observable<JobTrack[]>;
  /** Link do MP3 de uma faixa concluída. */
  abstract downloadUrl(jobId: string, trackId: string): string;
}
