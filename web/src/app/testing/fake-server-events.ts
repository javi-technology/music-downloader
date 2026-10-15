import { Subject } from 'rxjs';
import { ServerEvent, ServerEvents } from '../core/server-events';

/** Substitui o `ServerEvents` nos testes: `emit` simula um evento do servidor. */
export function fakeServerEvents() {
  const subject = new Subject<ServerEvent>();
  return {
    provider: { provide: ServerEvents, useValue: { events: () => subject.asObservable() } },
    emit: (event: ServerEvent) => subject.next(event),
  };
}
