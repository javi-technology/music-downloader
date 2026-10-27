type Listener = (event: string, data: unknown) => void;

/** Avisa os navegadores conectados (SSE) quando algo muda: jobs (`job`) e ferramentas (`tools`). */
export class ChangeFeed {
  private readonly listeners = new Set<Listener>();

  get size(): number {
    return this.listeners.size;
  }

  publish(event: string, data: unknown): void {
    for (const listener of this.listeners) listener(event, data);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
