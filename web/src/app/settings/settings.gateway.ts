import { Observable } from 'rxjs';
import { AppSettings, SettingsUpdate } from './settings.model';

export abstract class SettingsGateway {
  /** Configurações atuais, reemitidas sempre que forem salvas. */
  abstract watchSettings(): Observable<AppSettings>;
  abstract save(update: SettingsUpdate): Promise<AppSettings>;
}
