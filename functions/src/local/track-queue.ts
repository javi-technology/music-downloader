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
    for (
      let track = this.deps.repository.nextPendingTrack();
      track;
      track = this.deps.repository.nextPendingTrack()
    ) {
      try {
        await this.deps.process(track);
      } catch (error) {
        this.deps.onError?.(error, track);
      }
    }
  }
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
