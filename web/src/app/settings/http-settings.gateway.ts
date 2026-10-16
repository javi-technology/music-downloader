import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, Subject, firstValueFrom, merge } from 'rxjs';
import { apiError } from '../core/api-error';
import { SettingsGateway } from './settings.gateway';
import { AppSettings, SettingsUpdate } from './settings.model';

@Injectable()
export class HttpSettingsGateway extends SettingsGateway {
  private readonly http = inject(HttpClient);
  private readonly saved = new Subject<AppSettings>();

  watchSettings(): Observable<AppSettings> {
    return merge(this.http.get<AppSettings>('/api/settings'), this.saved);
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
