import { join } from "node:path";

/** Configuração do executável (Node SEA): usada por `scripts/build-executable.ts`. */

const SPOTIFY_ENV = [
  "MUSIC_DOWNLOADER_SPOTIFY_CLIENT_ID",
  "MUSIC_DOWNLOADER_SPOTIFY_CLIENT_SECRET",
] as const;

const SYSTEM_NAMES: Partial<Record<NodeJS.Platform, string>> = {
  darwin: "macos",
  win32: "windows",
  linux: "linux",
};

/** Nome do arquivo publicado no release, ex.: `music-downloader-macos-arm64`. */
export function releaseAssetName(
  platform: NodeJS.Platform,
  arch: string,
): string {
  const system = SYSTEM_NAMES[platform] ?? platform;
  return `music-downloader-${system}-${arch}${platform === "win32" ? ".exe" : ""}`;
}

export interface SeaConfig {
  main: string;
  output: string;
  disableExperimentalSEAWarning: true;
  useSnapshot: false;
  useCodeCache: false;
  assets: Record<string, string>;
}

/** Cada arquivo do build do Angular vira o asset `web/<caminho>` (lido por `seaAssets`). */
export function seaConfig(options: {
  main: string;
  output: string;
  webDir: string;
  webFiles: string[];
}): SeaConfig {
  const files = options.webFiles.map((file) => file.replaceAll("\\", "/"));
  if (!files.includes("index.html"))
    throw new Error(
      `index.html não encontrado em ${options.webDir}: rode o build do web antes`,
    );

  return {
    main: options.main,
    output: options.output,
    disableExperimentalSEAWarning: true,
    useSnapshot: false,
    useCodeCache: false,
    assets: Object.fromEntries(
      files.map((file) => [`web/${file}`, join(options.webDir, file)]),
    ),
  };
}

/** `define` do esbuild que embute as credenciais do Spotify, só quando as duas existem. */
export function spotifyDefines(env: Record<string, string | undefined>): {
  embedded: boolean;
  define: Record<string, string>;
} {
  if (!SPOTIFY_ENV.every((name) => env[name]))
    return { embedded: false, define: {} };
  return {
    embedded: true,
    define: Object.fromEntries(
      SPOTIFY_ENV.map((name) => [
        `process.env.${name}`,
        JSON.stringify(env[name]),
      ]),
    ),
  };
}
