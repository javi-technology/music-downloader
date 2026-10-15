import { homedir } from "node:os";
import { startLocalApp } from "./app.js";
import { defaultPaths } from "./settings.js";

/** Ponto de entrada do app local. */
const DEFAULT_PORT = 47823;

const { dataDir, downloadDir } = defaultPaths({
  platform: process.platform,
  home: homedir(),
  env: process.env,
});

const app = await startLocalApp({
  dataDir: process.env.MD_DATA_DIR ?? dataDir,
  defaultDownloadDir: downloadDir,
  port: Number(process.env.MD_PORT ?? DEFAULT_PORT),
  allowedOrigins: process.env.MD_ALLOWED_ORIGINS?.split(",").filter(Boolean),
});

console.log(`Music Downloader rodando em ${app.url}`);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    console.log("Encerrando...");
    void app.close().finally(() => process.exit(0));
  });
}
