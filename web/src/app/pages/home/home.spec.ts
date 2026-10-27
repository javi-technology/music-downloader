import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { JobsGateway } from '../../jobs/jobs.gateway';
import { SettingsGateway } from '../../settings/settings.gateway';
import {
  FakeJobsGateway,
  FakeSettingsGateway,
  FakeToolsGateway,
  makeJob,
  makeSettings,
  makeToolsStatus,
} from '../../testing/fakes';
import { ToolsGateway } from '../../tools/tools.gateway';
import { Home } from './home';

describe('Home', () => {
  let jobs: FakeJobsGateway;
  let settings: FakeSettingsGateway;
  let tools: FakeToolsGateway;

  async function render(setup: () => void = () => {}) {
    jobs = new FakeJobsGateway();
    settings = new FakeSettingsGateway();
    tools = new FakeToolsGateway();
    setup();
    await TestBed.configureTestingModule({
      imports: [Home],
      providers: [
        provideRouter([]),
        { provide: JobsGateway, useValue: jobs },
        { provide: SettingsGateway, useValue: settings },
        { provide: ToolsGateway, useValue: tools },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(Home);
    await fixture.whenStable();
    return fixture;
  }

  const el = (fixture: { nativeElement: unknown }) => fixture.nativeElement as HTMLElement;
  const submitButton = (fixture: { nativeElement: unknown }) =>
    el(fixture).querySelector<HTMLButtonElement>('button[type=submit]')!;

  async function type(fixture: Awaited<ReturnType<typeof render>>, value: string) {
    const input = el(fixture).querySelector<HTMLInputElement>('input[name=url]')!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  }

  describe('primeira execução', () => {
    it('mostra o progresso do download das ferramentas e bloqueia o envio', async () => {
      const fixture = await render(() =>
        tools.status$.next(
          makeToolsStatus({
            ready: false,
            installing: true,
            tools: [
              { name: 'yt-dlp', state: 'installed', source: 'app' },
              {
                name: 'ffmpeg',
                state: 'downloading',
                receivedBytes: 25 * 1024 * 1024,
                totalBytes: 100 * 1024 * 1024,
              },
              { name: 'deno', state: 'missing' },
            ],
          }),
        ),
      );
      await type(fixture, 'https://open.spotify.com/track/abc');

      const panel = el(fixture).querySelector('[data-testid=tools]')!;
      expect(panel.textContent).toContain('Preparando as ferramentas de download');
      expect(panel.textContent).toContain('ffmpeg');
      expect(panel.textContent).toContain('25%');
      expect(panel.textContent).toContain('25 de 100 MB');
      expect(submitButton(fixture).disabled).toBe(true);
    });

    it('mostra a falha e permite tentar de novo', async () => {
      const fixture = await render(() =>
        tools.status$.next(
          makeToolsStatus({
            ready: false,
            tools: [{ name: 'deno', state: 'error', error: 'HTTP 503' }],
          }),
        ),
      );

      expect(el(fixture).querySelector('[data-testid=tools]')!.textContent).toContain('HTTP 503');
      el(fixture).querySelector<HTMLButtonElement>('[data-testid=retry-tools]')!.click();
      expect(tools.install).toHaveBeenCalled();
    });

    it('pede para configurar o Spotify antes de baixar', async () => {
      const fixture = await render(() =>
        settings.settings$.next(makeSettings({ spotifyConfigured: false })),
      );
      await type(fixture, 'https://open.spotify.com/track/abc');

      const setup = el(fixture).querySelector('[data-testid=spotify-setup]')!;
      expect(setup.textContent).toContain('Configure suas credenciais do Spotify');
      expect(setup.querySelector('a')!.getAttribute('href')).toBe('/configuracoes');
      expect(submitButton(fixture).disabled).toBe(true);
    });

    it('com tudo pronto não mostra avisos', async () => {
      const fixture = await render();
      expect(el(fixture).querySelector('[data-testid=tools]')).toBeNull();
      expect(el(fixture).querySelector('[data-testid=spotify-setup]')).toBeNull();
    });
  });

  it('desabilita o envio para URL inválida e mostra aviso', async () => {
    const fixture = await render();
    await type(fixture, 'https://example.com/x');
    expect(submitButton(fixture).disabled).toBe(true);
    expect(el(fixture).textContent).toContain(
      'Cole um link de faixa, álbum ou playlist do Spotify',
    );
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

  it('mostra o erro retornado pelo app', async () => {
    const fixture = await render();
    jobs.createJob.mockRejectedValueOnce(
      new Error('Nenhuma faixa encontrada para a URL informada'),
    );
    await type(fixture, 'spotify:playlist:p');

    el(fixture).querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();

    expect(el(fixture).querySelector('[role=alert]')?.textContent).toContain(
      'Nenhuma faixa encontrada',
    );
  });

  it('mostra onde as músicas são salvas', async () => {
    const fixture = await render();
    expect(el(fixture).textContent).toContain('/Users/ana/Music/Music Downloader');
  });

  it('lista os jobs', async () => {
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
