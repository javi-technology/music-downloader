import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, posix, win32 } from "node:path";

export interface Settings {
  spotifyClientId?: string;
  spotifyClientSecret?: string;
  downloadDir: string;
}

export interface SpotifyCredentials {
  clientId: string;
  clientSecret: string;
}

/** O que o navegador pode ver: nunca inclui o client secret nem dados das credenciais embutidas. */
export interface PublicSettings {
  spotifyConfigured: boolean;
  /** O executável traz credenciais próprias: as do usuário são opcionais. */
  spotifyBuiltIn: boolean;
  spotifyClientId?: string;
  downloadDir: string;
}

export type SettingsUpdate = Partial<Settings>;

const APP_NAME = "Music Downloader";

/** Pasta de dados do app (banco, configurações, binários) e pasta padrão das músicas, por sistema. */
export function defaultPaths(system: {
  platform: NodeJS.Platform;
  home: string;
  env: Record<string, string | undefined>;
}): { dataDir: string; downloadDir: string } {
  const { platform, home, env } = system;
  if (platform === "win32") {
    return {
      dataDir: win32.join(
        env.APPDATA ?? win32.join(home, "AppData", "Roaming"),
        APP_NAME,
      ),
      downloadDir: win32.join(home, "Music", APP_NAME),
    };
  }
  const dataDir =
    platform === "darwin"
      ? posix.join(home, "Library", "Application Support", APP_NAME)
      : posix.join(
          env.XDG_DATA_HOME ?? posix.join(home, ".local", "share"),
          "music-downloader",
        );
  return { dataDir, downloadDir: posix.join(home, "Music", APP_NAME) };
}

/** Configurações em JSON na pasta de dados do usuário. */
export class SettingsStore {
  private current: Settings;
  private readonly builtIn?: SpotifyCredentials;

  constructor(
    private readonly file: string,
    defaults: { downloadDir: string },
    builtInSpotify?: SpotifyCredentials,
  ) {
    if (builtInSpotify?.clientId && builtInSpotify.clientSecret)
      this.builtIn = builtInSpotify;
    const saved = existsSync(file)
      ? (JSON.parse(readFileSync(file, "utf8")) as Partial<Settings>)
      : {};
    this.current = { ...defaults, ...saved };
  }

  get(): Settings {
    return { ...this.current };
  }

  /** As do usuário (completas) têm prioridade sobre as embutidas no executável. */
  spotifyCredentials(): SpotifyCredentials | undefined {
    const { spotifyClientId, spotifyClientSecret } = this.current;
    if (spotifyClientId && spotifyClientSecret)
      return { clientId: spotifyClientId, clientSecret: spotifyClientSecret };
    return this.builtIn;
  }

  publicView(): PublicSettings {
    const { spotifyClientId, downloadDir } = this.current;
    return {
      spotifyConfigured: this.spotifyCredentials() !== undefined,
      spotifyBuiltIn: this.builtIn !== undefined,
      ...(spotifyClientId ? { spotifyClientId } : {}),
      downloadDir,
    };
  }

  /** Campos ausentes mantêm o valor salvo (o navegador não conhece o secret). */
  update(changes: SettingsUpdate): void {
    const next = { ...this.current };
    for (const key of [
      "spotifyClientId",
      "spotifyClientSecret",
      "downloadDir",
    ] as const) {
      const value = changes[key]?.trim();
      if (value) next[key] = value;
    }
    if (!isAbsolute(next.downloadDir))
      throw new InvalidSettingsError(
        "A pasta de destino precisa ser um caminho absoluto",
      );

    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify(next, null, 2), { mode: 0o600 });
    chmodSync(this.file, 0o600);
    this.current = next;
  }
}

export class InvalidSettingsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidSettingsError";
  }
}
