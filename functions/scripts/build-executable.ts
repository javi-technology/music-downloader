/**
 * Gera o executável do app local para o sistema atual (Node SEA):
 *   1. build do Angular (pule com --skip-web);
 *   2. bundle CommonJS do servidor com esbuild, embutindo as credenciais do Spotify se houver;
 *   3. `node --build-sea` com o site como asset (requer Node >= 25.5);
 *   4. no macOS, assinatura ad-hoc (sem ela o sistema mata o processo).
 *
 * Uso: `npm run build:executable` (lê `MUSIC_DOWNLOADER_SPOTIFY_*` do ambiente ou de `.secret.local`).
 */
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import {
  releaseAssetName,
  seaConfig,
  spotifyDefines,
} from "../src/build/executable.ts";

const functionsDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const webDir = join(functionsDir, "..", "web");
const webBuild = join(webDir, "dist", "web", "browser");
const outDir = join(functionsDir, "dist-exe");

const run = (command: string, args: string[], cwd = functionsDir) =>
  execFileSync(command, args, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

if (!process.argv.includes("--skip-web")) run("npm", ["run", "build"], webDir);

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const spotify = spotifyDefines(process.env);
const main = join(outDir, "main.cjs");
await build({
  entryPoints: [join(functionsDir, "src", "local", "main.ts")],
  outfile: main,
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  define: spotify.define,
  legalComments: "none",
  logLevel: "warning",
});

const output = join(outDir, releaseAssetName(process.platform, process.arch));
const webFiles = readdirSync(webBuild, { recursive: true, encoding: "utf8" })
  .filter((file) => statSync(join(webBuild, file)).isFile());
const configFile = join(outDir, "sea-config.json");
writeFileSync(
  configFile,
  JSON.stringify(
    seaConfig({ main, output, webDir: webBuild, webFiles }),
    null,
    2,
  ),
);

run(process.execPath, ["--build-sea", configFile]);
if (process.platform === "darwin")
  run("codesign", ["--sign", "-", "--force", output]);

const sizeMb = (statSync(output).size / 1024 / 1024).toFixed(0);
console.log(`\nExecutável: ${output} (${sizeMb} MB)`);
console.log(
  spotify.embedded
    ? "Credenciais do Spotify embutidas."
    : "AVISO: sem credenciais do Spotify embutidas; o usuário terá de configurá-las.",
);
