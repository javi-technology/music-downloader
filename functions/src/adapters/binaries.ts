import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";

const ENV_VARS = { "yt-dlp": "YT_DLP_PATH", ffmpeg: "FFMPEG_PATH" } as const;

export type BinaryName = keyof typeof ENV_VARS;

/**
 * Resolve o caminho do binário: variável de ambiente → `bin/` (baixado no deploy pelo
 * script `gcp-build`) → PATH do sistema (desenvolvimento local).
 *
 * O caminho é sempre absoluto quando encontrado: o `--ffmpeg-location` do yt-dlp não busca
 * no PATH, então o nome puro (`ffmpeg`) só é devolvido quando o binário não existe.
 */
export function resolveBinary(
  name: BinaryName,
  options: {
    env?: Record<string, string | undefined>;
    binDir: string;
    exists?: (path: string) => boolean;
  },
): string {
  const env = options.env ?? process.env;
  const fromEnv = env[ENV_VARS[name]];
  if (fromEnv) return fromEnv;

  const exists = options.exists ?? existsSync;
  const candidates = [options.binDir, ...(env.PATH ?? "").split(delimiter)]
    .filter(Boolean)
    .map((dir) => join(dir, name));
  return candidates.find(exists) ?? name;
}
