import { describe, expect, it } from "vitest";
import { makeZip } from "./__fixtures__/make-zip.js";
import { extractZipEntries } from "./zip.js";

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
