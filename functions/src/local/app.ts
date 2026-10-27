import { mkdirSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import YTMusic from "ytmusic-api";
import { Id3Tagger } from "../adapters/id3-tagger.js";
import { YtDlpDownloader } from "../adapters/ytdlp-downloader.js";
import { YTMusicSearcher } from "../adapters/ytmusic-searcher.js";
import type { Song } from "../domain/types.js";
import type { SongSource } from "../jobs/types.js";
import { createDownloadJob, runTrack } from "../jobs/use-cases.js";
import {
  type ProcessTrackOutcome,
  processTrack,
} from "../pipeline/process-track.js";
import { SpotifyClient } from "../spotify/client.js";
import { ChangeFeed } from "./change-feed.js";
import {
  SpotifyNotConfiguredError,
  ToolsNotReadyError,
  createLocalServer,
} from "./http-server.js";
import { LocalFileStorage } from "./local-file-storage.js";
import { SettingsStore, type SpotifyCredentials } from "./settings.js";
import { SqliteJobRepository } from "./sqlite-job-repository.js";
import { TrackQueue, jobFolder } from "./track-queue.js";
import { type ToolSpec, toolCatalog } from "./tools/catalog.js";
import { extractTarXz } from "./tools/tar.js";
import { type ToolPaths, ToolManager } from "./tools/tool-manager.js";

/** O app local é de um único usuário: não há login. */
const LOCAL_OWNER = "local";

export interface LocalAppOptions {
  /** Banco, configurações e binários. */
  dataDir: string;
  defaultDownloadDir: string;
  port: number;
  allowedOrigins?: string[];
  /** Credenciais do Spotify embutidas no executável (as do usuário têm prioridade). */
  builtInSpotify?: SpotifyCredentials;
  /** Substituíveis em testes: fonte das faixas e processamento de uma faixa. */
  tools?: LocalTools;
  songSource?: (credentials: SpotifyCredentials) => SongSource;
  processSong?: (
    song: Song,
    destinationDir: string,
  ) => Promise<ProcessTrackOutcome>;
}

/** O que o app usa do `ToolManager` (substituível em testes). */
export type LocalTools = Pick<
  ToolManager,
  "status" | "install" | "updateYtDlpIfStale" | "paths"
>;

const YT_DLP_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface LocalApp {
  url: string;
  /** Resolve quando a fila não tiver mais faixas pendentes. */
  idle(): Promise<void>;
  close(): Promise<void>;
}

export async function startLocalApp(
  options: LocalAppOptions,
): Promise<LocalApp> {
  mkdirSync(options.dataDir, { recursive: true });
  const settings = new SettingsStore(
    join(options.dataDir, "settings.json"),
    { downloadDir: options.defaultDownloadDir },
    options.builtInSpotify,
  );
  const feed = new ChangeFeed();
  const db = new DatabaseSync(join(options.dataDir, "music-downloader.db"));
  const repository = new SqliteJobRepository(db, {
    onChange: (jobId) => feed.publish("job", { jobId }),
  });
  const tools =
    options.tools ??
    new ToolManager({
      binDir: join(options.dataDir, "bin"),
      catalog: catalogForThisSystem(),
      extractTarXz,
      onChange: (status) => feed.publish("tools", status),
    });

  const songSource = options.songSource ?? cachedSpotifyClient();
  const processSong =
    options.processSong ??
    downloadSong({
      tools: () => tools.paths(),
      downloadDir: () => settings.get().downloadDir,
    });

  const queue = new TrackQueue({
    repository,
    process: (track) =>
      runTrack(
        { ...track, destinationDir: jobFolder(track.jobTitle) },
        { repository, process: processSong },
      ),
    onError: (error, track) =>
      console.error(`Falha na faixa ${track.jobId}/${track.trackId}:`, error),
  });

  const server = createLocalServer({
    settings,
    tools,
    repository,
    feed,
    allowedOrigins: options.allowedOrigins,
    createJob: async (url) => {
      if (!tools.status().ready) throw new ToolsNotReadyError();
      const credentials = settings.spotifyCredentials();
      if (!credentials) throw new SpotifyNotConfiguredError();

      const created = await createDownloadJob(
        { ownerUid: LOCAL_OWNER, url },
        { songs: songSource(credentials), repository },
      );
      queue.notify();
      return created;
    },
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, "127.0.0.1", () => resolve());
  });
  queue.start();
  // Em segundo plano: o progresso chega ao navegador pelo evento SSE `tools`.
  const logToolError = (error: unknown) =>
    console.error("Falha ao preparar as ferramentas:", error);
  tools.install().catch(logToolError);
  tools.updateYtDlpIfStale(YT_DLP_MAX_AGE_MS).catch(logToolError);

  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    idle: () => queue.idle(),
    close: async () => {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      await queue.idle();
      db.close();
    },
  };
}

/** Reaproveita o cliente (e o token) enquanto as credenciais não mudam. */
function cachedSpotifyClient(): NonNullable<LocalAppOptions["songSource"]> {
  let cached: { key: string; client: SpotifyClient } | undefined;
  return (credentials) => {
    const key = `${credentials.clientId}:${credentials.clientSecret}`;
    if (cached?.key !== key)
      cached = { key, client: new SpotifyClient(credentials) };
    return cached.client;
  };
}

/** Pipeline real: YouTube Music → yt-dlp/ffmpeg → tags ID3 → pasta de músicas. */
function downloadSong(paths: {
  tools: () => ToolPaths;
  downloadDir: () => string;
}): NonNullable<LocalAppOptions["processSong"]> {
  const searcher = new YTMusicSearcher(new YTMusic());
  const tagger = new Id3Tagger();
  const storage = new LocalFileStorage(paths.downloadDir);

  return async (song, destinationDir) => {
    const workDir = await mkdtemp(join(tmpdir(), "md-"));
    const tools = paths.tools();
    try {
      return await processTrack(song, destinationDir, {
        searcher,
        downloader: new YtDlpDownloader({
          ytDlpPath: tools.ytDlp,
          ffmpegPath: tools.ffmpeg,
          denoPath: tools.deno,
        }),
        tagger,
        storage,
        workDir,
      });
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  };
}

/** Em sistemas sem binários conhecidos, o app usa só o que estiver instalado no sistema. */
function catalogForThisSystem(): ToolSpec[] {
  try {
    return toolCatalog(process.platform, process.arch);
  } catch (error) {
    console.error(error);
    return [];
  }
}
