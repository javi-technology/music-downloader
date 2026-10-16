import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { isSpotifyUrl } from '../../core/spotify-url';
import { JobCard } from '../../jobs/job-card/job-card';
import { JobsGateway } from '../../jobs/jobs.gateway';
import { SettingsGateway } from '../../settings/settings.gateway';
import { ToolsGateway } from '../../tools/tools.gateway';
import { ToolStatus } from '../../tools/tools.model';

const MB = 1024 * 1024;

@Component({
  selector: 'app-home',
  imports: [JobCard, RouterLink],
  templateUrl: './home.html',
})
export class Home {
  private readonly jobsGateway = inject(JobsGateway);
  private readonly toolsGateway = inject(ToolsGateway);

  protected readonly url = signal('');
  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly success = signal<string | null>(null);

  protected readonly settings = toSignal(inject(SettingsGateway).watchSettings());
  protected readonly tools = toSignal(this.toolsGateway.watchStatus());
  protected readonly jobs = toSignal(this.jobsGateway.watchJobs(), { initialValue: [] });

  protected readonly urlValid = computed(() => isSpotifyUrl(this.url()));
  protected readonly showUrlHint = computed(() => this.url().trim() !== '' && !this.urlValid());
  protected readonly toolsPending = computed(() => this.tools()?.ready === false);
  protected readonly spotifyPending = computed(() => this.settings()?.spotifyConfigured === false);
  protected readonly canSubmit = computed(
    () =>
      this.urlValid() &&
      !this.submitting() &&
      this.tools()?.ready === true &&
      this.settings()?.spotifyConfigured === true,
  );

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    if (!this.canSubmit()) return;

    this.submitting.set(true);
    this.error.set(null);
    this.success.set(null);
    try {
      const { totalTracks } = await this.jobsGateway.createJob(this.url().trim());
      this.url.set('');
      this.success.set(`${totalTracks} faixa(s) na fila de download`);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Não foi possível criar o download');
    } finally {
      this.submitting.set(false);
    }
  }

  protected retryTools(): void {
    this.toolsGateway
      .install()
      .catch((error: unknown) =>
        this.error.set(error instanceof Error ? error.message : String(error)),
      );
  }

  protected toolProgress(tool: ToolStatus): string {
    switch (tool.state) {
      case 'installed':
        return 'Pronto';
      case 'missing':
        return 'Aguardando';
      case 'error':
        return `Falhou: ${tool.error ?? 'erro desconhecido'}`;
      case 'downloading': {
        const received = tool.receivedBytes ?? 0;
        const total = tool.totalBytes ?? 0;
        if (!total) return `Baixando… ${Math.round(received / MB)} MB`;
        return `Baixando… ${Math.floor((received / total) * 100)}% (${Math.round(received / MB)} de ${Math.round(total / MB)} MB)`;
      }
    }
  }
}
