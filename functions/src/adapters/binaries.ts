import { existsSync } from "node:fs";
import { join } from "node:path";

const ENV_VARS = { "yt-dlp": "YT_DLP_PATH", ffmpeg: "FFMPEG_PATH" } as const;

export type BinaryName = keyof typeof ENV_VARS;

/**
 * Resolve o caminho do binário: variável de ambiente → `bin/` (baixado no deploy pelo
 * script `gcp-build`) → PATH do sistema (desenvolvimento local).
 */
export function resolveBinary(
  name: BinaryName,
  options: {
    env?: Record<string, string | undefined>;
    binDir: string;
    exists?: (path: string) => boolean;
  },
): string {
  const fromEnv = (options.env ?? process.env)[ENV_VARS[name]];
  if (fromEnv) return fromEnv;

  const bundled = join(options.binDir, name);
  return (options.exists ?? existsSync)(bundled) ? bundled : name;
}
