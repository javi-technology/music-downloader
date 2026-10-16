import { TestBed } from '@angular/core/testing';
import { SettingsGateway } from '../../settings/settings.gateway';
import { FakeSettingsGateway, makeSettings } from '../../testing/fakes';
import { SettingsPage } from './settings';

describe('SettingsPage', () => {
  let gateway: FakeSettingsGateway;

  async function render(setup: () => void = () => {}) {
    gateway = new FakeSettingsGateway();
    setup();
    await TestBed.configureTestingModule({
      imports: [SettingsPage],
      providers: [{ provide: SettingsGateway, useValue: gateway }],
    }).compileComponents();
    const fixture = TestBed.createComponent(SettingsPage);
    await fixture.whenStable();
    return fixture;
  }

  const el = (fixture: { nativeElement: unknown }) => fixture.nativeElement as HTMLElement;
  const input = (fixture: { nativeElement: unknown }, name: string) =>
    el(fixture).querySelector<HTMLInputElement>(`input[name=${name}]`)!;

  async function type(fixture: Awaited<ReturnType<typeof render>>, name: string, value: string) {
    const field = input(fixture, name);
    field.value = value;
    field.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  }

  it('preenche os campos com as configurações atuais, sem nunca mostrar o secret', async () => {
    const fixture = await render();

    expect(input(fixture, 'clientId').value).toBe('client-id');
    expect(input(fixture, 'downloadDir').value).toBe('/Users/ana/Music/Music Downloader');
    expect(input(fixture, 'clientSecret').value).toBe('');
    expect(input(fixture, 'clientSecret').type).toBe('password');
    expect(input(fixture, 'clientSecret').placeholder).toContain('salvo');
  });

  it('explica como criar o app no Spotify', async () => {
    const fixture = await render(() =>
      gateway.settings$.next(
        makeSettings({ spotifyConfigured: false, spotifyClientId: undefined }),
      ),
    );

    const link = el(fixture).querySelector<HTMLAnchorElement>(
      'a[href="https://developer.spotify.com/dashboard"]',
    );
    expect(link).not.toBeNull();
    expect(link!.target).toBe('_blank');
    expect(input(fixture, 'clientSecret').placeholder).not.toContain('salvo');
  });

  it('salva, confirma e limpa o campo do secret', async () => {
    const fixture = await render();
    await type(fixture, 'clientId', 'novo-id');
    await type(fixture, 'clientSecret', 'novo-secret');
    await type(fixture, 'downloadDir', '/Volumes/Musicas');

    el(fixture).querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();

    expect(gateway.save).toHaveBeenCalledWith({
      spotifyClientId: 'novo-id',
      spotifyClientSecret: 'novo-secret',
      downloadDir: '/Volumes/Musicas',
    });
    expect(el(fixture).querySelector('[role=status]')?.textContent).toContain(
      'Configurações salvas',
    );
    expect(input(fixture, 'clientSecret').value).toBe('');
  });

  it('mostra o erro de validação', async () => {
    const fixture = await render();
    gateway.save.mockRejectedValueOnce(
      new Error('A pasta de destino precisa ser um caminho absoluto'),
    );

    el(fixture).querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();

    expect(el(fixture).querySelector('[role=alert]')?.textContent).toContain('caminho absoluto');
  });
});
