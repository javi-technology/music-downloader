import { describe, expect, it, vi } from "vitest";
import { GcsFileStorage } from "./gcs-file-storage.js";

describe("GcsFileStorage", () => {
  it("envia o MP3 com token de download do Firebase (exigido pelo getDownloadURL do SDK web)", async () => {
    const bucket = { upload: vi.fn().mockResolvedValue(undefined) };
    await new GcsFileStorage(bucket, { newToken: () => "token-fixo" }).upload(
      "/tmp/a.mp3",
      "music-downloader/users/u/j/000/a.mp3",
    );

    expect(bucket.upload).toHaveBeenCalledWith("/tmp/a.mp3", {
      destination: "music-downloader/users/u/j/000/a.mp3",
      contentType: "audio/mpeg",
      resumable: false,
      metadata: {
        contentDisposition: `attachment; filename="a.mp3"; filename*=UTF-8''a.mp3`,
        metadata: { firebaseStorageDownloadTokens: "token-fixo" },
      },
    });
  });

  it("faz o navegador salvar o arquivo só com o nome da música, mesmo com acentos", async () => {
    const bucket = { upload: vi.fn().mockResolvedValue(undefined) };
    await new GcsFileStorage(bucket).upload(
      "/tmp/a.mp3",
      "music-downloader/users/u/j/000/De Toda Cor (Ação).mp3",
    );

    const [, options] = bucket.upload.mock.calls[0];
    expect(options.metadata.contentDisposition).toBe(
      `attachment; filename="De Toda Cor (A__o).mp3"; filename*=UTF-8''De%20Toda%20Cor%20%28A%C3%A7%C3%A3o%29.mp3`,
    );
  });

  it("gera um token diferente por arquivo por padrão", async () => {
    const bucket = { upload: vi.fn().mockResolvedValue(undefined) };
    const storage = new GcsFileStorage(bucket);
    await storage.upload("/a", "a");
    await storage.upload("/b", "b");

    const tokens = bucket.upload.mock.calls.map(
      ([, options]) => options.metadata.metadata.firebaseStorageDownloadTokens,
    );
    expect(tokens[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(tokens[0]).not.toBe(tokens[1]);
  });
});
