import { spawn } from "node:child_process";

export class PortInUseError extends Error {
  constructor(port: number) {
    super(
      `A porta ${port} está ocupada por outro programa. Feche-o ou defina outra porta em MD_PORT.`,
    );
    this.name = "PortInUseError";
  }
}

export function browserCommand(
  platform: NodeJS.Platform,
  url: string,
): { command: string; args: string[] } {
  if (platform === "darwin") return { command: "open", args: [url] };
  // O primeiro argumento entre aspas do `start` é o título da janela.
  if (platform === "win32")
    return { command: "cmd", args: ["/c", "start", '""', url] };
  return { command: "xdg-open", args: [url] };
}

/** Abre a URL no navegador padrão sem esperar nem prender o processo. */
export function openBrowser(url: string): void {
  const { command, args } = browserCommand(process.platform, url);
  const child = spawn(command, args, {
    detached: true,
    stdio: "ignore",
    windowsVerbatimArguments: process.platform === "win32",
  });
  child.on("error", (error) =>
    console.error(`Não foi possível abrir o navegador (${url}):`, error),
  );
  child.unref();
}

/** Responde se quem atende na URL é este app (`GET /api/health`). */
export async function isOurApp(url: string): Promise<boolean> {
  try {
    const reply = await fetch(`${url}/api/health`, {
      signal: AbortSignal.timeout(2000),
    });
    const body = (await reply.json()) as { app?: unknown };
    return body.app === "music-downloader";
  } catch {
    return false;
  }
}

export interface LaunchDeps<App extends { url: string }> {
  port: number;
  start(): Promise<App>;
  isOurApp(url: string): Promise<boolean>;
  openBrowser(url: string): void;
}

/** Sobe o app e abre o navegador; se o app já estiver aberto na porta, só abre o navegador nele. */
export async function launch<App extends { url: string }>(
  deps: LaunchDeps<App>,
): Promise<{ app?: App; url: string }> {
  let app: App;
  try {
    app = await deps.start();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EADDRINUSE") throw error;
    const url = `http://127.0.0.1:${deps.port}`;
    if (!(await deps.isOurApp(url))) throw new PortInUseError(deps.port);
    show(deps, url);
    return { url };
  }
  show(deps, app.url);
  return { app, url: app.url };
}

function show(deps: { openBrowser(url: string): void }, url: string): void {
  try {
    deps.openBrowser(url);
  } catch (error) {
    console.error(`Não foi possível abrir o navegador (${url}):`, error);
  }
}
