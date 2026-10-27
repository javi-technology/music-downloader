import { Firestore, WriteBatch } from "firebase-admin/firestore";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SpotifyClient } from "../spotify/client.js";
import { FirestoreJobRepository } from "./firestore-job-repository.js";

/**
 * Usa o SDK real do Firestore (sem rede): a validação de valores acontece de forma
 * síncrona no `set()`, antes do `commit()`, que é o único ponto stubado aqui.
 */
describe("integração mapper do Spotify → FirestoreJobRepository (SDK real)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("persiste faixas sem metadados opcionais (isrc, capa, ano...)", async () => {
    const commit = vi
      .spyOn(WriteBatch.prototype, "commit")
      .mockResolvedValue([]);
    const fetchMock = vi.fn(async (url: string) =>
      url.includes("accounts.spotify.com")
        ? Response.json({ access_token: "t", expires_in: 3600 })
        : Response.json({
            id: "a",
            name: "Sem Metadados",
            artists: [{ name: "X" }],
            album: { name: "Y", images: [] },
            duration_ms: 1000,
          }),
    );
    const { songs } = await new SpotifyClient({
      clientId: "i",
      clientSecret: "s",
      fetch: fetchMock as typeof fetch,
    }).getCollection({
      type: "track",
      id: "a",
    });

    const repository = new FirestoreJobRepository(
      new Firestore({ projectId: "demo-music-downloader" }),
    );

    await expect(
      repository.createJob({
        ownerUid: "u1",
        sourceUrl: "spotify:track:a",
        source: { type: "track", id: "a" },
        songs,
      }),
    ).resolves.toEqual(expect.any(String));
    expect(commit).toHaveBeenCalledOnce();
  });
});
