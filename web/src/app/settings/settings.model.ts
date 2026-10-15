/** Espelha `PublicSettings` do servidor: o client secret nunca chega ao navegador. */
export interface AppSettings {
  spotifyConfigured: boolean;
  spotifyClientId?: string;
  downloadDir: string;
}

/** Campos vazios ou ausentes mantêm o valor salvo. */
export interface SettingsUpdate {
  spotifyClientId?: string;
  spotifyClientSecret?: string;
  downloadDir?: string;
}
