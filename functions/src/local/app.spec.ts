import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Song } from "../domain/types.js";
import { type LocalApp, startLocalApp } from "./app.js";

const song: Song = {
  spotifyId: "s1",
  name: "Blinding Lights",
  artists: ["The Weeknd"],
  album: "After Hours",
  durationSeconds: 200,
};

describe("startLocalApp", () => {
  let dir: string;
  let app: LocalApp | undefined;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "md-app-"));
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
    await rm(dir, { recursive: true, force: true });
  });

  const readyTools = () => ({
    status: vi.fn(() => ({ ready: true, installing: false, tools: [] })),
    install: vi.fn().mockResolvedValue(undefined),
    updateYtDlpIfStale: vi.fn().mockResolvedValue(undefined),
    paths: vi.fn(() => ({ ytDlp: "y", ffmpeg: "f", deno: "d" })),
  });

  const start = (
    overrides: Partial<Parameters<typeof startLocalApp>[0]> = {},
  ) =>
    startLocalApp({
      dataDir: join(dir, "data"),
      defaultDownloadDir: join(dir, "Music"),
      port: 0,
      tools: readyTools(),
      ...overrides,
    });

  const api = (path: string, init?: RequestInit) =>
    fetch(`${app!.url}${path}`, init);

  const postJob = (url: string) =>
    api("/api/jobs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url }),
    });

  it("sobe em 127.0.0.1 com a pasta de músicas padrão", async () => {
    app = await start();

    expect(app.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(await (await api("/api/settings")).json()).toEqual({
      spotifyConfigured: false,
      spotifyBuiltIn: false,
      downloadDir: join(dir, "Music"),
    });
  });

  it("ao iniciar, instala as ferramentas ausentes e atualiza o yt-dlp antigo", async () => {
    const tools = readyTools();
    app = await start({ tools });

    expect(tools.install).toHaveBeenCalledOnce();
    expect(tools.updateYtDlpIfStale).toHaveBeenCalledWith(
      7 * 24 * 60 * 60 * 1000,
    );
  });

  it("recusa job enquanto as ferramentas não estão prontas", async () => {
    const tools = readyTools();
    tools.status.mockReturnValue({ ready: false, installing: true, tools: [] });
    app = await start({ tools });
    await api("/api/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ spotifyClientId: "id", spotifyClientSecret: "s" }),
    });

    const reply = await postJob("https://open.spotify.com/track/t");

    expect(reply.status).toBe(409);
    expect(((await reply.json()) as { error: string }).error).toMatch(
      /ferramentas/,
    );
  });

  it("pede as credenciais do Spotify antes de criar job", async () => {
    app = await start();

    const reply = await postJob("https://open.spotify.com/track/t");

    expect(reply.status).toBe(409);
  });

  it("cria o job com as credenciais salvas e processa as faixas na fila, na pasta do álbum", async () => {
    const getCollection = vi
      .fn()
      .mockResolvedValue({ title: "After Hours", songs: [song] });
    const songSource = vi.fn(() => ({ getCollection }));
    const processSong = vi.fn(async (_song: Song, destinationDir: string) => ({
      storagePath: join(dir, "Music", destinationDir, "Blinding Lights.mp3"),
      videoId: "v",
      score: 99,
    }));
    app = await start({ songSource, processSong });

    await api("/api/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ spotifyClientId: "id", spotifyClientSecret: "s" }),
    });
    const reply = await postJob("https://open.spotify.com/album/x");
    const { jobId } = (await reply.json()) as { jobId: string };
    await app.idle();

    expect(reply.status).toBe(201);
    expect(songSource).toHaveBeenCalledWith({
      clientId: "id",
      clientSecret: "s",
    });
    expect(processSong).toHaveBeenCalledWith(song, "After Hours");
    const tracks = (await (await api(`/api/jobs/${jobId}/tracks`)).json()) as {
      status: string;
    }[];
    expect(tracks[0]).toMatchObject({ status: "done" });
  });

  it("cria o job com as credenciais embutidas quando o usuário não informou as próprias", async () => {
    const getCollection = vi
      .fn()
      .mockResolvedValue({ title: "After Hours", songs: [song] });
    const songSource = vi.fn(() => ({ getCollection }));
    app = await start({
      songSource,
      processSong: vi.fn().mockResolvedValue({
        storagePath: "x.mp3",
        videoId: "v",
        score: 99,
      }),
      builtInSpotify: { clientId: "id-app", clientSecret: "secret-app" },
    });

    const reply = await postJob("https://open.spotify.com/album/x");

    expect(reply.status).toBe(201);
    expect(songSource).toHaveBeenCalledWith({
      clientId: "id-app",
      clientSecret: "secret-app",
    });
  });

  it("guarda jobs e configurações na pasta de dados entre execuções", async () => {
    app = await start();
    await api("/api/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ spotifyClientId: "id", spotifyClientSecret: "s" }),
    });
    await app.close();

    app = await start();

    const settings = (await (await api("/api/settings")).json()) as {
      spotifyConfigured: boolean;
    };
    expect(settings.spotifyConfigured).toBe(true);
  });
});
