import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { extractTarXz } from "./tar.js";

describe.skipIf(process.platform === "win32")("extractTarXz", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "md-tar-"));
  });

  afterEach(() => rm(dir, { recursive: true, force: true }));

  it("extrai um .tar.xz com o tar do sistema", async () => {
    await mkdir(join(dir, "src", "build", "bin"), { recursive: true });
    await writeFile(join(dir, "src", "build", "bin", "ffmpeg"), "ffmpeg-bin");
    const archive = join(dir, "pkg.tar.xz");
    execFileSync("tar", ["-cJf", archive, "-C", join(dir, "src"), "build"]);
    await mkdir(join(dir, "out"));

    await extractTarXz(archive, join(dir, "out"));

    expect(
      await readFile(join(dir, "out", "build", "bin", "ffmpeg"), "utf8"),
    ).toBe("ffmpeg-bin");
  });

  it("falha com mensagem clara quando o pacote é inválido", async () => {
    const archive = join(dir, "pkg.tar.xz");
    await writeFile(archive, "nao e tar");

    await expect(extractTarXz(archive, dir)).rejects.toThrow(/tar/);
  });
});
