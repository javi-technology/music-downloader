import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Song } from "../domain/types.js";
import type { NewJob } from "../jobs/types.js";
import { SqliteJobRepository } from "./sqlite-job-repository.js";

const song = (id: string): Song => ({
  spotifyId: id,
  name: `Song ${id}`,
  artists: ["A"],
  album: "B",
  durationSeconds: 100,
});

const newJob = (overrides: Partial<NewJob> = {}): NewJob => ({
  ownerUid: "local",
  sourceUrl: "https://open.spotify.com/album/x",
  source: { type: "album", id: "x" },
  title: "B",
  songs: [song("1"), song("2")],
  ...overrides,
});

describe("SqliteJobRepository", () => {
  let repository: SqliteJobRepository;
  let onChange: ReturnType<typeof vi.fn<(jobId: string) => void>>;
  let clock: number;
  let ids: number;

  beforeEach(() => {
    onChange = vi.fn();
    clock = Date.UTC(2026, 9, 15, 20, 0, 0);
    ids = 0;
    repository = new SqliteJobRepository(new DatabaseSync(":memory:"), {
      now: () => new Date(clock++),
      newId: () => `job${++ids}`,
      onChange,
    });
  });

  describe("createJob", () => {
    it("cria o job e uma faixa pendente por música, na ordem", async () => {
      const jobId = await repository.createJob(newJob());

      expect(jobId).toBe("job1");
      expect(repository.getJob(jobId)).toEqual({
        id: "job1",
        sourceUrl: "https://open.spotify.com/album/x",
        source: { type: "album", id: "x" },
        title: "B",
        totalTracks: 2,
        completedTracks: 0,
        failedTracks: 0,
        createdAt: "2026-10-15T20:00:00.000Z",
      });
      expect(repository.listTracks(jobId)).toEqual([
        { id: "000", position: 0, status: "pending", song: song("1") },
        { id: "001", position: 1, status: "pending", song: song("2") },
      ]);
    });

    it("omite o título quando o job não tem (faixa avulsa)", async () => {
      const { title: _t, ...withoutTitle } = newJob();
      const jobId = await repository.createJob(withoutTitle);

      expect(repository.getJob(jobId)).not.toHaveProperty("title");
    });

    it("avisa a mudança", async () => {
      await repository.createJob(newJob());
      expect(onChange).toHaveBeenCalledWith("job1");
    });
  });

  it("lista os jobs do mais recente para o mais antigo", async () => {
    await repository.createJob(newJob());
    await repository.createJob(newJob({ sourceUrl: "spotify:track:t" }));

    expect(repository.listJobs().map((job) => job.id)).toEqual([
      "job2",
      "job1",
    ]);
  });

  it("devolve undefined para job ou faixa inexistente", () => {
    expect(repository.getJob("nope")).toBeUndefined();
    expect(repository.getTrack("nope", "000")).toBeUndefined();
    expect(repository.listTracks("nope")).toEqual([]);
  });

  describe("claimTrack", () => {
    it("reivindica a faixa pendente uma única vez", async () => {
      const jobId = await repository.createJob(newJob());

      expect(await repository.claimTrack(jobId, "000")).toBe(true);
      expect(await repository.claimTrack(jobId, "000")).toBe(false);
      expect(repository.getTrack(jobId, "000")?.status).toBe("processing");
    });
  });

  describe("completeTrack", () => {
    it("conclui a faixa em processamento e incrementa o contador do job", async () => {
      const jobId = await repository.createJob(newJob());
      await repository.claimTrack(jobId, "000");

      await repository.completeTrack(jobId, "000", {
        storagePath: "B/Song 1.mp3",
        videoId: "v1",
        score: 97,
      });

      expect(repository.getTrack(jobId, "000")).toEqual({
        id: "000",
        position: 0,
        status: "done",
        song: song("1"),
        storagePath: "B/Song 1.mp3",
      });
      expect(repository.getJob(jobId)?.completedTracks).toBe(1);
    });

    it("não faz nada se a faixa não está em processamento", async () => {
      const jobId = await repository.createJob(newJob());

      await repository.completeTrack(jobId, "000", {
        storagePath: "x",
        videoId: "v",
        score: 1,
      });

      expect(repository.getTrack(jobId, "000")?.status).toBe("pending");
      expect(repository.getJob(jobId)?.completedTracks).toBe(0);
    });
  });

  describe("failTrack", () => {
    it("marca a falha com a mensagem e incrementa o contador do job", async () => {
      const jobId = await repository.createJob(newJob());
      await repository.claimTrack(jobId, "001");

      await repository.failTrack(jobId, "001", "yt-dlp falhou");

      expect(repository.getTrack(jobId, "001")).toMatchObject({
        status: "failed",
        error: "yt-dlp falhou",
      });
      expect(repository.getJob(jobId)?.failedTracks).toBe(1);
    });

    it("não faz nada se a faixa não está em processamento", async () => {
      const jobId = await repository.createJob(newJob());

      await repository.failTrack(jobId, "001", "x");

      expect(repository.getJob(jobId)?.failedTracks).toBe(0);
    });
  });

  describe("nextPendingTrack", () => {
    it("devolve a primeira faixa pendente do job mais antigo, com o título do job", async () => {
      const first = await repository.createJob(newJob());
      await repository.createJob(newJob({ title: "Outro" }));
      await repository.claimTrack(first, "000");

      expect(repository.nextPendingTrack()).toEqual({
        jobId: first,
        trackId: "001",
        song: song("2"),
        jobTitle: "B",
      });
    });

    it("devolve undefined quando não há pendências", () => {
      expect(repository.nextPendingTrack()).toBeUndefined();
    });
  });

  it("resetProcessing devolve para a fila as faixas interrompidas", async () => {
    const jobId = await repository.createJob(newJob());
    await repository.claimTrack(jobId, "000");

    expect(repository.resetProcessing()).toBe(1);
    expect(repository.getTrack(jobId, "000")?.status).toBe("pending");
  });

  it("mantém os dados ao reabrir o mesmo banco", async () => {
    const db = new DatabaseSync(":memory:");
    const jobId = await new SqliteJobRepository(db).createJob(newJob());

    expect(new SqliteJobRepository(db).getJob(jobId)?.totalTracks).toBe(2);
  });
});
