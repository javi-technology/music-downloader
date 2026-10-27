import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { contentTypeFor, directoryAssets, seaAssets } from "./web-assets.js";

describe("contentTypeFor", () => {
  it("reconhece os tipos do build do Angular", () => {
    expect(contentTypeFor("index.html")).toBe("text/html; charset=utf-8");
    expect(contentTypeFor("main-ABC.js")).toBe(
      "text/javascript; charset=utf-8",
    );
    expect(contentTypeFor("styles-ABC.css")).toBe("text/css; charset=utf-8");
    expect(contentTypeFor("favicon.ico")).toBe("image/x-icon");
    expect(contentTypeFor("media/logo.svg")).toBe("image/svg+xml");
    expect(contentTypeFor("fonts/x.woff2")).toBe("font/woff2");
  });

  it("usa binário genérico para extensões desconhecidas", () => {
    expect(contentTypeFor("arquivo.xyz")).toBe("application/octet-stream");
  });
});

describe("directoryAssets", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "md-web-"));
    await mkdir(join(root, "media"));
    await writeFile(join(root, "index.html"), "<html></html>");
    await writeFile(join(root, "media", "logo.svg"), "<svg/>");
  });

  afterEach(() => rm(root, { recursive: true, force: true }));

  it("lê arquivos da pasta, inclusive em subpastas", () => {
    const assets = directoryAssets(root);

    expect(assets.get("index.html")?.toString()).toBe("<html></html>");
    expect(assets.get("media/logo.svg")?.toString()).toBe("<svg/>");
  });

  it("não encontra arquivos ausentes nem pastas", () => {
    const assets = directoryAssets(root);

    expect(assets.get("nada.js")).toBeUndefined();
    expect(assets.get("media")).toBeUndefined();
  });

  it("aceita arquivos cujo nome começa com dois pontos", async () => {
    await writeFile(join(root, "..fonte.woff2"), "f");

    expect(directoryAssets(root).get("..fonte.woff2")?.toString()).toBe("f");
  });

  it("não sai da pasta (path traversal)", () => {
    const assets = directoryAssets(join(root, "media"));

    expect(assets.get("../index.html")).toBeUndefined();
    expect(assets.get("/etc/passwd")).toBeUndefined();
  });
});

describe("seaAssets", () => {
  it("lê os arquivos embutidos no executável pelo nome", () => {
    const getAsset = vi.fn((key: string) => {
      if (key !== "web/index.html") throw new Error("No matching asset found");
      return new TextEncoder().encode("<html></html>").buffer;
    });
    const assets = seaAssets(getAsset);

    expect(assets.get("index.html")?.toString()).toBe("<html></html>");
    expect(getAsset).toHaveBeenCalledWith("web/index.html");
  });

  it("devolve undefined quando o arquivo não foi embutido", () => {
    const assets = seaAssets(() => {
      throw new Error("No matching asset found");
    });

    expect(assets.get("nada.js")).toBeUndefined();
  });
});
