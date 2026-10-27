import { describe, expect, it } from "vitest";
import { UnsupportedPlatformError, toolCatalog } from "./catalog.js";

const YT = "https://github.com/yt-dlp/yt-dlp/releases/latest/download";
const FFMPEG_BUILDS =
  "https://github.com/yt-dlp/FFmpeg-Builds/releases/download/latest";
const MARTIN_RIEDL = "https://ffmpeg.martin-riedl.de/redirect/latest/macos";
const DENO = "https://github.com/denoland/deno/releases/latest/download";

const byName = (platform: NodeJS.Platform, arch: string) =>
  Object.fromEntries(
    toolCatalog(platform, arch).map((tool) => [tool.name, tool]),
  );

describe("toolCatalog", () => {
  it("macOS Apple Silicon", () => {
    const tools = byName("darwin", "arm64");

    expect(tools["yt-dlp"].artifacts).toEqual([
      {
        url: `${YT}/yt-dlp_macos`,
        format: "raw",
        files: [{ entry: "yt-dlp_macos", target: "yt-dlp" }],
      },
    ]);
    expect(tools.ffmpeg.artifacts).toEqual([
      {
        url: `${MARTIN_RIEDL}/arm64/release/ffmpeg.zip`,
        format: "zip",
        files: [{ entry: "ffmpeg", target: "ffmpeg" }],
      },
      {
        url: `${MARTIN_RIEDL}/arm64/release/ffprobe.zip`,
        format: "zip",
        files: [{ entry: "ffprobe", target: "ffprobe" }],
      },
    ]);
    expect(tools.deno.artifacts).toEqual([
      {
        url: `${DENO}/deno-aarch64-apple-darwin.zip`,
        format: "zip",
        files: [{ entry: "deno", target: "deno" }],
      },
    ]);
  });

  it("macOS Intel", () => {
    const tools = byName("darwin", "x64");

    expect(tools.ffmpeg.artifacts[0].url).toBe(
      `${MARTIN_RIEDL}/amd64/release/ffmpeg.zip`,
    );
    expect(tools.deno.artifacts[0].url).toBe(
      `${DENO}/deno-x86_64-apple-darwin.zip`,
    );
  });

  it("Windows x64 (arm64 usa os mesmos binários, por emulação)", () => {
    for (const arch of ["x64", "arm64"]) {
      const tools = byName("win32", arch);

      expect(tools["yt-dlp"].artifacts[0]).toEqual({
        url: `${YT}/yt-dlp.exe`,
        format: "raw",
        files: [{ entry: "yt-dlp.exe", target: "yt-dlp.exe" }],
      });
      expect(tools.ffmpeg.artifacts).toEqual([
        {
          url: `${FFMPEG_BUILDS}/ffmpeg-master-latest-win64-gpl.zip`,
          format: "zip",
          files: [
            { entry: "ffmpeg.exe", target: "ffmpeg.exe" },
            { entry: "ffprobe.exe", target: "ffprobe.exe" },
          ],
        },
      ]);
      expect(tools.deno.artifacts[0]).toEqual({
        url: `${DENO}/deno-x86_64-pc-windows-msvc.zip`,
        format: "zip",
        files: [{ entry: "deno.exe", target: "deno.exe" }],
      });
    }
  });

  it.each([
    ["x64", "yt-dlp_linux", "linux64", "x86_64"],
    ["arm64", "yt-dlp_linux_aarch64", "linuxarm64", "aarch64"],
  ])("Linux %s", (arch, ytDlp, ffmpeg, deno) => {
    const tools = byName("linux", arch);

    expect(tools["yt-dlp"].artifacts[0].url).toBe(`${YT}/${ytDlp}`);
    expect(tools.ffmpeg.artifacts).toEqual([
      {
        url: `${FFMPEG_BUILDS}/ffmpeg-master-latest-${ffmpeg}-gpl.tar.xz`,
        format: "tar.xz",
        files: [
          { entry: "ffmpeg", target: "ffmpeg" },
          { entry: "ffprobe", target: "ffprobe" },
        ],
      },
    ]);
    expect(tools.deno.artifacts[0].url).toBe(
      `${DENO}/deno-${deno}-unknown-linux-gnu.zip`,
    );
  });

  it("rejeita plataformas sem binários disponíveis", () => {
    expect(() => toolCatalog("linux", "ia32")).toThrow(
      UnsupportedPlatformError,
    );
    expect(() => toolCatalog("freebsd", "x64")).toThrow(
      UnsupportedPlatformError,
    );
  });
});
