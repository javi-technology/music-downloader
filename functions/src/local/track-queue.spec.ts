import { describe, expect, it, vi } from "vitest";
import type { Song } from "../domain/types.js";
import type { PendingTrack } from "./sqlite-job-repository.js";
import { TrackQueue, jobFolder } from "./track-queue.js";

const pending = (trackId: string): PendingTrack => ({
  jobId: "j",
  trackId,
  song: { name: trackId } as Song,
});

function fakeRepository(queue: PendingTrack[]) {
  return {
    nextPendingTrack: vi.fn(() => queue.shift()),
    resetProcessing: vi.fn(() => 0),
  };
}

describe("TrackQueue", () => {
  it("ao iniciar, devolve faixas interrompidas para a fila e processa todas em ordem", async () => {
    const repository = fakeRepository([pending("000"), pending("001")]);
    const process = vi.fn().mockResolvedValue(undefined);
    const queue = new TrackQueue({ repository, process });

    queue.start();
    await queue.idle();

    expect(repository.resetProcessing).toHaveBeenCalledOnce();
    expect(process.mock.calls.map(([track]) => track.trackId)).toEqual([
      "000",
      "001",
    ]);
  });

  it("processa uma faixa por vez", async () => {
    const repository = fakeRepository([pending("000"), pending("001")]);
    let running = 0;
    let maxRunning = 0;
    const process = vi.fn(async () => {
      maxRunning = Math.max(maxRunning, ++running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running--;
    });
    const queue = new TrackQueue({ repository, process });

    queue.start();
    queue.notify();
    queue.notify();
    await queue.idle();

    expect(process).toHaveBeenCalledTimes(2);
    expect(maxRunning).toBe(1);
  });

  it("notify retoma o processamento quando chegam novas faixas", async () => {
    const items: PendingTrack[] = [];
    const repository = fakeRepository(items);
    const process = vi.fn().mockResolvedValue(undefined);
    const queue = new TrackQueue({ repository, process });
    queue.start();
    await queue.idle();

    items.push(pending("000"));
    queue.notify();
    await queue.idle();

    expect(process).toHaveBeenCalledOnce();
  });

  it("um erro inesperado não interrompe a fila", async () => {
    const repository = fakeRepository([pending("000"), pending("001")]);
    const process = vi
      .fn()
      .mockRejectedValueOnce(new Error("disco cheio"))
      .mockResolvedValueOnce(undefined);
    const onError = vi.fn();
    const queue = new TrackQueue({ repository, process, onError });

    queue.start();
    await queue.idle();

    expect(process).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledWith(expect.any(Error), pending("000"));
  });
});

describe("TrackQueue com faixa que continua pendente após erro", () => {
  it("para a fila em vez de repetir a mesma faixa sem fim", async () => {
    const stuck = pending("000");
    const repository = {
      nextPendingTrack: vi.fn(() => stuck),
      resetProcessing: vi.fn(() => 0),
    };
    const process = vi.fn().mockRejectedValue(new Error("banco travado"));
    const queue = new TrackQueue({ repository, process, onError: vi.fn() });

    queue.start();
    await queue.idle();

    expect(process).toHaveBeenCalledOnce();
  });
});

describe("jobFolder", () => {
  it("não pega faixas enquanto não pode processar e retoma no notify seguinte", async () => {
    const repository = fakeRepository([pending("000")]);
    const process = vi.fn().mockResolvedValue(undefined);
    let ready = false;
    const queue = new TrackQueue({
      repository,
      process,
      canProcess: () => ready,
    });

    queue.start();
    await queue.idle();

    expect(repository.nextPendingTrack).not.toHaveBeenCalled();
    expect(process).not.toHaveBeenCalled();

    ready = true;
    queue.notify();
    await queue.idle();

    expect(process).toHaveBeenCalledOnce();
  });

  it("usa o título do álbum/playlist como pasta", () => {
    expect(jobFolder("After Hours")).toBe("After Hours");
  });

  it("faixa avulsa vai para a raiz", () => {
    expect(jobFolder(undefined)).toBe(".");
  });

  it("troca caracteres inválidos e remove pontos/espaços finais (Windows)", () => {
    expect(jobFolder('AC/DC: "Live" Vol. 1. ')).toBe("AC_DC_ _Live_ Vol. 1");
  });

  it("não permite subir de pasta", () => {
    expect(jobFolder("..")).toBe("_");
  });
});
