import { homedir } from "node:os";
import { createInterface } from "node:readline";
import { getAsset, isSea } from "node:sea";
import { startLocalApp } from "./app.js";
import { isOurApp, launch, openBrowser } from "./launcher.js";
import { defaultPaths } from "./settings.js";
import { type WebAssets, directoryAssets, seaAssets } from "./web-assets.js";

/** Ponto de entrada do app local (`npm run local` e executável). Sem top-level await: o executável é CommonJS. */
const DEFAULT_PORT = 47823;

async function main(): Promise<void> {
  const { dataDir, downloadDir } = defaultPaths({
    platform: process.platform,
    home: homedir(),
    env: process.env,
  });
  const port = Number(process.env.MD_PORT ?? DEFAULT_PORT);
  const web = webAssets();

  const { app, url } = await launch({
    port,
    start: () =>
      startLocalApp({
        dataDir: process.env.MD_DATA_DIR ?? dataDir,
        defaultDownloadDir: downloadDir,
        port,
        allowedOrigins:
          process.env.MD_ALLOWED_ORIGINS?.split(",").filter(Boolean),
        web,
        // No executável, o esbuild troca essas leituras pelos valores dos secrets do build.
        builtInSpotify: {
          clientId: process.env.MUSIC_DOWNLOADER_SPOTIFY_CLIENT_ID ?? "",
          clientSecret:
            process.env.MUSIC_DOWNLOADER_SPOTIFY_CLIENT_SECRET ?? "",
        },
      }),
    isOurApp,
    // Sem o site (desenvolvimento com `ng serve`), não há o que abrir.
    openBrowser: (target) => {
      if (web && !process.env.MD_NO_BROWSER) openBrowser(target);
    },
  });

  if (!app) {
    console.log(`O Music Downloader já está aberto em ${url}`);
    return;
  }
  console.log(`Music Downloader rodando em ${url}`);
  if (isSea()) console.log("Deixe esta janela aberta. Para encerrar, feche-a.");

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      console.log("Encerrando...");
      void app.close().finally(() => process.exit(0));
    });
  }
}

/** No executável, o site vem embutido; fora dele, de `MD_WEB_DIR` (build do Angular), se definido. */
function webAssets(): WebAssets | undefined {
  if (isSea()) return seaAssets((key) => getAsset(key));
  const dir = process.env.MD_WEB_DIR;
  return dir ? directoryAssets(dir) : undefined;
}

main().catch(async (error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  // Aberto com dois cliques, a janela fecharia antes de dar para ler o erro.
  if (isSea() && process.stdin.isTTY) {
    const prompt = createInterface({ input: process.stdin });
    console.error("Pressione Enter para sair.");
    await new Promise((resolve) => prompt.once("line", resolve));
    prompt.close();
  }
  process.exit(1);
});
