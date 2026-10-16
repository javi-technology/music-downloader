import { Component, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { SettingsGateway } from '../../settings/settings.gateway';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.html',
})
export class SettingsPage {
  private readonly gateway = inject(SettingsGateway);

  protected readonly settings = toSignal(this.gateway.watchSettings());
  protected readonly clientId = signal('');
  /** Nunca vem do servidor: vazio mantém o secret salvo. */
  protected readonly clientSecret = signal('');
  protected readonly downloadDir = signal('');
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly success = signal<string | null>(null);

  constructor() {
    effect(() => {
      const current = this.settings();
      if (!current) return;
      this.clientId.set(current.spotifyClientId ?? '');
      this.downloadDir.set(current.downloadDir);
    });
  }

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    if (this.saving()) return;

    this.saving.set(true);
    this.error.set(null);
    this.success.set(null);
    try {
      await this.gateway.save({
        spotifyClientId: this.clientId(),
        spotifyClientSecret: this.clientSecret(),
        downloadDir: this.downloadDir(),
      });
      this.clientSecret.set('');
      this.success.set('Configurações salvas');
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Não foi possível salvar');
    } finally {
      this.saving.set(false);
    }
  }
}
