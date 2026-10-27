import { describe, expect, it, vi } from "vitest";
import type { Song } from "../domain/types.js";
import { InvalidSpotifyUrlError } from "../spotify/url.js";
import {
  EmptySourceError,
  MAX_TRACKS_PER_JOB,
  TooManyTracksError,
  createDownloadJob,
  runTrack,
} from "./use-cases.js";

const song = (id: string): Song => ({
  spotifyId: id,
  name: `Song ${id}`,
  artists: ["A"],
  album: "B",
  durationSeconds: 100,
});

function makeRepo() {
  return {
    createJob: vi.fn().mockResolvedValue("job1"),
    claimTrack: vi.fn().mockResolvedValue(true),
    completeTrack: vi.fn().mockResolvedValue(undefined),
    failTrack: vi.fn().mockResolvedValue(undefined),
  };
}

describe("createDownloadJob", () => {
  it("interpreta a URL, busca as faixas e cria o job com o título da coleção", async () => {
    const repository = makeRepo();
    const songs = {
      getCollection: vi
        .fn()
        .mockResolvedValue({ title: "B", songs: [song("1"), song("2")] }),
    };
    const url = "https://open.spotify.com/album/abc";

    const result = await createDownloadJob(
      { ownerUid: "u1", url },
      { songs, repository },
    );

    expect(songs.getCollection).toHaveBeenCalledWith({
      type: "album",
      id: "abc",
    });
    expect(repository.createJob).toHaveBeenCalledWith({
      ownerUid: "u1",
      sourceUrl: url,
      source: { type: "album", id: "abc" },
      title: "B",
      songs: [song("1"), song("2")],
    });
    expect(result).toEqual({ jobId: "job1", totalTracks: 2 });
  });

  it("omite o título quando a fonte não tem (faixa avulsa)", async () => {
    const repository = makeRepo();
    const songs = {
      getCollection: vi.fn().mockResolvedValue({ songs: [song("1")] }),
    };

    await createDownloadJob(
      { ownerUid: "u1", url: "spotify:track:t" },
      { songs, repository },
    );

    expect(repository.createJob.mock.calls[0][0]).not.toHaveProperty("title");
  });

  it("rejeita URL inválida sem consultar o Spotify", async () => {
    const songs = { getCollection: vi.fn() };
    await expect(
      createDownloadJob(
        { ownerUid: "u1", url: "xyz" },
        { songs, repository: makeRepo() },
      ),
    ).rejects.toBeInstanceOf(InvalidSpotifyUrlError);
    expect(songs.getCollection).not.toHaveBeenCalled();
  });

  it("rejeita fonte sem faixas", async () => {
    const songs = { getCollection: vi.fn().mockResolvedValue({ songs: [] }) };
    await expect(
      createDownloadJob(
        { ownerUid: "u1", url: "spotify:playlist:p" },
        { songs, repository: makeRepo() },
      ),
    ).rejects.toBeInstanceOf(EmptySourceError);
  });

  it(`rejeita mais de ${MAX_TRACKS_PER_JOB} faixas`, async () => {
    const many = Array.from({ length: MAX_TRACKS_PER_JOB + 1 }, (_, i) =>
      song(String(i)),
    );
    const repository = makeRepo();
    const songs = {
      getCollection: vi.fn().mockResolvedValue({ songs: many }),
    };
    await expect(
      createDownloadJob(
        { ownerUid: "u1", url: "spotify:playlist:p" },
        { songs, repository },
      ),
    ).rejects.toBeInstanceOf(TooManyTracksError);
    expect(repository.createJob).not.toHaveBeenCalled();
  });
});

describe("runTrack", () => {
  const input = {
    jobId: "j",
    trackId: "007",
    song: song("1"),
    destinationDir: "p",
  };

  it("reivindica a faixa, processa na pasta de destino e conclui", async () => {
    const repository = makeRepo();
    const outcome = { storagePath: "p/x.mp3", videoId: "v", score: 95 };
    const process = vi.fn().mockResolvedValue(outcome);

    await runTrack(input, { repository, process });

    expect(repository.claimTrack).toHaveBeenCalledWith("j", "007");
    expect(process).toHaveBeenCalledWith(song("1"), "p");
    expect(repository.completeTrack).toHaveBeenCalledWith("j", "007", outcome);
    expect(repository.failTrack).not.toHaveBeenCalled();
  });

  it("não processa entrega duplicada de faixa já reivindicada", async () => {
    const repository = makeRepo();
    repository.claimTrack.mockResolvedValue(false);
    const process = vi.fn();

    await runTrack(input, { repository, process });

    expect(process).not.toHaveBeenCalled();
    expect(repository.completeTrack).not.toHaveBeenCalled();
    expect(repository.failTrack).not.toHaveBeenCalled();
  });

  it("registra falha do processamento com a mensagem do erro, sem relançar", async () => {
    const repository = makeRepo();
    const process = vi.fn().mockRejectedValue(new Error("yt-dlp falhou"));

    await runTrack(input, { repository, process });

    expect(repository.failTrack).toHaveBeenCalledWith(
      "j",
      "007",
      "yt-dlp falhou",
    );
    expect(repository.completeTrack).not.toHaveBeenCalled();
  });

  it("não marca como falha um download concluído quando a gravação final falha", async () => {
    const repository = makeRepo();
    repository.completeTrack.mockRejectedValue(
      new Error("firestore indisponível"),
    );
    const process = vi.fn().mockResolvedValue({
      storagePath: "p/007/x.mp3",
      videoId: "v",
      score: 95,
    });

    await expect(runTrack(input, { repository, process })).rejects.toThrow(
      "firestore indisponível",
    );
    expect(repository.failTrack).not.toHaveBeenCalled();
  });
});
