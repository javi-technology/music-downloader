import { TestBed } from '@angular/core/testing';
import { FakeJobsGateway, makeJob, makeTrack } from '../../testing/fakes';
import { JobsGateway } from '../jobs.gateway';
import { JobCard } from './job-card';

describe('JobCard', () => {
  let gateway: FakeJobsGateway;

  async function render(job = makeJob()) {
    gateway = new FakeJobsGateway();
    await TestBed.configureTestingModule({
      imports: [JobCard],
      providers: [{ provide: JobsGateway, useValue: gateway }],
    }).compileComponents();
    const fixture = TestBed.createComponent(JobCard);
    fixture.componentRef.setInput('job', job);
    await fixture.whenStable();
    return fixture;
  }

  it('mostra o tipo da fonte e o progresso', async () => {
    const fixture = await render(makeJob({ totalTracks: 4, completedTracks: 1, failedTracks: 1 }));
    const text = (fixture.nativeElement as HTMLElement).textContent!;
    expect(text).toContain('Álbum');
    expect(text).toContain('2/4');
    expect(
      (fixture.nativeElement as HTMLElement)
        .querySelector('[role=progressbar]')
        ?.getAttribute('aria-valuenow'),
    ).toBe('50');
  });

  it('lista as faixas do job com status', async () => {
    const fixture = await render();
    expect(gateway.watchTracks).toHaveBeenCalledWith('j1');

    gateway.tracks$.next([
      makeTrack(),
      makeTrack({
        id: '001',
        status: 'failed',
        error: 'Nenhuma correspondência',
        storagePath: undefined,
        song: { name: 'X', artists: ['Y'], album: 'Z' },
      }),
    ]);
    await fixture.whenStable();

    const items = (fixture.nativeElement as HTMLElement).querySelectorAll('li');
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain('The Weeknd — Blinding Lights');
    expect(items[0].textContent).toContain('Concluída');
    expect(items[1].textContent).toContain('Falhou');
    expect(items[1].textContent).toContain('Nenhuma correspondência');
    expect(items[1].querySelector('button')).toBeNull();
  });

  it('abre o link de download da faixa concluída', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const fixture = await render();
    gateway.tracks$.next([makeTrack()]);
    await fixture.whenStable();

    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('li button')!.click();
    await fixture.whenStable();

    expect(gateway.getDownloadUrl).toHaveBeenCalledWith(makeTrack().storagePath);
    expect(open).toHaveBeenCalledWith(`https://storage/${makeTrack().storagePath}`, '_blank');
  });
});
