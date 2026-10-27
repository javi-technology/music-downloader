/** Espelha `PublicSettings` do servidor: o client secret nunca chega ao navegador. */
export interface AppSettings {
  spotifyConfigured: boolean;
  /** O executável traz credenciais próprias: as do usuário são opcionais. */
  spotifyBuiltIn: boolean;
  /** Presente só quando o usuário salvou credenciais próprias. */
  spotifyClientId?: string;
  downloadDir: string;
}

/** Campos vazios ou ausentes mantêm o valor salvo. */
export interface SettingsUpdate {
  spotifyClientId?: string;
  spotifyClientSecret?: string;
  downloadDir?: string;
}
