import { describe, expect, it, vi } from "vitest";
import { YtDlpDownloader, buildYtDlpArgs } from "./ytdlp-downloader.js";

describe("buildYtDlpArgs", () => {
  it("extrai o melhor áudio em MP3 com o ffmpeg configurado", () => {
    expect(buildYtDlpArgs("abc", "/tmp/out", "/bin/ffmpeg")).toEqual([
      "--no-playlist",
      "--no-progress",
      "-f",
      "bestaudio/best",
      "-x",
      "--audio-format",
      "mp3",
      "--audio-quality",
      "0",
      "--ffmpeg-location",
      "/bin/ffmpeg",
      "-o",
      "/tmp/out/%(id)s.%(ext)s",
      "--print",
      "after_move:filepath",
      "https://music.youtube.com/watch?v=abc",
    ]);
  });
});

describe("buildYtDlpArgs com deno", () => {
  it("aponta o runtime JavaScript do yt-dlp para o deno informado", () => {
    const args = buildYtDlpArgs("abc", "/tmp/out", "/bin/ffmpeg", "/bin/deno");

    const index = args.indexOf("--js-runtimes");
    expect(index).toBeGreaterThan(-1);
    expect(args[index + 1]).toBe("deno:/bin/deno");
    expect(args.at(-1)).toBe("https://music.youtube.com/watch?v=abc");
  });
});

describe("YtDlpDownloader", () => {
  it("repassa o deno configurado ao yt-dlp", async () => {
    const run = vi.fn().mockResolvedValue({ stdout: "/tmp/out/abc.mp3\n" });
    await new YtDlpDownloader({
      ytDlpPath: "/bin/yt-dlp",
      ffmpegPath: "/bin/ffmpeg",
      denoPath: "/bin/deno",
      run,
    }).download("abc", "/tmp/out");

    expect(run).toHaveBeenCalledWith(
      "/bin/yt-dlp",
      buildYtDlpArgs("abc", "/tmp/out", "/bin/ffmpeg", "/bin/deno"),
    );
  });

  it("executa o yt-dlp e retorna o caminho final impresso", async () => {
    const run = vi
      .fn()
      .mockResolvedValue({ stdout: "aviso qualquer\n/tmp/out/abc.mp3\n" });
    const downloader = new YtDlpDownloader({
      ytDlpPath: "/bin/yt-dlp",
      ffmpegPath: "/bin/ffmpeg",
      run,
    });

    expect(await downloader.download("abc", "/tmp/out")).toBe(
      "/tmp/out/abc.mp3",
    );
    expect(run).toHaveBeenCalledWith(
      "/bin/yt-dlp",
      buildYtDlpArgs("abc", "/tmp/out", "/bin/ffmpeg"),
    );
  });

  it("falha quando o yt-dlp não informa o arquivo", async () => {
    const run = vi.fn().mockResolvedValue({ stdout: "" });
    const downloader = new YtDlpDownloader({
      ytDlpPath: "y",
      ffmpegPath: "f",
      run,
    });
    await expect(downloader.download("abc", "/tmp")).rejects.toThrow(/yt-dlp/);
  });

  it("tenta de novo quando o yt-dlp falha (YouTube às vezes só oferece SABR)", async () => {
    const run = vi
      .fn()
      .mockRejectedValueOnce(new Error("Requested format is not available"))
      .mockResolvedValueOnce({ stdout: "/tmp/out/abc.mp3\n" });
    const sleep = vi.fn().mockResolvedValue(undefined);
    const downloader = new YtDlpDownloader({
      ytDlpPath: "y",
      ffmpegPath: "f",
      run,
      sleep,
    });

    expect(await downloader.download("abc", "/tmp/out")).toBe(
      "/tmp/out/abc.mp3",
    );
    expect(run).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it("desiste após 3 tentativas e propaga o último erro", async () => {
    const run = vi
      .fn()
      .mockRejectedValueOnce(new Error("falha 1"))
      .mockRejectedValueOnce(new Error("falha 2"))
      .mockRejectedValueOnce(new Error("falha 3"));
    const downloader = new YtDlpDownloader({
      ytDlpPath: "y",
      ffmpegPath: "f",
      run,
      sleep: vi.fn().mockResolvedValue(undefined),
    });

    await expect(downloader.download("abc", "/tmp")).rejects.toThrow("falha 3");
    expect(run).toHaveBeenCalledTimes(3);
  });
});
