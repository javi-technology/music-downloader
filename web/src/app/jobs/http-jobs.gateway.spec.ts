import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { fakeServerEvents } from '../testing/fake-server-events';
import { HttpJobsGateway } from './http-jobs.gateway';
import { DownloadJob, JobTrack } from './job.model';

const jobRow = {
  id: 'j1',
  sourceUrl: 'https://open.spotify.com/album/x',
  source: { type: 'album', id: 'x' },
  title: 'After Hours',
  totalTracks: 2,
  completedTracks: 1,
  failedTracks: 0,
  createdAt: '2026-10-15T20:00:00.000Z',
};

const trackRow = {
  id: '000',
  position: 0,
  status: 'done',
  song: {
    spotifyId: 's',
    name: 'Blinding Lights',
    artists: ['The Weeknd'],
    album: 'After Hours',
    durationSeconds: 200,
  },
  storagePath: '/Users/ana/Music/Music Downloader/After Hours/Blinding Lights.mp3',
};

describe('HttpJobsGateway', () => {
  let gateway: HttpJobsGateway;
  let http: HttpTestingController;
  let events: ReturnType<typeof fakeServerEvents>;

  beforeEach(() => {
    events = fakeServerEvents();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        events.provider,
        HttpJobsGateway,
      ],
    });
    gateway = TestBed.inject(HttpJobsGateway);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('cria o job', async () => {
    const created = gateway.createJob('https://open.spotify.com/album/x');

    const req = http.expectOne('/api/jobs');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ url: 'https://open.spotify.com/album/x' });
    req.flush({ jobId: 'j1', totalTracks: 2 });

    expect(await created).toEqual({ jobId: 'j1', totalTracks: 2 });
  });

  it('repassa a mensagem de erro do servidor', async () => {
    const created = gateway.createJob('x');

    http.expectOne('/api/jobs').flush(
      { error: 'Configure as credenciais do Spotify antes de baixar' },
      {
        status: 409,
        statusText: 'Conflict',
      },
    );

    await expect(created).rejects.toThrow('Configure as credenciais do Spotify antes de baixar');
  });

  it('avisa quando o app local não responde', async () => {
    const created = gateway.createJob('x');

    http.expectOne('/api/jobs').error(new ProgressEvent('error'), { status: 0 });

    await expect(created).rejects.toThrow(/app/);
  });

  it('lista os jobs e recarrega a cada evento de job ou reconexão', () => {
    const received: DownloadJob[][] = [];
    gateway.watchJobs().subscribe((jobs) => received.push(jobs));

    http.expectOne('/api/jobs').flush([jobRow]);
    events.emit({ type: 'job', jobId: 'j1' });
    http.expectOne('/api/jobs').flush([]);
    events.emit({ type: 'tools', status: { ready: true, installing: false, tools: [] } });
    http.expectNone('/api/jobs');
    events.emit({ type: 'open' });
    http.expectOne('/api/jobs').flush([]);

    expect(received[0]).toEqual([
      {
        id: 'j1',
        sourceUrl: 'https://open.spotify.com/album/x',
        source: { type: 'album', id: 'x' },
        title: 'After Hours',
        totalTracks: 2,
        completedTracks: 1,
        failedTracks: 0,
        createdAt: new Date('2026-10-15T20:00:00.000Z'),
      },
    ]);
    expect(received).toHaveLength(3);
  });

  it('lista as faixas e recarrega só com eventos do mesmo job', () => {
    const received: JobTrack[][] = [];
    gateway.watchTracks('j1').subscribe((tracks) => received.push(tracks));

    http.expectOne('/api/jobs/j1/tracks').flush([trackRow]);
    events.emit({ type: 'job', jobId: 'outro' });
    http.expectNone('/api/jobs/j1/tracks');
    events.emit({ type: 'job', jobId: 'j1' });
    http.expectOne('/api/jobs/j1/tracks').flush([]);

    expect(received[0]).toEqual([
      {
        id: '000',
        position: 0,
        status: 'done',
        song: { name: 'Blinding Lights', artists: ['The Weeknd'], album: 'After Hours' },
        storagePath: trackRow.storagePath,
      },
    ]);
    expect(received).toHaveLength(2);
  });

  it('uma falha ao listar os jobs não encerra o acompanhamento: a reconexão busca de novo', () => {
    const received: DownloadJob[][] = [];
    let failed = false;
    gateway.watchJobs().subscribe({
      next: (jobs) => received.push(jobs),
      error: () => (failed = true),
    });

    http.expectOne('/api/jobs').flush('falhou', { status: 500, statusText: 'Erro' });
    events.emit({ type: 'open' });
    http.expectOne('/api/jobs').flush([jobRow]);

    expect(failed).toBe(false);
    expect(received.map((jobs) => jobs.length)).toEqual([1]);
  });

  it('uma falha ao listar as faixas não encerra o acompanhamento: o próximo evento busca de novo', () => {
    const received: JobTrack[][] = [];
    let failed = false;
    gateway.watchTracks('j1').subscribe({
      next: (tracks) => received.push(tracks),
      error: () => (failed = true),
    });

    http.expectOne('/api/jobs/j1/tracks').flush('falhou', { status: 500, statusText: 'Erro' });
    events.emit({ type: 'job', jobId: 'j1' });
    http.expectOne('/api/jobs/j1/tracks').flush([trackRow]);

    expect(failed).toBe(false);
    expect(received.map((tracks) => tracks.length)).toEqual([1]);
  });

  it('monta o link do MP3 servido pelo app', () => {
    expect(gateway.downloadUrl('j 1', '000')).toBe('/api/jobs/j%201/tracks/000/file');
  });

  it('a primeira lista chega sem esperar eventos', async () => {
    const first = firstValueFrom(gateway.watchJobs());
    http.expectOne('/api/jobs').flush([]);
    expect(await first).toEqual([]);
  });
});
