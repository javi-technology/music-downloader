import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthGateway } from '../../auth/auth.gateway';
import { isSpotifyUrl } from '../../core/spotify-url';
import { JobCard } from '../../jobs/job-card/job-card';
import { JobsGateway } from '../../jobs/jobs.gateway';

@Component({
  selector: 'app-home',
  imports: [JobCard],
  templateUrl: './home.html',
})
export class Home {
  protected readonly auth = inject(AuthGateway);
  private readonly jobsGateway = inject(JobsGateway);

  protected readonly url = signal('');
  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly success = signal<string | null>(null);

  protected readonly urlValid = computed(() => isSpotifyUrl(this.url()));
  protected readonly showUrlHint = computed(() => this.url().trim() !== '' && !this.urlValid());
  protected readonly jobs = toSignal(this.jobsGateway.watchJobs(), { initialValue: [] });

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    if (!this.urlValid() || this.submitting()) return;

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
}
