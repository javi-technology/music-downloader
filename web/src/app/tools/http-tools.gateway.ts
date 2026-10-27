import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, filter, firstValueFrom, map, merge, startWith } from 'rxjs';
import { apiError } from '../core/api-error';
import { fetchOn } from '../core/fetch-on';
import { ServerEvents } from '../core/server-events';
import { ToolsGateway } from './tools.gateway';
import { ToolsStatus } from './tools.model';

@Injectable()
export class HttpToolsGateway extends ToolsGateway {
  private readonly http = inject(HttpClient);
  private readonly events = inject(ServerEvents);

  watchStatus(): Observable<ToolsStatus> {
    const events = this.events.events();
    // Busca na entrada e a cada reconexão; no meio tempo o progresso chega pelo evento `tools`.
    const fetched = fetchOn(
      events.pipe(
        filter((event) => event.type === 'open'),
        startWith(null),
      ),
      () => this.http.get<ToolsStatus>('/api/tools'),
    );
    const pushed = events.pipe(
      filter((event) => event.type === 'tools'),
      map((event) => event.status),
    );
    return merge(fetched, pushed);
  }

  async install(): Promise<void> {
    try {
      await firstValueFrom(this.http.post('/api/tools/install', {}));
    } catch (error) {
      throw apiError(error);
    }
  }
}
