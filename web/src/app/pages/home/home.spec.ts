import { TestBed } from '@angular/core/testing';
import { AuthGateway } from '../../auth/auth.gateway';
import { JobsGateway } from '../../jobs/jobs.gateway';
import { FakeAuthGateway, FakeJobsGateway, makeJob } from '../../testing/fakes';
import { Home } from './home';

describe('Home', () => {
  let auth: FakeAuthGateway;
  let jobs: FakeJobsGateway;

  async function render({ loggedIn = true } = {}) {
    auth = new FakeAuthGateway();
    jobs = new FakeJobsGateway();
    if (loggedIn) auth.user.set({ uid: 'u1', displayName: 'Vini' });
    await TestBed.configureTestingModule({
      imports: [Home],
      providers: [
        { provide: AuthGateway, useValue: auth },
        { provide: JobsGateway, useValue: jobs },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(Home);
    await fixture.whenStable();
    return fixture;
  }

  const el = (fixture: { nativeElement: unknown }) => fixture.nativeElement as HTMLElement;

  async function type(fixture: Awaited<ReturnType<typeof render>>, value: string) {
    const input = el(fixture).querySelector<HTMLInputElement>('input[name=url]')!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  }

  it('pede login quando não autenticado', async () => {
    const fixture = await render({ loggedIn: false });
    expect(el(fixture).querySelector('form')).toBeNull();

    el(fixture).querySelector<HTMLButtonElement>('button[data-testid=sign-in]')!.click();
    expect(auth.signIn).toHaveBeenCalled();
  });

  it('desabilita o envio para URL inválida e mostra aviso', async () => {
    const fixture = await render();
    await type(fixture, 'https://example.com/x');
    expect(el(fixture).querySelector<HTMLButtonElement>('button[type=submit]')!.disabled).toBe(true);
    expect(el(fixture).textContent).toContain('Cole um link de faixa, álbum ou playlist do Spotify');
  });

  it('cria o job para URL válida e limpa o campo', async () => {
    const fixture = await render();
    await type(fixture, 'https://open.spotify.com/track/abc');

    el(fixture).querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();

    expect(jobs.createJob).toHaveBeenCalledWith('https://open.spotify.com/track/abc');
    expect(el(fixture).querySelector<HTMLInputElement>('input[name=url]')!.value).toBe('');
    expect(el(fixture).textContent).toContain('1 faixa(s) na fila');
  });

  it('mostra o erro retornado pelo backend', async () => {
    const fixture = await render();
    jobs.createJob.mockRejectedValueOnce(new Error('Nenhuma faixa encontrada para a URL informada'));
    await type(fixture, 'spotify:playlist:p');

    el(fixture).querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();

    expect(el(fixture).querySelector('[role=alert]')?.textContent).toContain('Nenhuma faixa encontrada');
  });

  it('lista os jobs do usuário', async () => {
    const fixture = await render();
    jobs.jobs$.next([makeJob({ id: 'a' }), makeJob({ id: 'b' })]);
    await fixture.whenStable();
    expect(el(fixture).querySelectorAll('app-job-card')).toHaveLength(2);
  });

  it('mostra estado vazio sem jobs', async () => {
    const fixture = await render();
    expect(el(fixture).textContent).toContain('Nenhum download ainda');
  });
});
