import { crc32, inflateRawSync } from "node:zlib";

const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const CENTRAL_FILE_HEADER = 0x02014b50;
const LOCAL_FILE_HEADER = 0x04034b50;
const STORED = 0;
const DEFLATED = 8;

/**
 * Extrai do zip os arquivos com os nomes pedidos (comparando só o nome, sem as pastas).
 * Suficiente para os pacotes do ffmpeg e do deno: sem zip64, sem criptografia, deflate ou stored.
 */
export function extractZipEntries(
  zip: Buffer,
  names: string[],
): Map<string, Buffer> {
  const end = findEndOfCentralDirectory(zip);
  const count = zip.readUInt16LE(end + 10);
  let cursor = zip.readUInt32LE(end + 16);

  const files = new Map<string, Buffer>();
  for (let i = 0; i < count; i++) {
    if (zip.readUInt32LE(cursor) !== CENTRAL_FILE_HEADER)
      throw new Error("Arquivo zip inválido");
    const method = zip.readUInt16LE(cursor + 10);
    const crc = zip.readUInt32LE(cursor + 16);
    const compressedSize = zip.readUInt32LE(cursor + 20);
    const size = zip.readUInt32LE(cursor + 24);
    const nameLength = zip.readUInt16LE(cursor + 28);
    const extraLength = zip.readUInt16LE(cursor + 30);
    const commentLength = zip.readUInt16LE(cursor + 32);
    const localOffset = zip.readUInt32LE(cursor + 42);
    const path = zip.toString("utf8", cursor + 46, cursor + 46 + nameLength);
    cursor += 46 + nameLength + extraLength + commentLength;

    const name = path.split("/").at(-1) ?? "";
    if (!names.includes(name) || files.has(name)) continue;

    const data = readEntry(zip, localOffset, method, compressedSize);
    if (data.length !== size || crc32(data) >>> 0 !== crc)
      throw new Error(`Arquivo corrompido no zip: ${path}`);
    files.set(name, data);
  }

  const missing = names.filter((name) => !files.has(name));
  if (missing.length > 0)
    throw new Error(`Arquivos ausentes no zip: ${missing.join(", ")}`);
  return files;
}

function findEndOfCentralDirectory(zip: Buffer): number {
  // O registro final tem 22 bytes + comentário opcional de até 64 KiB.
  const stop = Math.max(0, zip.length - 22 - 0xffff);
  for (let offset = zip.length - 22; offset >= stop; offset--) {
    if (zip.readUInt32LE(offset) === END_OF_CENTRAL_DIRECTORY) return offset;
  }
  throw new Error("O download não é um arquivo zip válido");
}

function readEntry(
  zip: Buffer,
  offset: number,
  method: number,
  compressedSize: number,
): Buffer {
  if (zip.readUInt32LE(offset) !== LOCAL_FILE_HEADER)
    throw new Error("Arquivo zip inválido");
  const start =
    offset + 30 + zip.readUInt16LE(offset + 26) + zip.readUInt16LE(offset + 28);
  const body = zip.subarray(start, start + compressedSize);
  if (method === STORED) return Buffer.from(body);
  if (method === DEFLATED) return inflateRawSync(body);
  throw new Error(`Compressão de zip não suportada: ${method}`);
}
