import { describe, expect, it } from "vitest";
import { releaseAssetName, seaConfig, spotifyDefines } from "./executable.js";

describe("releaseAssetName", () => {
  it("nomeia o executável por sistema e arquitetura", () => {
    expect(releaseAssetName("darwin", "arm64")).toBe(
      "music-downloader-macos-arm64",
    );
    expect(releaseAssetName("darwin", "x64")).toBe(
      "music-downloader-macos-x64",
    );
    expect(releaseAssetName("linux", "arm64")).toBe(
      "music-downloader-linux-arm64",
    );
    expect(releaseAssetName("win32", "x64")).toBe(
      "music-downloader-windows-x64.exe",
    );
  });
});

describe("seaConfig", () => {
  it("embute cada arquivo do site como asset `web/<caminho>`", () => {
    const config = seaConfig({
      main: "dist/main.cjs",
      output: "dist/music-downloader",
      webDir: "/web/browser",
      webFiles: ["index.html", "media/logo.svg"],
    });

    expect(config).toEqual({
      main: "dist/main.cjs",
      output: "dist/music-downloader",
      disableExperimentalSEAWarning: true,
      useSnapshot: false,
      useCodeCache: false,
      assets: {
        "web/index.html": "/web/browser/index.html",
        "web/media/logo.svg": "/web/browser/media/logo.svg",
      },
    });
  });

  it("usa barras normais nas chaves mesmo com caminhos do Windows", () => {
    const config = seaConfig({
      main: "main.cjs",
      output: "music-downloader.exe",
      webDir: "C:\\web",
      webFiles: ["index.html", "media\\logo.svg"],
    });

    expect(Object.keys(config.assets)).toEqual([
      "web/index.html",
      "web/media/logo.svg",
    ]);
  });

  it("exige o index.html (build do Angular ausente)", () => {
    expect(() =>
      seaConfig({ main: "m", output: "o", webDir: "/w", webFiles: [] }),
    ).toThrow(/index\.html/);
  });
});

describe("spotifyDefines", () => {
  it("troca a leitura das variáveis pelos valores dos secrets", () => {
    expect(
      spotifyDefines({
        MUSIC_DOWNLOADER_SPOTIFY_CLIENT_ID: "id",
        MUSIC_DOWNLOADER_SPOTIFY_CLIENT_SECRET: 'se"cret',
      }),
    ).toEqual({
      embedded: true,
      define: {
        "process.env.MUSIC_DOWNLOADER_SPOTIFY_CLIENT_ID": '"id"',
        "process.env.MUSIC_DOWNLOADER_SPOTIFY_CLIENT_SECRET": '"se\\"cret"',
      },
    });
  });

  it("sem os dois secrets, não embute nada", () => {
    expect(
      spotifyDefines({ MUSIC_DOWNLOADER_SPOTIFY_CLIENT_ID: "id" }),
    ).toEqual({ embedded: false, define: {} });
  });
});
