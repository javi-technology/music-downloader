import { crc32, deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { extractZipEntries } from "./zip.js";

interface Entry {
  name: string;
  data: Buffer;
  method: 0 | 8;
}

/** Gera um zip mínimo (sem zip64) com entradas armazenadas (0) ou comprimidas (8). */
function makeZip(entries: Entry[], options: { corruptCrc?: boolean } = {}) {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const body = entry.method === 8 ? deflateRawSync(entry.data) : entry.data;
    const crc = (crc32(entry.data) ^ (options.corruptCrc ? 1 : 0)) >>> 0;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(entry.method, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(entry.method, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);

    offset += local.length + name.length + body.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

describe("extractZipEntries", () => {
  const binary = Buffer.from(Array.from({ length: 5000 }, (_, i) => i % 251));

  it("extrai entradas comprimidas e armazenadas, procurando pelo nome em qualquer pasta", () => {
    const zip = makeZip([
      { name: "ffmpeg-build/", data: Buffer.alloc(0), method: 0 },
      { name: "ffmpeg-build/bin/ffmpeg.exe", data: binary, method: 8 },
      {
        name: "ffmpeg-build/bin/ffprobe.exe",
        data: Buffer.from("probe"),
        method: 0,
      },
      {
        name: "ffmpeg-build/doc/readme.txt",
        data: Buffer.from("x"),
        method: 8,
      },
    ]);

    const files = extractZipEntries(zip, ["ffmpeg.exe", "ffprobe.exe"]);

    expect(files.get("ffmpeg.exe")).toEqual(binary);
    expect(files.get("ffprobe.exe")?.toString()).toBe("probe");
    expect(files.size).toBe(2);
  });

  it("falha quando falta uma entrada pedida", () => {
    const zip = makeZip([{ name: "deno", data: binary, method: 8 }]);
    expect(() => extractZipEntries(zip, ["deno.exe"])).toThrow(/deno\.exe/);
  });

  it("detecta arquivo corrompido pelo CRC", () => {
    const zip = makeZip([{ name: "deno", data: binary, method: 8 }], {
      corruptCrc: true,
    });
    expect(() => extractZipEntries(zip, ["deno"])).toThrow(/corrompid/);
  });

  it("rejeita o que não é zip", () => {
    expect(() => extractZipEntries(Buffer.from("<html>"), ["deno"])).toThrow(
      /zip/,
    );
  });
});
