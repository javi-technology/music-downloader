import { existsSync } from "node:fs";
import { posix, win32 } from "node:path";

const ENV_VARS = {
  "yt-dlp": "YT_DLP_PATH",
  ffmpeg: "FFMPEG_PATH",
  deno: "DENO_PATH",
} as const;

export type BinaryName = keyof typeof ENV_VARS;

/** Nome do arquivo executável no sistema (`.exe` no Windows). */
export function executableName(
  name: string,
  platform: NodeJS.Platform = process.platform,
): string {
  return platform === "win32" ? `${name}.exe` : name;
}

/**
 * Resolve o caminho do binário: variável de ambiente → `binDir` (baixado pelo app ou no deploy)
 * → PATH do sistema.
 *
 * O caminho é sempre absoluto quando encontrado: o `--ffmpeg-location` do yt-dlp não busca
 * no PATH, então o nome puro (`ffmpeg`) só é devolvido quando o binário não existe.
 */
export function resolveBinary(
  name: BinaryName,
  options: {
    env?: Record<string, string | undefined>;
    binDir: string;
    platform?: NodeJS.Platform;
    exists?: (path: string) => boolean;
  },
): string {
  const env = options.env ?? process.env;
  const fromEnv = env[ENV_VARS[name]];
  if (fromEnv) return fromEnv;

  const platform = options.platform ?? process.platform;
  const path = platform === "win32" ? win32 : posix;
  const file = executableName(name, platform);
  const exists = options.exists ?? existsSync;
  const candidates = [options.binDir, ...(env.PATH ?? "").split(path.delimiter)]
    .filter(Boolean)
    .map((dir) => path.join(dir, file));
  return candidates.find(exists) ?? file;
}
