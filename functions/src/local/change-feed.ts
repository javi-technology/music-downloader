type Listener = (jobId: string) => void;

/** Avisa os navegadores conectados (SSE) quando um job muda. */
export class ChangeFeed {
  private readonly listeners = new Set<Listener>();

  get size(): number {
    return this.listeners.size;
  }

  publish(jobId: string): void {
    for (const listener of this.listeners) listener(jobId);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
