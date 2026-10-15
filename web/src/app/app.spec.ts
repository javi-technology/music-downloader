import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { AuthGateway } from './auth/auth.gateway';
import { FakeAuthGateway } from './testing/fakes';

describe('App', () => {
  let auth: FakeAuthGateway;

  beforeEach(async () => {
    auth = new FakeAuthGateway();
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([]), { provide: AuthGateway, useValue: auth }],
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

  it('não mostra o botão de sair sem usuário', async () => {
    expect((await render()).querySelector('[data-testid=sign-out]')).toBeNull();
  });

  it('mostra o usuário e permite sair', async () => {
    auth.user.set({ uid: 'u1', displayName: 'Vini' });
    const el = await render();
    expect(el.querySelector('header')?.textContent).toContain('Vini');

    el.querySelector<HTMLButtonElement>('[data-testid=sign-out]')!.click();
    expect(auth.signOut).toHaveBeenCalled();
  });
});
