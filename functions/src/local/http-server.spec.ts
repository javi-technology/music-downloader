import { request as httpRequest, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  type Mock,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { Song } from "../domain/types.js";
import { EmptySourceError, TooManyTracksError } from "../jobs/use-cases.js";
import { InvalidSpotifyUrlError } from "../spotify/url.js";
import { ChangeFeed } from "./change-feed.js";
import {
  SpotifyNotConfiguredError,
  ToolsNotReadyError,
  createLocalServer,
} from "./http-server.js";
import type { ToolsStatus } from "./tools/tool-manager.js";
import {
  InvalidSettingsError,
  type PublicSettings,
  type SettingsUpdate,
} from "./settings.js";
import { SqliteJobRepository } from "./sqlite-job-repository.js";

interface Reply {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

const song: Song = {
  spotifyId: "s1",
  name: "Blinding Lights",
  artists: ["The Weeknd"],
  album: "After Hours",
  durationSeconds: 200,
};

describe("servidor local", () => {
  let server: Server;
  let port: number;
  let dir: string;
  let repository: SqliteJobRepository;
  let feed: ChangeFeed;
  let settings: {
    publicView: Mock<() => PublicSettings>;
    update: Mock<(changes: SettingsUpdate) => void>;
  };
  let tools: {
    status: Mock<() => ToolsStatus>;
    install: Mock<() => Promise<void>>;
  };
  let createJob: Mock<
    (url: string) => Promise<{ jobId: string; totalTracks: number }>
  >;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "md-http-"));
    feed = new ChangeFeed();
    repository = new SqliteJobRepository(new DatabaseSync(":memory:"), {
      onChange: (jobId) => feed.publish("job", { jobId }),
    });
    settings = {
      publicView: vi.fn(() => ({
        spotifyConfigured: false,
        spotifyBuiltIn: false,
        downloadDir: "/m",
      })),
      update: vi.fn(),
    };
    createJob = vi.fn();
    tools = {
      status: vi.fn(() => ({ ready: false, installing: true, tools: [] })),
      install: vi.fn().mockResolvedValue(undefined),
    };
    server = createLocalServer({
      settings,
      tools,
      repository,
      createJob,
      feed,
      allowedOrigins: ["http://localhost:4200"],
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    port = (server.address() as AddressInfo).port;
  });

  afterEach(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  });

  function request(
    method: string,
    path: string,
    options: { body?: unknown; headers?: Record<string, string> } = {},
  ): Promise<Reply> {
    const body =
      options.body === undefined ? undefined : JSON.stringify(options.body);
    return new Promise((resolve, reject) => {
      const req = httpRequest(
        {
          host: "127.0.0.1",
          port,
          method,
          path,
          headers: {
            ...(body ? { "content-type": "application/json" } : {}),
            ...options.headers,
          },
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => chunks.push(chunk));
          res.on("end", () =>
            resolve({
              status: res.statusCode ?? 0,
              headers: res.headers,
              body: Buffer.concat(chunks).toString("utf8"),
            }),
          );
        },
      );
      req.on("error", reject);
      req.end(body);
    });
  }

  const json = (reply: Reply) => JSON.parse(reply.body);

  describe("segurança", () => {
    it("rejeita Host diferente de localhost (DNS rebinding)", async () => {
      const reply = await request("GET", "/api/settings", {
        headers: { host: `evil.example:${port}` },
      });
      expect(reply.status).toBe(403);
    });

    it("aceita localhost como Host", async () => {
      const reply = await request("GET", "/api/settings", {
        headers: { host: `localhost:${port}` },
      });
      expect(reply.status).toBe(200);
    });

    it("rejeita requisição vinda de outro site (Origin)", async () => {
      const reply = await request("POST", "/api/jobs", {
        body: { url: "spotify:track:t" },
        headers: { origin: "https://evil.example" },
      });
      expect(reply.status).toBe(403);
      expect(createJob).not.toHaveBeenCalled();
    });

    it("aceita a própria origem e as origens permitidas (dev server)", async () => {
      createJob.mockResolvedValue({ jobId: "j", totalTracks: 1 });
      for (const origin of [
        `http://127.0.0.1:${port}`,
        `http://localhost:${port}`,
        "http://localhost:4200",
      ]) {
        const reply = await request("POST", "/api/jobs", {
          body: { url: "spotify:track:t" },
          headers: { origin },
        });
        expect(reply.status).toBe(201);
      }
    });

    it("exige JSON em requisições que alteram dados, mesmo sem corpo", async () => {
      for (const path of ["/api/jobs", "/api/tools/install"]) {
        const reply = await request("POST", path, {
          headers: { "content-type": "text/plain" },
        });
        expect(reply.status).toBe(415);
      }
      expect(tools.install).not.toHaveBeenCalled();
    });
  });

  describe("/api/settings", () => {
    it("GET devolve a visão pública", async () => {
      const reply = await request("GET", "/api/settings");
      expect(reply.status).toBe(200);
      expect(json(reply)).toEqual({
        spotifyConfigured: false,
        spotifyBuiltIn: false,
        downloadDir: "/m",
      });
    });

    it("PUT atualiza só os campos conhecidos (texto) e devolve a visão pública", async () => {
      const reply = await request("PUT", "/api/settings", {
        body: {
          spotifyClientId: "id",
          spotifyClientSecret: "secret",
          downloadDir: "/x",
          extra: "ignorado",
          ownerUid: 1,
        },
      });

      expect(reply.status).toBe(200);
      expect(settings.update).toHaveBeenCalledWith({
        spotifyClientId: "id",
        spotifyClientSecret: "secret",
        downloadDir: "/x",
      });
      expect(json(reply)).toEqual({
        spotifyConfigured: false,
        spotifyBuiltIn: false,
        downloadDir: "/m",
      });
    });

    it("PUT responde 400 para configuração inválida", async () => {
      settings.update.mockImplementation(() => {
        throw new InvalidSettingsError(
          "A pasta de destino precisa ser um caminho absoluto",
        );
      });
      const reply = await request("PUT", "/api/settings", {
        body: { downloadDir: "x" },
      });
      expect(reply.status).toBe(400);
      expect(json(reply).error).toMatch(/caminho absoluto/);
    });

    it("responde 400 para JSON malformado", async () => {
      const reply = await new Promise<Reply>((resolve, reject) => {
        const req = httpRequest(
          {
            host: "127.0.0.1",
            port,
            method: "PUT",
            path: "/api/settings",
            headers: { "content-type": "application/json" },
          },
          (res) => {
            res.resume();
            res.on("end", () =>
              resolve({ status: res.statusCode ?? 0, headers: {}, body: "" }),
            );
          },
        );
        req.on("error", reject);
        req.end("{nope");
      });
      expect(reply.status).toBe(400);
    });
  });

  describe("/api/tools", () => {
    it("GET devolve o estado das ferramentas", async () => {
      const reply = await request("GET", "/api/tools");
      expect(reply.status).toBe(200);
      expect(json(reply)).toEqual({
        ready: false,
        installing: true,
        tools: [],
      });
    });

    it("POST install inicia a instalação sem esperar terminar", async () => {
      tools.install.mockReturnValue(new Promise(() => {}));

      const reply = await request("POST", "/api/tools/install", {
        headers: { "content-type": "application/json" },
      });

      expect(reply.status).toBe(202);
      expect(tools.install).toHaveBeenCalledOnce();
      expect(json(reply)).toEqual({
        ready: false,
        installing: true,
        tools: [],
      });
    });
  });

  describe("POST /api/jobs", () => {
    it("cria o job e responde 201", async () => {
      createJob.mockResolvedValue({ jobId: "j1", totalTracks: 3 });

      const reply = await request("POST", "/api/jobs", {
        body: { url: "https://open.spotify.com/album/x" },
      });

      expect(reply.status).toBe(201);
      expect(json(reply)).toEqual({ jobId: "j1", totalTracks: 3 });
      expect(createJob).toHaveBeenCalledWith(
        "https://open.spotify.com/album/x",
      );
    });

    it("exige a URL", async () => {
      const reply = await request("POST", "/api/jobs", { body: {} });
      expect(reply.status).toBe(400);
      expect(createJob).not.toHaveBeenCalled();
    });

    it.each([
      [new InvalidSpotifyUrlError("x"), 400],
      [new EmptySourceError(), 404],
      [new SpotifyNotConfiguredError(), 409],
      [new ToolsNotReadyError(), 409],
      [new TooManyTracksError(500), 422],
    ])("mapeia %s para %i com a mensagem", async (error, status) => {
      createJob.mockRejectedValue(error);
      const reply = await request("POST", "/api/jobs", {
        body: { url: "x" },
      });
      expect(reply.status).toBe(status);
      expect(json(reply).error).toBe(error.message);
    });

    it("não vaza detalhes de erros inesperados", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      createJob.mockRejectedValue(new Error("Spotify auth 401 segredo"));
      const reply = await request("POST", "/api/jobs", { body: { url: "x" } });
      expect(reply.status).toBe(502);
      expect(json(reply).error).not.toMatch(/segredo/);
    });
  });

  describe("consultas de jobs", () => {
    it("lista os jobs e as faixas", async () => {
      const jobId = await repository.createJob({
        ownerUid: "local",
        sourceUrl: "spotify:track:t",
        source: { type: "track", id: "t" },
        songs: [song],
      });

      expect(json(await request("GET", "/api/jobs"))).toEqual([
        expect.objectContaining({ id: jobId, totalTracks: 1 }),
      ]);
      expect(json(await request("GET", `/api/jobs/${jobId}`)).id).toBe(jobId);
      expect(json(await request("GET", `/api/jobs/${jobId}/tracks`))).toEqual([
        { id: "000", position: 0, status: "pending", song },
      ]);
    });

    it("responde 500 genérico para erro inesperado fora da criação de job", async () => {
      vi.spyOn(repository, "listJobs").mockImplementation(() => {
        throw new Error("disco corrompido");
      });
      vi.spyOn(console, "error").mockImplementation(() => {});

      const reply = await request("GET", "/api/jobs");

      expect(reply.status).toBe(500);
      expect(json(reply).error).not.toMatch(/Spotify|disco/);
    });

    it("responde 404 para job inexistente e rotas desconhecidas", async () => {
      expect((await request("GET", "/api/jobs/nope")).status).toBe(404);
      expect((await request("GET", "/api/jobs/nope/tracks")).status).toBe(404);
      expect((await request("GET", "/api/outra")).status).toBe(404);
    });
  });

  describe("download do arquivo", () => {
    async function doneTrack(storagePath: string) {
      const jobId = await repository.createJob({
        ownerUid: "local",
        sourceUrl: "spotify:track:t",
        source: { type: "track", id: "t" },
        songs: [song],
      });
      await repository.claimTrack(jobId, "000");
      await repository.completeTrack(jobId, "000", {
        storagePath,
        videoId: "v",
        score: 99,
      });
      return jobId;
    }

    it("envia o MP3 com o nome da música", async () => {
      const file = join(dir, "Blinding Lights.mp3");
      await writeFile(file, "audio");
      const jobId = await doneTrack(file);

      const reply = await request("GET", `/api/jobs/${jobId}/tracks/000/file`);

      expect(reply.status).toBe(200);
      expect(reply.headers["content-type"]).toBe("audio/mpeg");
      expect(reply.headers["content-disposition"]).toContain(
        'filename="Blinding Lights.mp3"',
      );
      expect(reply.body).toBe("audio");
    });

    it("responde 404 se a faixa não terminou ou o arquivo sumiu do disco", async () => {
      const jobId = await doneTrack(join(dir, "apagado.mp3"));
      expect(
        (await request("GET", `/api/jobs/${jobId}/tracks/000/file`)).status,
      ).toBe(404);
      expect(
        (await request("GET", `/api/jobs/${jobId}/tracks/999/file`)).status,
      ).toBe(404);
    });
  });

  describe("GET /api/events", () => {
    it("envia um evento SSE a cada mudança (job, ferramentas)", async () => {
      const received = new Promise<string>((resolve, reject) => {
        const req = httpRequest(
          { host: "127.0.0.1", port, path: "/api/events" },
          (res) => {
            expect(res.headers["content-type"]).toBe("text/event-stream");
            let buffer = "";
            res.on("data", (chunk: Buffer) => {
              buffer += chunk.toString("utf8");
              if (buffer.includes("event: job")) {
                resolve(buffer);
                req.destroy();
              }
            });
            // Conectado: dispara uma mudança.
            feed.publish("job", { jobId: "j42" });
          },
        );
        req.on("error", reject);
        req.end();
      });

      expect(await received).toContain('event: job\ndata: {"jobId":"j42"}\n\n');
    });

    it("remove o assinante quando o navegador desconecta", async () => {
      await new Promise<void>((resolve, reject) => {
        const req = httpRequest(
          { host: "127.0.0.1", port, path: "/api/events" },
          (res) => {
            res.once("data", () => {
              expect(feed.size).toBe(1);
              req.destroy();
              resolve();
            });
          },
        );
        req.on("error", reject);
        req.end();
      });
      await vi.waitFor(() => expect(feed.size).toBe(0));
    });
  });
});
