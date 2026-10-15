import { describe, expect, it } from "vitest";
import type { SearchResult, Song } from "../domain/types.js";
import { pickBestMatch, pickIsrcMatch, scoreResult } from "./matcher.js";

const song: Song = {
  spotifyId: "sp1",
  name: "Blinding Lights",
  artists: ["The Weeknd"],
  album: "After Hours",
  durationSeconds: 200,
};

const result = (overrides: Partial<SearchResult> = {}): SearchResult => ({
  videoId: "yt1",
  name: "Blinding Lights",
  artists: ["The Weeknd"],
  album: "After Hours",
  durationSeconds: 200,
  verified: true,
  ...overrides,
});

describe("scoreResult", () => {
  it("dá nota alta para o resultado idêntico", () => {
    expect(scoreResult(song, result())).toBeGreaterThanOrEqual(90);
  });

  it("descarta resultados sem nenhuma palavra em comum no título", () => {
    expect(scoreResult(song, result({ name: "Something Else" }))).toBeNull();
  });

  it("descarta resultados de outro artista", () => {
    expect(scoreResult(song, result({ artists: ["Coldplay"] }))).toBeNull();
  });

  it("descarta resultados com duração muito diferente", () => {
    expect(scoreResult(song, result({ durationSeconds: 260 }))).toBeNull();
  });

  it("penaliza palavras proibidas (remix, live...) ausentes no título original", () => {
    const original = scoreResult(song, result())!;
    const remix = scoreResult(
      song,
      result({ name: "Blinding Lights (Remix)" }),
    );
    expect(remix === null || remix < original).toBe(true);
  });

  it("não penaliza palavra proibida que já existe no título original", () => {
    const live: Song = { ...song, name: "Blinding Lights (Live)" };
    expect(
      scoreResult(live, result({ name: "Blinding Lights (Live)" })),
    ).toBeGreaterThanOrEqual(90);
  });

  it("aceita artista presente apenas no título (vídeos sem artistas)", () => {
    const score = scoreResult(
      song,
      result({
        name: "The Weeknd - Blinding Lights",
        artists: [],
        verified: false,
      }),
    );
    expect(score).not.toBeNull();
  });

  it("ignora acentos e caixa", () => {
    const br: Song = {
      ...song,
      name: "Garota de Ipanema",
      artists: ["João Gilberto"],
      album: "X",
    };
    expect(
      scoreResult(
        br,
        result({
          name: "garota de ipanema",
          artists: ["Joao Gilberto"],
          album: "X",
        }),
      ),
    ).toBeGreaterThanOrEqual(90);
  });

  it("não penaliza faixa oficial lançada como single (álbum diferente do Spotify)", () => {
    expect(
      scoreResult(
        song,
        result({ album: "Blinding Lights", durationSeconds: 202 }),
      ),
    ).toBeGreaterThanOrEqual(90);
  });

  it("nunca passa de 100", () => {
    expect(scoreResult(song, result())).toBeLessThanOrEqual(100);
  });
});

describe("pickBestMatch", () => {
  it("retorna null sem resultados válidos", () => {
    expect(pickBestMatch(song, [])).toBeNull();
    expect(pickBestMatch(song, [result({ artists: ["Coldplay"] })])).toBeNull();
  });

  it("escolhe o melhor resultado entre vários", () => {
    const best = pickBestMatch(song, [
      result({ videoId: "remix", name: "Blinding Lights (Remix)" }),
      result({ videoId: "longe", durationSeconds: 215 }),
      result({ videoId: "certo" }),
    ]);
    expect(best?.result.videoId).toBe("certo");
    expect(best?.score).toBeGreaterThanOrEqual(90);
  });

  it('prefere a faixa oficial (verificada) a uploads de terceiros com título "Artista - Música"', () => {
    const best = pickBestMatch(song, [
      result({
        videoId: "upload",
        name: "The Weeknd - Blinding Lights (Lyrics)",
        artists: ["4Words"],
        album: undefined,
        verified: false,
        durationSeconds: 200,
      }),
      result({
        videoId: "oficial",
        album: "Blinding Lights",
        durationSeconds: 202,
      }),
    ]);
    expect(best?.result.videoId).toBe("oficial");
  });

  it("usa vídeo não verificado quando não há faixa oficial compatível", () => {
    const best = pickBestMatch(song, [
      result({
        videoId: "outra",
        name: "Blinding Lights",
        artists: ["Cover Band"],
      }),
      result({
        videoId: "video",
        name: "The Weeknd - Blinding Lights",
        artists: [],
        album: undefined,
        verified: false,
      }),
    ]);
    expect(best?.result.videoId).toBe("video");
  });
});

describe("pickIsrcMatch", () => {
  const deTodaCor: Song = {
    spotifyId: "4bq3LdjzHTa2slHEiRr3gz",
    name: "De Toda Cor",
    artists: [
      "Renato Luciano",
      "Ney Matogrosso",
      "Oswaldo Montenegro",
      "Laila Garin",
      "Elisa Lucinda",
      "Paulinho Moska",
      "Pedro Luiz",
      "Emílio Dantas",
      "Léo Pinheiro",
    ],
    album: "De Toda Cor",
    durationSeconds: 295.402,
    isrc: "QM4TX1798119",
  };
  const official = result({
    videoId: "W-zaWXA8aRE",
    name: "De Toda Cor (feat. Ney Matogrosso, Oswaldo Montenegro, Laila Garin & Elisa Lucinda)",
    artists: ["Renato Luciano"],
    album: "De Toda Cor",
    durationSeconds: 296,
  });
  const unrelated = result({
    videoId: "lixo",
    name: "Rush E",
    artists: ["Impossible Piano Remix"],
    durationSeconds: 151,
  });

  it("aceita a faixa oficial mesmo quando o YouTube Music lista só o artista principal", () => {
    expect(scoreResult(deTodaCor, official)).toBeNull();
    expect(pickIsrcMatch(deTodaCor, [official, unrelated])?.result.videoId).toBe(
      "W-zaWXA8aRE",
    );
  });

  it("ignora resultados sem relação que a busca por ISRC também devolve", () => {
    expect(pickIsrcMatch(deTodaCor, [unrelated, official])?.result.videoId).toBe(
      "W-zaWXA8aRE",
    );
    expect(pickIsrcMatch(deTodaCor, [unrelated])).toBeNull();
  });

  it("ignora vídeos (resultados não verificados)", () => {
    expect(pickIsrcMatch(deTodaCor, [{ ...official, verified: false }])).toBeNull();
  });

  it("rejeita resultado de outro artista principal", () => {
    expect(
      pickIsrcMatch(deTodaCor, [{ ...official, artists: ["Marcelo Zarske"] }]),
    ).toBeNull();
  });

  it("rejeita resultado com duração muito diferente", () => {
    expect(
      pickIsrcMatch(deTodaCor, [{ ...official, durationSeconds: 197 }]),
    ).toBeNull();
  });
});
