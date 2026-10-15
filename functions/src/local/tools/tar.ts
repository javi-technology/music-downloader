import { execFile } from "node:child_process";
import { promisify } from "node:util";

/** Usa o `tar` do sistema: o Node não descompacta xz, e todo Linux tem `tar` com suporte a ele. */
export async function extractTarXz(
  archive: string,
  destination: string,
): Promise<void> {
  try {
    await promisify(execFile)("tar", ["-xJf", archive, "-C", destination]);
  } catch (error) {
    throw new Error(
      `Não foi possível extrair o pacote com o tar do sistema: ${(error as Error).message}`,
    );
  }
}
