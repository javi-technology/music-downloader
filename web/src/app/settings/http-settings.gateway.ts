import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, Subject, filter, firstValueFrom, merge, startWith } from 'rxjs';
import { apiError } from '../core/api-error';
import { fetchOn } from '../core/fetch-on';
import { ServerEvents } from '../core/server-events';
import { SettingsGateway } from './settings.gateway';
import { AppSettings, SettingsUpdate } from './settings.model';

@Injectable()
export class HttpSettingsGateway extends SettingsGateway {
  private readonly http = inject(HttpClient);
  private readonly events = inject(ServerEvents);
  private readonly saved = new Subject<AppSettings>();

  watchSettings(): Observable<AppSettings> {
    // Busca na entrada e a cada reconexão (o app pode ter reiniciado).
    const fetched = fetchOn(
      this.events.events().pipe(
        filter((event) => event.type === 'open'),
        startWith(null),
      ),
      () => this.http.get<AppSettings>('/api/settings'),
    );
    return merge(fetched, this.saved);
  }

  async save(update: SettingsUpdate): Promise<AppSettings> {
    const body = Object.fromEntries(
      Object.entries(update).filter(([, value]) => typeof value === 'string' && value.trim()),
    );
    try {
      const settings = await firstValueFrom(this.http.put<AppSettings>('/api/settings', body));
      this.saved.next(settings);
      return settings;
    } catch (error) {
      throw apiError(error);
    }
  }
}
