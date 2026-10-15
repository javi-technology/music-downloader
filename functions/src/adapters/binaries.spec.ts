import { describe, expect, it } from "vitest";
import { resolveBinary } from "./binaries.js";

describe("resolveBinary", () => {
  it("prioriza a variável de ambiente", () => {
    expect(
      resolveBinary("yt-dlp", {
        env: { YT_DLP_PATH: "/custom/yt" },
        binDir: "/app/bin",
        exists: () => true,
      }),
    ).toBe("/custom/yt");
  });

  it("usa o binário empacotado em bin/ quando existe", () => {
    expect(
      resolveBinary("ffmpeg", {
        env: {},
        binDir: "/app/bin",
        exists: (p) => p === "/app/bin/ffmpeg",
      }),
    ).toBe("/app/bin/ffmpeg");
  });

  it("resolve o caminho absoluto pelo PATH do sistema", () => {
    expect(
      resolveBinary("ffmpeg", {
        env: { PATH: "/usr/bin:/opt/homebrew/bin" },
        binDir: "/app/bin",
        exists: (p) => p === "/opt/homebrew/bin/ffmpeg",
      }),
    ).toBe("/opt/homebrew/bin/ffmpeg");
  });

  it("devolve o nome puro quando não encontra o binário", () => {
    expect(
      resolveBinary("yt-dlp", {
        env: { PATH: "/usr/bin" },
        binDir: "/app/bin",
        exists: () => false,
      }),
    ).toBe("yt-dlp");
  });

  it("resolve o deno pela variável DENO_PATH", () => {
    expect(
      resolveBinary("deno", {
        env: { DENO_PATH: "/custom/deno" },
        binDir: "/app/bin",
        exists: () => false,
      }),
    ).toBe("/custom/deno");
  });

  it("no Windows procura o executável com .exe", () => {
    expect(
      resolveBinary("ffmpeg", {
        env: { PATH: "C:\\Tools" },
        binDir: "C:\\app\\bin",
        platform: "win32",
        exists: (p) => p === "C:\\app\\bin\\ffmpeg.exe",
      }),
    ).toBe("C:\\app\\bin\\ffmpeg.exe");
  });

  it("no Windows separa o PATH por ponto e vírgula", () => {
    expect(
      resolveBinary("yt-dlp", {
        env: { PATH: "C:\\A;C:\\B" },
        binDir: "C:\\app\\bin",
        platform: "win32",
        exists: (p) => p === "C:\\B\\yt-dlp.exe",
      }),
    ).toBe("C:\\B\\yt-dlp.exe");
  });
});
