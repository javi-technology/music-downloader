/**
 * Identificadores de todos os recursos do sistema no projeto Firebase
 * compartilhado `javitech-8797d`. Nada fora daqui deve usar recursos default.
 */
export const APP_ID = "music-downloader";

export const REGION = "southamerica-east1";

export const FIRESTORE_DATABASE_ID = APP_ID;

export const STORAGE_BUCKET = `javitech-8797d-${APP_ID}`;
export const STORAGE_PREFIX = APP_ID;

export const FUNCTION_PREFIX = "md";

export const COLLECTIONS = {
  jobs: "downloadJobs",
} as const;

export const SECRET_NAMES = {
  spotifyClientId: "MUSIC_DOWNLOADER_SPOTIFY_CLIENT_ID",
  spotifyClientSecret: "MUSIC_DOWNLOADER_SPOTIFY_CLIENT_SECRET",
} as const;

export function storagePath(...segments: string[]): string {
  return [STORAGE_PREFIX, ...segments].join("/");
}
