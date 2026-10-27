import { constants } from "node:fs";
import { copyFile, mkdir } from "node:fs/promises";
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import type { FileStorage } from "../domain/ports.js";

/** Salva os MP3 na pasta de músicas do usuário, sem nunca sobrescrever um arquivo existente. */
export class LocalFileStorage implements FileStorage {
  /** `baseDir` é lido a cada envio: o usuário pode trocar a pasta nas configurações. */
  constructor(private readonly baseDir: () => string) {}

  async upload(localPath: string, destination: string): Promise<string> {
    const base = resolve(this.baseDir());
    const target = resolve(base, destination);
    const fromBase = relative(base, target);
    // Só o segmento `..` sai da pasta; "...And Justice for All" é um nome válido.
    const escapes =
      fromBase === ".." ||
      fromBase.startsWith(`..${sep}`) ||
      isAbsolute(fromBase);
    if (escapes)
      throw new Error(`Destino fora da pasta de músicas: "${destination}"`);

    await mkdir(dirname(target), { recursive: true });
    for (let copy = 1; ; copy++) {
      const candidate = copy === 1 ? target : numbered(target, copy);
      try {
        await copyFile(localPath, candidate, constants.COPYFILE_EXCL);
        return candidate;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      }
    }
  }
}

function numbered(path: string, copy: number): string {
  const extension = extname(path);
  return join(
    dirname(path),
    `${basename(path, extension)} (${copy})${extension}`,
  );
}
