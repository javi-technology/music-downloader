import { describe, expect, it } from "vitest";
import { attachmentDisposition } from "./content-disposition.js";

describe("attachmentDisposition", () => {
  it("inclui nome ASCII e nome UTF-8 (RFC 5987)", () => {
    expect(attachmentDisposition("De Toda Cor (Ação).mp3")).toBe(
      `attachment; filename="De Toda Cor (A__o).mp3"; filename*=UTF-8''De%20Toda%20Cor%20%28A%C3%A7%C3%A3o%29.mp3`,
    );
  });
});
