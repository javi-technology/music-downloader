import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { basename } from "node:path";
import { attachmentDisposition } from "../http/content-disposition.js";
import { EmptySourceError, TooManyTracksError } from "../jobs/use-cases.js";
import { InvalidSpotifyUrlError } from "../spotify/url.js";
import type { ChangeFeed } from "./change-feed.js";
import {
  InvalidSettingsError,
  type PublicSettings,
  type SettingsUpdate,
} from "./settings.js";
import type { JobView, TrackView } from "./sqlite-job-repository.js";
import type { ToolsStatus } from "./tools/tool-manager.js";

export class SpotifyNotConfiguredError extends Error {
  constructor() {
    super("Configure as credenciais do Spotify antes de baixar");
    this.name = "SpotifyNotConfiguredError";
  }
}

export class ToolsNotReadyError extends Error {
  constructor() {
    super(
      "As ferramentas de download (yt-dlp, ffmpeg e deno) ainda não estão instaladas",
    );
    this.name = "ToolsNotReadyError";
  }
}

export interface LocalServerDeps {
  settings: {
    publicView(): PublicSettings;
    update(changes: SettingsUpdate): void;
  };
  tools: {
    status(): ToolsStatus;
    install(): Promise<void>;
  };
  repository: {
    listJobs(): JobView[];
    getJob(jobId: string): JobView | undefined;
    listTracks(jobId: string): TrackView[];
    getTrack(jobId: string, trackId: string): TrackView | undefined;
  };
  createJob(url: string): Promise<{ jobId: string; totalTracks: number }>;
  feed: ChangeFeed;
  /** Origens extras aceitas além da própria (ex.: `ng serve` em desenvolvimento). */
  allowedOrigins?: string[];
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const MAX_BODY_BYTES = 64 * 1024;
const LOCAL_HOSTS = ["127.0.0.1", "localhost"];
const SETTINGS_FIELDS = [
  "spotifyClientId",
  "spotifyClientSecret",
  "downloadDir",
] as const;

/** API do app local. Só atende o próprio computador: confere `Host` e `Origin` em toda requisição. */
export function createLocalServer(deps: LocalServerDeps): Server {
  return createServer((req, res) => {
    handle(req, res, deps).catch((error: unknown) => {
      const { status, message } = toHttpError(error);
      if (res.headersSent) res.destroy();
      else sendJson(res, status, { error: message });
    });
  });
}

async function handle(
  req: IncomingMessage,
  res: ServerResponse,
  deps: LocalServerDeps,
): Promise<void> {
  checkOrigin(req, deps.allowedOrigins ?? []);

  const method = req.method ?? "GET";
  // Exigir JSON obriga um preflight CORS em chamadas de outros sites, que este servidor não autoriza.
  if (
    method !== "GET" &&
    !req.headers["content-type"]?.startsWith("application/json")
  )
    throw new HttpError(415, "Envie o corpo em JSON");

  const path = new URL(req.url ?? "/", "http://localhost").pathname;
  const segments = path.split("/").filter(Boolean).map(decodeURIComponent);
  if (segments[0] !== "api") throw new HttpError(404, "Não encontrado");
  const route = segments.slice(1);

  if (route[0] === "settings" && route.length === 1) {
    if (method === "GET") return sendJson(res, 200, deps.settings.publicView());
    if (method === "PUT") {
      const body = await readJson(req);
      const changes: SettingsUpdate = {};
      for (const field of SETTINGS_FIELDS)
        if (typeof body[field] === "string") changes[field] = body[field];
      deps.settings.update(changes);
      return sendJson(res, 200, deps.settings.publicView());
    }
  }

  if (route[0] === "tools") {
    if (route.length === 1 && method === "GET")
      return sendJson(res, 200, deps.tools.status());
    if (route.length === 2 && route[1] === "install" && method === "POST") {
      // Pode levar minutos: o progresso chega pelo evento SSE `tools`.
      deps.tools.install().catch((error: unknown) => console.error(error));
      return sendJson(res, 202, deps.tools.status());
    }
  }

  if (route[0] === "events" && route.length === 1 && method === "GET")
    return streamEvents(req, res, deps.feed);

  if (route[0] === "jobs") {
    if (route.length === 1 && method === "GET")
      return sendJson(res, 200, deps.repository.listJobs());
    if (route.length === 1 && method === "POST") {
      const { url } = await readJson(req);
      if (typeof url !== "string" || !url.trim())
        throw new HttpError(400, "Informe a URL do Spotify");
      return sendJson(res, 201, await createJob(deps, url));
    }

    const job = route[1] ? deps.repository.getJob(route[1]) : undefined;
    if (method === "GET" && job) {
      if (route.length === 2) return sendJson(res, 200, job);
      if (route.length === 3 && route[2] === "tracks")
        return sendJson(res, 200, deps.repository.listTracks(job.id));
      if (route.length === 5 && route[2] === "tracks" && route[4] === "file")
        return sendTrackFile(res, deps.repository.getTrack(job.id, route[3]));
    }
  }

  throw new HttpError(404, "Não encontrado");
}

/**
 * `Host` local barra DNS rebinding (um site que aponta o próprio domínio para 127.0.0.1);
 * `Origin` barra páginas de outros sites chamando a API pelo navegador do usuário.
 */
function checkOrigin(req: IncomingMessage, allowedOrigins: string[]): void {
  const port = req.socket.localPort;
  const own = LOCAL_HOSTS.map((host) => `${host}:${port}`);

  if (!own.includes(req.headers.host ?? ""))
    throw new HttpError(403, "Acesso permitido apenas pelo próprio computador");

  const origin = req.headers.origin;
  if (
    origin !== undefined &&
    !own.some((host) => origin === `http://${host}`) &&
    !allowedOrigins.includes(origin)
  )
    throw new HttpError(403, "Origem não permitida");
}

async function readJson(
  req: IncomingMessage,
): Promise<Record<string, unknown>> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, "Corpo muito grande");
    chunks.push(chunk);
  }
  try {
    const value: unknown = JSON.parse(
      Buffer.concat(chunks).toString("utf8") || "{}",
    );
    if (typeof value !== "object" || value === null || Array.isArray(value))
      throw new Error();
    return value as Record<string, unknown>;
  } catch {
    throw new HttpError(400, "JSON inválido");
  }
}

/** Erros sem tradução de domínio na criação vêm do Spotify (rede, credenciais, API). */
async function createJob(
  deps: LocalServerDeps,
  url: string,
): Promise<{ jobId: string; totalTracks: number }> {
  try {
    return await deps.createJob(url);
  } catch (error) {
    if (isDomainError(error)) throw error;
    console.error(error);
    throw new HttpError(
      502,
      "Não foi possível consultar o Spotify. Confira as credenciais e tente de novo.",
    );
  }
}

async function sendTrackFile(
  res: ServerResponse,
  track: TrackView | undefined,
): Promise<void> {
  const path = track?.status === "done" ? track.storagePath : undefined;
  const info = path ? await stat(path).catch(() => undefined) : undefined;
  if (!path || !info?.isFile())
    throw new HttpError(404, "Arquivo não encontrado");

  res.writeHead(200, {
    "Content-Type": "audio/mpeg",
    "Content-Length": info.size,
    "Content-Disposition": attachmentDisposition(basename(path)),
  });
  createReadStream(path).pipe(res);
}

function streamEvents(
  req: IncomingMessage,
  res: ServerResponse,
  feed: ChangeFeed,
): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.write(": conectado\n\n");

  const unsubscribe = feed.subscribe((event, data) =>
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
  );
  // Mantém a conexão viva atrás de proxies e detecta navegadores que sumiram.
  const heartbeat = setInterval(() => res.write(": ping\n\n"), 25_000);
  heartbeat.unref();
  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

const DOMAIN_ERRORS = [
  [InvalidSpotifyUrlError, 400],
  [InvalidSettingsError, 400],
  [EmptySourceError, 404],
  [SpotifyNotConfiguredError, 409],
  [ToolsNotReadyError, 409],
  [TooManyTracksError, 422],
] as const;

function isDomainError(error: unknown): boolean {
  return DOMAIN_ERRORS.some(([type]) => error instanceof type);
}

function toHttpError(error: unknown): HttpError {
  if (error instanceof HttpError) return error;
  const known = DOMAIN_ERRORS.find(([type]) => error instanceof type);
  if (known) return new HttpError(known[1], (error as Error).message);
  console.error(error);
  return new HttpError(500, "Erro interno");
}
