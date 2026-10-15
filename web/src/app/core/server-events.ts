import { Injectable, InjectionToken, inject } from '@angular/core';
import { Observable, share } from 'rxjs';
import { ToolsStatus } from '../tools/tools.model';

/** Subconjunto do `EventSource` usado aqui (substituível em testes). */
export interface EventSourceLike {
  addEventListener(type: string, listener: (event: MessageEvent) => void): void;
  close(): void;
}

export const EVENT_SOURCE_FACTORY = new InjectionToken<(url: string) => EventSourceLike>(
  'EVENT_SOURCE_FACTORY',
  { providedIn: 'root', factory: () => (url) => new EventSource(url) },
);

export type ServerEvent =
  /** Conectou (ou reconectou após o app reiniciar): convém recarregar os dados. */
  { type: 'open' } | { type: 'job'; jobId: string } | { type: 'tools'; status: ToolsStatus };

/** Eventos do servidor local (`/api/events`), numa única conexão compartilhada. */
@Injectable({ providedIn: 'root' })
export class ServerEvents {
  private readonly createSource = inject(EVENT_SOURCE_FACTORY);

  private readonly stream = new Observable<ServerEvent>((subscriber) => {
    const source = this.createSource('/api/events');
    source.addEventListener('open', () => subscriber.next({ type: 'open' }));
    source.addEventListener('job', (event) =>
      subscriber.next({ type: 'job', jobId: JSON.parse(event.data).jobId }),
    );
    source.addEventListener('tools', (event) =>
      subscriber.next({ type: 'tools', status: JSON.parse(event.data) }),
    );
    return () => source.close();
  }).pipe(share());

  events(): Observable<ServerEvent> {
    return this.stream;
  }
}
