import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LocalFileStorage } from "./local-file-storage.js";

describe("LocalFileStorage", () => {
  let root: string;
  let source: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "md-storage-"));
    source = join(root, "work.mp3");
    await writeFile(source, "audio");
  });

  afterEach(() => rm(root, { recursive: true, force: true }));

  const storage = () => new LocalFileStorage(() => join(root, "Music"));

  it("copia o arquivo para a pasta de destino (criando-a) e devolve o caminho absoluto", async () => {
    const saved = await storage().upload(source, "After Hours/Blinding Lights.mp3");

    expect(saved).toBe(join(root, "Music", "After Hours", "Blinding Lights.mp3"));
    expect(await readFile(saved, "utf8")).toBe("audio");
  });

  it("salva na raiz quando o destino não tem pasta", async () => {
    expect(await storage().upload(source, "./Song.mp3")).toBe(
      join(root, "Music", "Song.mp3"),
    );
  });

  it("não sobrescreve: numera o arquivo quando o nome já existe", async () => {
    const first = await storage().upload(source, "A/Song.mp3");
    const second = await storage().upload(source, "A/Song.mp3");
    const third = await storage().upload(source, "A/Song.mp3");

    expect(first).toBe(join(root, "Music", "A", "Song.mp3"));
    expect(second).toBe(join(root, "Music", "A", "Song (2).mp3"));
    expect(third).toBe(join(root, "Music", "A", "Song (3).mp3"));
  });

  it("usa a pasta base atual a cada envio (configuração pode mudar)", async () => {
    let base = join(root, "Primeira");
    const dynamic = new LocalFileStorage(() => base);
    await dynamic.upload(source, "./a.mp3");
    base = join(root, "Segunda");

    expect(await dynamic.upload(source, "./a.mp3")).toBe(join(root, "Segunda", "a.mp3"));
  });

  it("recusa destinos fora da pasta base", async () => {
    await expect(storage().upload(source, "../fora.mp3")).rejects.toThrow(
      /fora da pasta/,
    );
  });
});
