import type { PendingTrack } from "./sqlite-job-repository.js";

interface QueueRepository {
  nextPendingTrack(): PendingTrack | undefined;
  resetProcessing(): number;
}

/** Processa as faixas pendentes uma de cada vez, na ordem em que os jobs foram criados. */
export class TrackQueue {
  private draining?: Promise<void>;

  constructor(
    private readonly deps: {
      repository: QueueRepository;
      process: (track: PendingTrack) => Promise<void>;
      onError?: (error: unknown, track: PendingTrack) => void;
      /** Enquanto falso, as faixas ficam pendentes (ex.: ferramentas ainda sendo instaladas). */
      canProcess?: () => boolean;
    },
  ) {}

  /** Faixas que estavam em processamento quando o app fechou voltam para a fila. */
  start(): void {
    this.deps.repository.resetProcessing();
    this.notify();
  }

  /** Avisa que há faixas novas; não faz nada se a fila já está rodando. */
  notify(): void {
    this.draining ??= this.drain().finally(() => {
      this.draining = undefined;
    });
  }

  /** Resolve quando não houver mais faixas pendentes. */
  async idle(): Promise<void> {
    await this.draining;
  }

  private async drain(): Promise<void> {
    const canProcess = this.deps.canProcess ?? (() => true);
    let failed: PendingTrack | undefined;
    for (
      let track = this.next(canProcess);
      track && !isSameTrack(track, failed);
      track = this.next(canProcess)
    ) {
      failed = undefined;
      try {
        await this.deps.process(track);
      } catch (error) {
        // A faixa pode continuar `pending` (ex.: erro antes de reivindicá-la); sem esta guarda,
        // a fila a repetiria sem fim. Um novo `notify()` tenta de novo.
        failed = track;
        this.deps.onError?.(error, track);
      }
    }
  }

  private next(canProcess: () => boolean): PendingTrack | undefined {
    return canProcess() ? this.deps.repository.nextPendingTrack() : undefined;
  }
}

function isSameTrack(a: PendingTrack, b: PendingTrack | undefined): boolean {
  return !!b && a.jobId === b.jobId && a.trackId === b.trackId;
}

/** Pasta do job dentro da pasta de músicas: o nome do álbum/playlist, ou a raiz para faixa avulsa. */
export function jobFolder(title: string | undefined): string {
  if (title === undefined) return ".";
  const safe = title
    .replace(/[/\\?%*:|"<>\x00-\x1f]/g, "_")
    .replace(/[. ]+$/, "")
    .trim();
  return safe || "_";
}
