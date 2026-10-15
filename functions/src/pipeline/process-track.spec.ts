import { describe, expect, it, vi } from "vitest";
import type { SearchResult, Song } from "../domain/types.js";
import { NoMatchError, buildFileName, processTrack } from "./process-track.js";

const song: Song = {
  spotifyId: "sp1",
  name: "Blinding Lights",
  artists: ["The Weeknd"],
  album: "After Hours",
  durationSeconds: 200,
};

const goodResult: SearchResult = {
  videoId: "good",
  name: "Blinding Lights",
  artists: ["The Weeknd"],
  album: "After Hours",
  durationSeconds: 201,
  verified: true,
};

function makeDeps(results: SearchResult[] = [goodResult]) {
  return {
    searcher: { search: vi.fn().mockResolvedValue(results) },
    downloader: { download: vi.fn().mockResolvedValue("/tmp/work/good.mp3") },
    tagger: { tag: vi.fn().mockResolvedValue(undefined) },
    storage: {
      upload: vi.fn(async (_local: string, destination: string) => destination),
    },
    workDir: "/tmp/work",
  };
}

describe("buildFileName", () => {
  it('gera "Título.mp3" sem caracteres inválidos', () => {
    expect(
      buildFileName({
        ...song,
        artists: ["AC/DC", "X"],
        name: 'Back: In "Black"?',
      }),
    ).toBe("Back_ In _Black__.mp3");
  });
});

describe("processTrack", () => {
  it('busca no YouTube Music por "artistas - título"', async () => {
    const deps = makeDeps();
    await processTrack(song, "music-downloader/users/u1/job1", deps);
    expect(deps.searcher.search).toHaveBeenCalledWith(
      "The Weeknd - Blinding Lights",
    );
  });

  it("baixa o melhor match, grava tags e envia para o Storage", async () => {
    const deps = makeDeps([
      { ...goodResult, videoId: "remix", name: "Blinding Lights (Remix)" },
      goodResult,
    ]);

    const outcome = await processTrack(
      song,
      "music-downloader/users/u1/job1",
      deps,
    );

    expect(deps.downloader.download).toHaveBeenCalledWith("good", "/tmp/work");
    expect(deps.tagger.tag).toHaveBeenCalledWith("/tmp/work/good.mp3", song);
    expect(deps.storage.upload).toHaveBeenCalledWith(
      "/tmp/work/good.mp3",
      "music-downloader/users/u1/job1/Blinding Lights.mp3",
    );
    expect(outcome).toEqual({
      videoId: "good",
      score: expect.any(Number),
      storagePath: "music-downloader/users/u1/job1/Blinding Lights.mp3",
    });
  });

  it("devolve o caminho final informado pelo armazenamento (que pode renomear em colisões)", async () => {
    const deps = makeDeps();
    deps.storage.upload.mockResolvedValue("Album/Blinding Lights (2).mp3");

    const outcome = await processTrack(song, "Album", deps);

    expect(outcome.storagePath).toBe("Album/Blinding Lights (2).mp3");
  });

  it("lança NoMatchError e não baixa nada quando não há correspondência", async () => {
    const deps = makeDeps([
      { ...goodResult, artists: ["Outro"], name: "Outra Música" },
    ]);
    await expect(processTrack(song, "dest", deps)).rejects.toBeInstanceOf(
      NoMatchError,
    );
    expect(deps.downloader.download).not.toHaveBeenCalled();
  });

  describe("com ISRC", () => {
    const withIsrc: Song = { ...song, isrc: "USUG11904206" };

    it("busca primeiro pelo ISRC e usa o resultado sem busca textual", async () => {
      const deps = makeDeps();
      const outcome = await processTrack(withIsrc, "dest", deps);
      expect(deps.searcher.search).toHaveBeenCalledTimes(1);
      expect(deps.searcher.search).toHaveBeenCalledWith("USUG11904206");
      expect(outcome.videoId).toBe("good");
    });

    it("recorre à busca textual quando o ISRC não traz resultado compatível", async () => {
      const deps = makeDeps();
      deps.searcher.search
        .mockResolvedValueOnce([
          { ...goodResult, videoId: "lixo", name: "Rush E", artists: ["X"] },
        ])
        .mockResolvedValueOnce([goodResult]);

      const outcome = await processTrack(withIsrc, "dest", deps);

      expect(deps.searcher.search).toHaveBeenNthCalledWith(
        2,
        "The Weeknd - Blinding Lights",
      );
      expect(outcome.videoId).toBe("good");
    });
  });
});
