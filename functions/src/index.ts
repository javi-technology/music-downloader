import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { setGlobalOptions } from "firebase-functions/v2";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import YTMusic from "ytmusic-api";
import { resolveBinary } from "./adapters/binaries.js";
import {
  FirestoreJobRepository,
  TRACKS_SUBCOLLECTION,
} from "./adapters/firestore-job-repository.js";
import { GcsFileStorage } from "./adapters/gcs-file-storage.js";
import { Id3Tagger } from "./adapters/id3-tagger.js";
import { YtDlpDownloader } from "./adapters/ytdlp-downloader.js";
import { YTMusicSearcher } from "./adapters/ytmusic-searcher.js";
import {
  COLLECTIONS,
  FIRESTORE_DATABASE_ID,
  REGION,
  SECRET_NAMES,
  STORAGE_BUCKET,
  storagePath,
} from "./config.js";
import type { Song } from "./domain/types.js";
import { toHttpsError } from "./http/errors.js";
import { createDownloadJob, runTrack } from "./jobs/use-cases.js";
import { processTrack } from "./pipeline/process-track.js";
import { SpotifyClient } from "./spotify/client.js";

// Todas as funções exportadas DEVEM usar o prefixo `md` (ver config.FUNCTION_PREFIX).
setGlobalOptions({ region: REGION, maxInstances: 10 });

const app = initializeApp();
const db = getFirestore(app, FIRESTORE_DATABASE_ID);
const repository = new FirestoreJobRepository(db);

const spotifyClientId = defineSecret(SECRET_NAMES.spotifyClientId);
const spotifyClientSecret = defineSecret(SECRET_NAMES.spotifyClientSecret);

const binDir = join(dirname(fileURLToPath(import.meta.url)), "..", "bin");

export const mdCreateDownloadJob = onCall(
  { secrets: [spotifyClientId, spotifyClientSecret] },
  async (request) => {
    if (!request.auth)
      throw new HttpsError("unauthenticated", "É necessário estar autenticado");

    const url = (request.data as { url?: unknown } | undefined)?.url;
    if (typeof url !== "string")
      throw new HttpsError("invalid-argument", "Informe a URL do Spotify");

    try {
      const songs = new SpotifyClient({
        clientId: spotifyClientId.value(),
        clientSecret: spotifyClientSecret.value(),
      });
      return await createDownloadJob(
        { ownerUid: request.auth.uid, url },
        { songs, repository },
      );
    } catch (error) {
      throw toHttpsError(error);
    }
  },
);

export const mdProcessTrack = onDocumentCreated(
  {
    document: `${COLLECTIONS.jobs}/{jobId}/${TRACKS_SUBCOLLECTION}/{trackId}`,
    database: FIRESTORE_DATABASE_ID,
    memory: "1GiB",
    cpu: 1,
    concurrency: 1,
    timeoutSeconds: 540,
  },
  async (event) => {
    const data = event.data?.data() as
      { ownerUid: string; song: Song } | undefined;
    if (!data) return;

    const { jobId, trackId } = event.params;
    const workDir = await mkdtemp(join(tmpdir(), "md-"));
    try {
      await runTrack(
        {
          jobId,
          trackId,
          song: data.song,
          destinationDir: storagePath("users", data.ownerUid, jobId),
        },
        {
          repository,
          process: (song, destinationDir) =>
            processTrack(song, destinationDir, {
              searcher: new YTMusicSearcher(new YTMusic()),
              downloader: new YtDlpDownloader({
                ytDlpPath: resolveBinary("yt-dlp", { binDir }),
                ffmpegPath: resolveBinary("ffmpeg", { binDir }),
              }),
              tagger: new Id3Tagger(),
              storage: new GcsFileStorage(
                getStorage(app).bucket(STORAGE_BUCKET),
              ),
              workDir,
            }),
        },
      );
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  },
);
