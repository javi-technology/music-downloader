import { describe, expect, it } from "vitest";
import {
  APP_ID,
  COLLECTIONS,
  FIRESTORE_DATABASE_ID,
  FUNCTION_PREFIX,
  REGION,
  SECRET_NAMES,
  STORAGE_BUCKET,
  STORAGE_PREFIX,
  storagePath,
} from "./config.js";

describe("config — isolamento no projeto compartilhado", () => {
  it("usa um database Firestore nomeado exclusivo do sistema", () => {
    expect(APP_ID).toBe("music-downloader");
    expect(FIRESTORE_DATABASE_ID).toBe("music-downloader");
    expect(FIRESTORE_DATABASE_ID).not.toBe("(default)");
  });

  it("usa um bucket dedicado e prefixo próprio no Storage", () => {
    expect(STORAGE_BUCKET).toBe("javitech-8797d-music-downloader");
    expect(STORAGE_PREFIX).toBe("music-downloader");
    expect(storagePath("tracks", "abc.mp3")).toBe(
      "music-downloader/tracks/abc.mp3",
    );
  });

  it("prefixa coleções, funções e secrets com o identificador do sistema", () => {
    expect(COLLECTIONS.jobs).toBe("downloadJobs");
    expect(FUNCTION_PREFIX).toBe("md");
    expect(
      Object.values(SECRET_NAMES).every((s) =>
        s.startsWith("MUSIC_DOWNLOADER_"),
      ),
    ).toBe(true);
  });

  it("roda na região de São Paulo", () => {
    expect(REGION).toBe("southamerica-east1");
  });
});
