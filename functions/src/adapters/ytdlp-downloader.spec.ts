import { describe, expect, it, vi } from "vitest";
import { YtDlpDownloader, buildYtDlpArgs } from "./ytdlp-downloader.js";

describe("buildYtDlpArgs", () => {
  it("extrai o melhor áudio em MP3 com o ffmpeg configurado", () => {
    expect(buildYtDlpArgs("abc", "/tmp/out", "/bin/ffmpeg")).toEqual([
      "--no-playlist",
      "--no-progress",
      "-f",
      "bestaudio",
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

describe("YtDlpDownloader", () => {
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
});
