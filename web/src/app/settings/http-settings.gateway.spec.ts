import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { fakeServerEvents } from '../testing/fake-server-events';
import { HttpSettingsGateway } from './http-settings.gateway';
import { AppSettings } from './settings.model';

describe('HttpSettingsGateway', () => {
  let gateway: HttpSettingsGateway;
  let http: HttpTestingController;
  let events: ReturnType<typeof fakeServerEvents>;

  beforeEach(() => {
    events = fakeServerEvents();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        events.provider,
        HttpSettingsGateway,
      ],
    });
    gateway = TestBed.inject(HttpSettingsGateway);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('carrega as configurações e avisa quem observa depois de salvar', async () => {
    const received: AppSettings[] = [];
    gateway.watchSettings().subscribe((settings) => received.push(settings));
    http.expectOne('/api/settings').flush({ spotifyConfigured: false, downloadDir: '/m' });

    const saved = gateway.save({ spotifyClientId: 'id', spotifyClientSecret: 's' });
    const req = http.expectOne('/api/settings');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ spotifyClientId: 'id', spotifyClientSecret: 's' });
    req.flush({ spotifyConfigured: true, spotifyClientId: 'id', downloadDir: '/m' });

    expect(await saved).toEqual({
      spotifyConfigured: true,
      spotifyClientId: 'id',
      downloadDir: '/m',
    });
    expect(received.map((settings) => settings.spotifyConfigured)).toEqual([false, true]);
  });

  it('recarrega na reconexão, inclusive depois de uma falha', () => {
    const received: AppSettings[] = [];
    let failed = false;
    gateway.watchSettings().subscribe({
      next: (settings) => received.push(settings),
      error: () => (failed = true),
    });

    http.expectOne('/api/settings').flush('falhou', { status: 500, statusText: 'Erro' });
    events.emit({ type: 'job', jobId: 'j' });
    events.emit({ type: 'open' });
    http
      .expectOne('/api/settings')
      .flush({ spotifyConfigured: true, spotifyBuiltIn: false, downloadDir: '/m' });

    expect(failed).toBe(false);
    expect(received.map((settings) => settings.downloadDir)).toEqual(['/m']);
  });

  it('não envia campos vazios (mantém o valor salvo)', async () => {
    const saved = gateway.save({
      spotifyClientId: 'id',
      spotifyClientSecret: '  ',
      downloadDir: '',
    });

    const req = http.expectOne('/api/settings');
    expect(req.request.body).toEqual({ spotifyClientId: 'id' });
    req.flush({ spotifyConfigured: true, downloadDir: '/m' });
    await saved;
  });

  it('repassa o erro de validação do servidor', async () => {
    const saved = gateway.save({ downloadDir: 'musicas' });

    http.expectOne('/api/settings').flush(
      { error: 'A pasta de destino precisa ser um caminho absoluto' },
      {
        status: 400,
        statusText: 'Bad Request',
      },
    );

    await expect(saved).rejects.toThrow('caminho absoluto');
  });
});
