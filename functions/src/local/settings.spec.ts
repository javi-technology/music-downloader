import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SettingsStore, defaultPaths } from "./settings.js";

describe("defaultPaths", () => {
  it("macOS: Application Support e ~/Music", () => {
    expect(
      defaultPaths({ platform: "darwin", home: "/Users/ana", env: {} }),
    ).toEqual({
      dataDir: "/Users/ana/Library/Application Support/Music Downloader",
      downloadDir: "/Users/ana/Music/Music Downloader",
    });
  });

  it("Windows: %APPDATA% e Música do usuário", () => {
    expect(
      defaultPaths({
        platform: "win32",
        home: "C:\\Users\\ana",
        env: { APPDATA: "C:\\Users\\ana\\AppData\\Roaming" },
      }),
    ).toEqual({
      dataDir: "C:\\Users\\ana\\AppData\\Roaming\\Music Downloader",
      downloadDir: "C:\\Users\\ana\\Music\\Music Downloader",
    });
  });

  it("Linux: XDG_DATA_HOME quando definido", () => {
    expect(
      defaultPaths({
        platform: "linux",
        home: "/home/ana",
        env: { XDG_DATA_HOME: "/data" },
      }).dataDir,
    ).toBe("/data/music-downloader");
  });

  it("Linux: ~/.local/share como padrão", () => {
    expect(
      defaultPaths({ platform: "linux", home: "/home/ana", env: {} }),
    ).toEqual({
      dataDir: "/home/ana/.local/share/music-downloader",
      downloadDir: "/home/ana/Music/Music Downloader",
    });
  });
});

describe("SettingsStore", () => {
  let dir: string;
  let file: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "md-settings-"));
    file = join(dir, "config", "settings.json");
  });

  afterEach(() => rm(dir, { recursive: true, force: true }));

  const store = () => new SettingsStore(file, { downloadDir: "/music" });

  it("começa com a pasta padrão e sem Spotify configurado", () => {
    expect(store().publicView()).toEqual({
      spotifyConfigured: false,
      downloadDir: "/music",
    });
  });

  it("salva as credenciais e a pasta, persistindo no arquivo", () => {
    store().update({
      spotifyClientId: " id ",
      spotifyClientSecret: " secret ",
      downloadDir: "/outra",
    });

    expect(store().get()).toEqual({
      spotifyClientId: "id",
      spotifyClientSecret: "secret",
      downloadDir: "/outra",
    });
  });

  it("nunca expõe o client secret na visão pública", () => {
    const settings = store();
    settings.update({ spotifyClientId: "id", spotifyClientSecret: "secret" });

    expect(settings.publicView()).toEqual({
      spotifyConfigured: true,
      spotifyClientId: "id",
      downloadDir: "/music",
    });
  });

  it("mantém o secret salvo quando a atualização não o informa", () => {
    const settings = store();
    settings.update({ spotifyClientId: "id", spotifyClientSecret: "secret" });
    settings.update({ spotifyClientId: "novo" });

    expect(settings.get().spotifyClientSecret).toBe("secret");
  });

  it("rejeita pasta de destino relativa", () => {
    expect(() => store().update({ downloadDir: "musicas" })).toThrow(
      /caminho absoluto/,
    );
  });

  it("grava o arquivo legível só pelo usuário (contém o secret)", async () => {
    store().update({ spotifyClientSecret: "secret" });

    expect(JSON.parse(await readFile(file, "utf8")).spotifyClientSecret).toBe(
      "secret",
    );
    if (process.platform !== "win32")
      expect((await stat(file)).mode & 0o777).toBe(0o600);
  });
});
