import { signal } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { AuthGateway, AuthUser } from '../auth/auth.gateway';
import { DownloadJob, JobTrack } from '../jobs/job.model';
import { JobsGateway } from '../jobs/jobs.gateway';

export class FakeAuthGateway extends AuthGateway {
  readonly user = signal<AuthUser | null>(null);
  signIn = vi.fn(async () => undefined);
  signOut = vi.fn(async () => undefined);
}

export class FakeJobsGateway extends JobsGateway {
  readonly jobs$ = new BehaviorSubject<DownloadJob[]>([]);
  readonly tracks$ = new BehaviorSubject<JobTrack[]>([]);
  createJob = vi.fn(async (_url: string) => ({ jobId: 'novo', totalTracks: 1 }));
  watchJobs = vi.fn(() => this.jobs$.asObservable());
  watchTracks = vi.fn((_jobId: string) => this.tracks$.asObservable());
  getDownloadUrl = vi.fn(async (path: string) => `https://storage/${path}`);
}

export function makeJob(overrides: Partial<DownloadJob> = {}): DownloadJob {
  return {
    id: 'j1',
    sourceUrl: 'https://open.spotify.com/album/x',
    source: { type: 'album', id: 'x' },
    totalTracks: 2,
    completedTracks: 1,
    failedTracks: 0,
    createdAt: new Date('2026-10-15T12:00:00Z'),
    ...overrides,
  };
}

export function makeTrack(overrides: Partial<JobTrack> = {}): JobTrack {
  return {
    id: '000',
    position: 0,
    status: 'done',
    song: { name: 'Blinding Lights', artists: ['The Weeknd'], album: 'After Hours' },
    storagePath: 'music-downloader/users/u/j1/The Weeknd - Blinding Lights.mp3',
    ...overrides,
  };
}
