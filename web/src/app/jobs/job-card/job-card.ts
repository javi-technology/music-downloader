import { DatePipe } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs';
import { DownloadJob, JobTrack, SourceType, TrackStatus, jobProgress } from '../job.model';
import { JobsGateway } from '../jobs.gateway';

const SOURCE_LABELS: Record<SourceType, string> = { track: 'Faixa', album: 'Álbum', playlist: 'Playlist' };

const STATUS_LABELS: Record<TrackStatus, string> = {
  pending: 'Na fila',
  processing: 'Baixando',
  done: 'Concluída',
  failed: 'Falhou',
};

@Component({
  selector: 'app-job-card',
  imports: [DatePipe],
  templateUrl: './job-card.html',
})
export class JobCard {
  private readonly gateway = inject(JobsGateway);

  readonly job = input.required<DownloadJob>();

  protected readonly progress = computed(() => jobProgress(this.job()));
  protected readonly sourceLabel = computed(() => SOURCE_LABELS[this.job().source.type]);
  protected readonly tracks = toSignal(toObservable(this.job).pipe(switchMap((job) => this.gateway.watchTracks(job.id))), {
    initialValue: [] as JobTrack[],
  });
  protected readonly statusLabels = STATUS_LABELS;

  protected async download(track: JobTrack): Promise<void> {
    if (!track.storagePath) return;
    window.open(await this.gateway.getDownloadUrl(track.storagePath), '_blank');
  }
}
