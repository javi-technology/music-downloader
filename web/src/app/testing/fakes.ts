import { BehaviorSubject } from 'rxjs';
import { DownloadJob, JobTrack } from '../jobs/job.model';
import { JobsGateway } from '../jobs/jobs.gateway';
import { SettingsGateway } from '../settings/settings.gateway';
import { AppSettings, SettingsUpdate } from '../settings/settings.model';
import { ToolsGateway } from '../tools/tools.gateway';
import { ToolsStatus } from '../tools/tools.model';

export class FakeJobsGateway extends JobsGateway {
  readonly jobs$ = new BehaviorSubject<DownloadJob[]>([]);
  readonly tracks$ = new BehaviorSubject<JobTrack[]>([]);
  createJob = vi.fn(async (_url: string) => ({ jobId: 'novo', totalTracks: 1 }));
  watchJobs = vi.fn(() => this.jobs$.asObservable());
  watchTracks = vi.fn((_jobId: string) => this.tracks$.asObservable());
  downloadUrl = vi.fn(
    (jobId: string, trackId: string) => `/api/jobs/${jobId}/tracks/${trackId}/file`,
  );
}

export class FakeSettingsGateway extends SettingsGateway {
  readonly settings$ = new BehaviorSubject<AppSettings>(makeSettings());
  watchSettings = vi.fn(() => this.settings$.asObservable());
  save = vi.fn(async (_update: SettingsUpdate) => this.settings$.value);
}

export class FakeToolsGateway extends ToolsGateway {
  readonly status$ = new BehaviorSubject<ToolsStatus>(makeToolsStatus());
  watchStatus = vi.fn(() => this.status$.asObservable());
  install = vi.fn(async () => undefined);
}

export function makeSettings(overrides: Partial<AppSettings> = {}): AppSettings {
  return {
    spotifyConfigured: true,
    spotifyClientId: 'client-id',
    downloadDir: '/Users/ana/Music/Music Downloader',
    ...overrides,
  };
}

export function makeToolsStatus(overrides: Partial<ToolsStatus> = {}): ToolsStatus {
  return {
    ready: true,
    installing: false,
    tools: [
      { name: 'yt-dlp', state: 'installed', source: 'app' },
      { name: 'ffmpeg', state: 'installed', source: 'app' },
      { name: 'deno', state: 'installed', source: 'app' },
    ],
    ...overrides,
  };
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
    storagePath: '/Users/ana/Music/Music Downloader/After Hours/Blinding Lights.mp3',
    ...overrides,
  };
}
