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
});
