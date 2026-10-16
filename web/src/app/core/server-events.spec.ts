import { TestBed } from '@angular/core/testing';
import { EVENT_SOURCE_FACTORY, EventSourceLike, ServerEvent, ServerEvents } from './server-events';

class FakeEventSource implements EventSourceLike {
  static instances: FakeEventSource[] = [];
  readonly listeners = new Map<string, ((event: MessageEvent) => void)[]>();
  closed = false;

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: (event: MessageEvent) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  close(): void {
    this.closed = true;
  }

  emit(type: string, data?: unknown): void {
    const event = new MessageEvent(type, { data: data === undefined ? '' : JSON.stringify(data) });
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

describe('ServerEvents', () => {
  let events: ServerEvents;

  beforeEach(() => {
    FakeEventSource.instances = [];
    TestBed.configureTestingModule({
      providers: [
        { provide: EVENT_SOURCE_FACTORY, useValue: (url: string) => new FakeEventSource(url) },
      ],
    });
    events = TestBed.inject(ServerEvents);
  });

  it('traduz os eventos do servidor (/api/events)', () => {
    const received: ServerEvent[] = [];
    events.events().subscribe((event) => received.push(event));
    const source = FakeEventSource.instances[0];

    source.emit('open');
    source.emit('job', { jobId: 'j1' });
    source.emit('tools', { ready: true, installing: false, tools: [] });

    expect(source.url).toBe('/api/events');
    expect(received).toEqual([
      { type: 'open' },
      { type: 'job', jobId: 'j1' },
      { type: 'tools', status: { ready: true, installing: false, tools: [] } },
    ]);
  });

  it('compartilha uma única conexão e fecha quando ninguém mais escuta', () => {
    const a = events.events().subscribe();
    const b = events.events().subscribe();

    expect(FakeEventSource.instances).toHaveLength(1);
    a.unsubscribe();
    expect(FakeEventSource.instances[0].closed).toBe(false);
    b.unsubscribe();
    expect(FakeEventSource.instances[0].closed).toBe(true);
  });
});
