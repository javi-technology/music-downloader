import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  async function render() {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('deve renderizar o cabeçalho com o nome do sistema', async () => {
    expect((await render()).querySelector('header h1')?.textContent).toContain('Music Downloader');
  });

  it('deve conter o router-outlet dentro do main', async () => {
    expect((await render()).querySelector('main router-outlet')).not.toBeNull();
  });

  it('tem navegação para o início e para as configurações, sem login', async () => {
    const el = await render();
    const links = [...el.querySelectorAll<HTMLAnchorElement>('header nav a')].map((a) =>
      a.getAttribute('href'),
    );
    expect(links).toEqual(['/', '/configuracoes']);
    expect(el.querySelector('[data-testid=sign-out]')).toBeNull();
  });
});
