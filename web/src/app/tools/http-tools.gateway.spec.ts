import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { fakeServerEvents } from '../testing/fake-server-events';
import { HttpToolsGateway } from './http-tools.gateway';
import { ToolsStatus } from './tools.model';

const installing: ToolsStatus = {
  ready: false,
  installing: true,
  tools: [{ name: 'deno', state: 'downloading', receivedBytes: 10, totalBytes: 100 }],
};
const ready: ToolsStatus = { ready: true, installing: false, tools: [] };

describe('HttpToolsGateway', () => {
  let gateway: HttpToolsGateway;
  let http: HttpTestingController;
  let events: ReturnType<typeof fakeServerEvents>;

  beforeEach(() => {
    events = fakeServerEvents();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        events.provider,
        HttpToolsGateway,
      ],
    });
    gateway = TestBed.inject(HttpToolsGateway);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('busca o estado e acompanha o progresso pelos eventos', () => {
    const received: ToolsStatus[] = [];
    gateway.watchStatus().subscribe((status) => received.push(status));

    http.expectOne('/api/tools').flush(installing);
    events.emit({ type: 'tools', status: ready });
    events.emit({ type: 'job', jobId: 'j' });
    events.emit({ type: 'open' });
    http.expectOne('/api/tools').flush(ready);

    expect(received).toEqual([installing, ready, ready]);
  });

  it('pede a instalação das ferramentas', async () => {
    const done = gateway.install();

    const req = http.expectOne('/api/tools/install');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});
    req.flush(installing, { status: 202, statusText: 'Accepted' });

    await done;
  });
});
