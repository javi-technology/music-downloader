import { Observable } from 'rxjs';
import { DownloadJob, JobTrack } from './job.model';

export abstract class JobsGateway {
  abstract createJob(url: string): Promise<{ jobId: string; totalTracks: number }>;
  /** Jobs do usuário autenticado, mais recentes primeiro. */
  abstract watchJobs(): Observable<DownloadJob[]>;
  abstract watchTracks(jobId: string): Observable<JobTrack[]>;
  abstract getDownloadUrl(storagePath: string): Promise<string>;
}
