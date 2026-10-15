import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeZip } from "./__fixtures__/make-zip.js";
import type { ToolSpec } from "./catalog.js";
import { type ToolsStatus, ToolManager } from "./tool-manager.js";

const CATALOG: ToolSpec[] = [
  {
    name: "yt-dlp",
    artifacts: [
      {
        url: "https://dl/yt-dlp_macos",
        format: "raw",
        files: [{ entry: "yt-dlp_macos", target: "yt-dlp" }],
      },
    ],
  },
  {
    name: "ffmpeg",
    artifacts: [
      {
        url: "https://dl/ffmpeg.tar.xz",
        format: "tar.xz",
        files: [
          { entry: "ffmpeg", target: "ffmpeg" },
          { entry: "ffprobe", target: "ffprobe" },
        ],
      },
    ],
  },
  {
    name: "deno",
    artifacts: [
      {
        url: "https://dl/deno.zip",
        format: "zip",
        files: [{ entry: "deno", target: "deno" }],
      },
    ],
  },
];

const BODIES: Record<string, Buffer> = {
  "https://dl/yt-dlp_macos": Buffer.from("yt-dlp-bin"),
  "https://dl/ffmpeg.tar.xz": Buffer.from("tar-bytes"),
  "https://dl/deno.zip": makeZip([
    { name: "deno", data: Buffer.from("deno-bin"), method: 8 },
  ]),
};

describe("ToolManager", () => {
  let dir: string;
  let binDir: string;
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
  let extractTarXz: ReturnType<
    typeof vi.fn<(archive: string, destination: string) => Promise<void>>
  >;
  let onChange: ReturnType<typeof vi.fn<(status: ToolsStatus) => void>>;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "md-tools-"));
    binDir = join(dir, "bin");
    fetchMock = vi.fn(async (input) => {
      const body = BODIES[String(input)];
      if (!body) return new Response("nope", { status: 404 });
      return new Response(new Uint8Array(body), {
        headers: { "content-length": String(body.length) },
      });
    });
    // Simula o `tar` do sistema: extrai para uma pasta interna do pacote.
    extractTarXz = vi.fn(async (_archive, destination) => {
      await mkdir(join(destination, "ffmpeg-build", "bin"), {
        recursive: true,
      });
      await writeFile(
        join(destination, "ffmpeg-build", "bin", "ffmpeg"),
        "ffmpeg-bin",
      );
      await writeFile(
        join(destination, "ffmpeg-build", "bin", "ffprobe"),
        "ffprobe-bin",
      );
    });
    onChange = vi.fn();
  });

  afterEach(() => rm(dir, { recursive: true, force: true }));

  const manager = (
    overrides: Partial<ConstructorParameters<typeof ToolManager>[0]> = {},
  ) =>
    new ToolManager({
      binDir,
      catalog: CATALOG,
      platform: "darwin",
      env: { PATH: "" },
      fetch: fetchMock,
      extractTarXz,
      onChange,
      ...overrides,
    });

  const states = (status: ToolsStatus) =>
    Object.fromEntries(status.tools.map((tool) => [tool.name, tool.state]));

  it("sem nada instalado, nenhuma ferramenta está pronta", () => {
    const status = manager().status();

    expect(status.ready).toBe(false);
    expect(states(status)).toEqual({
      "yt-dlp": "missing",
      ffmpeg: "missing",
      deno: "missing",
    });
  });

  it("aceita ferramentas já instaladas no sistema (PATH)", async () => {
    const system = join(dir, "system");
    await mkdir(system);
    for (const name of ["yt-dlp", "ffmpeg", "deno"])
      await writeFile(join(system, name), "");

    const status = manager({ env: { PATH: system } }).status();

    expect(status.ready).toBe(true);
    expect(status.tools.every((tool) => tool.source === "system")).toBe(true);
  });

  it("instala as ausentes (raw, tar.xz e zip) como executáveis na pasta do app", async () => {
    const tools = manager();

    await tools.install();

    expect(await readFile(join(binDir, "yt-dlp"), "utf8")).toBe("yt-dlp-bin");
    expect(await readFile(join(binDir, "ffmpeg"), "utf8")).toBe("ffmpeg-bin");
    expect(await readFile(join(binDir, "ffprobe"), "utf8")).toBe("ffprobe-bin");
    expect(await readFile(join(binDir, "deno"), "utf8")).toBe("deno-bin");
    expect((await stat(join(binDir, "deno"))).mode & 0o111).toBe(0o111);
    expect(tools.status()).toMatchObject({ ready: true, installing: false });
    expect(tools.status().tools.every((tool) => tool.source === "app")).toBe(
      true,
    );
    expect(tools.paths()).toEqual({
      ytDlp: join(binDir, "yt-dlp"),
      ffmpeg: join(binDir, "ffmpeg"),
      deno: join(binDir, "deno"),
    });
  });

  it("não baixa o que já está disponível", async () => {
    const system = join(dir, "system");
    await mkdir(system);
    await writeFile(join(system, "yt-dlp"), "");

    await manager({ env: { PATH: system } }).install();

    expect(fetchMock).not.toHaveBeenCalledWith(
      "https://dl/yt-dlp_macos",
      expect.anything(),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("informa o progresso do download", async () => {
    await manager().install();

    const downloading = onChange.mock.calls
      .map(([status]) => status.tools.find((tool) => tool.name === "deno"))
      .find((tool) => tool?.state === "downloading" && tool.totalBytes);
    expect(downloading).toMatchObject({
      totalBytes: BODIES["https://dl/deno.zip"].length,
    });
    expect(onChange.mock.lastCall?.[0]).toMatchObject({ ready: true });
  });

  it("registra a falha de uma ferramenta, segue com as outras e permite tentar de novo", async () => {
    fetchMock.mockImplementationOnce(
      async () => new Response("x", { status: 503 }),
    );
    const tools = manager();

    await tools.install();

    const ytDlp = tools.status().tools.find((tool) => tool.name === "yt-dlp");
    expect(ytDlp).toMatchObject({ state: "error" });
    expect(ytDlp?.error).toMatch(/503/);
    expect(states(tools.status()).deno).toBe("installed");

    await tools.install();
    expect(tools.status().ready).toBe(true);
  });

  it("não deixa arquivo pela metade quando o pacote é inválido", async () => {
    fetchMock.mockImplementation(async (input) =>
      String(input).endsWith(".zip")
        ? new Response("<html>erro</html>")
        : new Response(new Uint8Array(BODIES[String(input)])),
    );
    const tools = manager();

    await tools.install();

    expect(states(tools.status()).deno).toBe("error");
    await expect(stat(join(binDir, "deno"))).rejects.toThrow();
  });

  it("chamadas simultâneas compartilham a mesma instalação", async () => {
    const tools = manager();

    await Promise.all([tools.install(), tools.install()]);

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  describe("updateYtDlpIfStale", () => {
    const WEEK = 7 * 24 * 60 * 60 * 1000;

    it("baixa de novo o yt-dlp instalado pelo app quando está velho", async () => {
      const tools = manager();
      await tools.install();
      const old = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
      await utimes(join(binDir, "yt-dlp"), old, old);
      fetchMock.mockClear();

      await tools.updateYtDlpIfStale(WEEK);

      expect(fetchMock).toHaveBeenCalledOnce();
      expect(fetchMock.mock.calls[0][0]).toBe("https://dl/yt-dlp_macos");
    });

    it("não faz nada se a cópia é recente ou é do sistema", async () => {
      const tools = manager();
      await tools.install();
      fetchMock.mockClear();

      await tools.updateYtDlpIfStale(WEEK);
      await manager({ binDir: join(dir, "vazio") }).updateYtDlpIfStale(WEEK);

      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
