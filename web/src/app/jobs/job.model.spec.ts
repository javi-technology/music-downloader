import { DownloadJob, jobProgress } from './job.model';

const job = (overrides: Partial<DownloadJob> = {}): DownloadJob => ({
  id: 'j1',
  sourceUrl: 'https://open.spotify.com/album/x',
  source: { type: 'album', id: 'x' },
  totalTracks: 4,
  completedTracks: 0,
  failedTracks: 0,
  createdAt: new Date('2026-10-15T12:00:00Z'),
  ...overrides,
});

describe('jobProgress', () => {
  it('indica job pendente sem faixas processadas', () => {
    expect(jobProgress(job())).toEqual({ finished: 0, total: 4, percent: 0, status: 'pending' });
  });

  it('indica job em andamento', () => {
    expect(jobProgress(job({ completedTracks: 1, failedTracks: 1 }))).toEqual({
      finished: 2,
      total: 4,
      percent: 50,
      status: 'processing',
    });
  });

  it('indica job concluído quando todas terminaram com sucesso', () => {
    expect(jobProgress(job({ completedTracks: 4 }))).toEqual({
      finished: 4,
      total: 4,
      percent: 100,
      status: 'done',
    });
  });

  it('indica conclusão com falhas', () => {
    expect(jobProgress(job({ completedTracks: 3, failedTracks: 1 })).status).toBe(
      'done-with-errors',
    );
  });

  it('indica falha total', () => {
    expect(jobProgress(job({ failedTracks: 4 })).status).toBe('failed');
  });
});
