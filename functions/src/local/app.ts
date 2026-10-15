import { mkdirSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import YTMusic from "ytmusic-api";
import { resolveBinary } from "../adapters/binaries.js";
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
import { SpotifyNotConfiguredError, createLocalServer } from "./http-server.js";
import { LocalFileStorage } from "./local-file-storage.js";
import { SettingsStore } from "./settings.js";
import { SqliteJobRepository } from "./sqlite-job-repository.js";
import { TrackQueue, jobFolder } from "./track-queue.js";

/** O app local é de um único usuário: não há login. */
const LOCAL_OWNER = "local";

export interface LocalAppOptions {
  /** Banco, configurações e binários. */
  dataDir: string;
  defaultDownloadDir: string;
  port: number;
  allowedOrigins?: string[];
  /** Substituíveis em testes: fonte das faixas e processamento de uma faixa. */
  songSource?: (credentials: {
    clientId: string;
    clientSecret: string;
  }) => SongSource;
  processSong?: (
    song: Song,
    destinationDir: string,
  ) => Promise<ProcessTrackOutcome>;
}

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
  const settings = new SettingsStore(join(options.dataDir, "settings.json"), {
    downloadDir: options.defaultDownloadDir,
  });
  const feed = new ChangeFeed();
  const db = new DatabaseSync(join(options.dataDir, "music-downloader.db"));
  const repository = new SqliteJobRepository(db, {
    onChange: (jobId) => feed.publish(jobId),
  });

  const songSource = options.songSource ?? cachedSpotifyClient();
  const processSong =
    options.processSong ??
    downloadSong({
      binDir: join(options.dataDir, "bin"),
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
    repository,
    feed,
    allowedOrigins: options.allowedOrigins,
    createJob: async (url) => {
      const { spotifyClientId, spotifyClientSecret } = settings.get();
      if (!spotifyClientId || !spotifyClientSecret)
        throw new SpotifyNotConfiguredError();

      const created = await createDownloadJob(
        { ownerUid: LOCAL_OWNER, url },
        {
          songs: songSource({
            clientId: spotifyClientId,
            clientSecret: spotifyClientSecret,
          }),
          repository,
        },
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
  binDir: string;
  downloadDir: () => string;
}): NonNullable<LocalAppOptions["processSong"]> {
  const searcher = new YTMusicSearcher(new YTMusic());
  const tagger = new Id3Tagger();
  const storage = new LocalFileStorage(paths.downloadDir);

  return async (song, destinationDir) => {
    const workDir = await mkdtemp(join(tmpdir(), "md-"));
    try {
      return await processTrack(song, destinationDir, {
        searcher,
        downloader: new YtDlpDownloader({
          ytDlpPath: resolveBinary("yt-dlp", { binDir: paths.binDir }),
          ffmpegPath: resolveBinary("ffmpeg", { binDir: paths.binDir }),
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
