import type { SearchResult, Song } from "../domain/types.js";
import { ratio, slugify } from "./text.js";

/**
 * Pontuação de resultados inspirada em `spotdl/utils/matching.py` (spotDL, licença MIT):
 * combina similaridade de artistas, título, álbum e duração, descartando
 * resultados abaixo dos mesmos limiares usados pelo spotDL.
 */

const FORBIDDEN_WORDS = [
  "bassboosted",
  "remix",
  "remastered",
  "remaster",
  "reverb",
  "bassboost",
  "live",
  "acoustic",
  "8daudio",
  "concert",
  "acapella",
  "slowed",
  "instrumental",
  "cover",
];

const MIN_NAME_MATCH = 60;
const MIN_ARTISTS_MATCH = 70;
const MIN_TIME_MATCH = 25;

export interface ScoredResult {
  result: SearchResult;
  score: number;
}

/** Escolhe a faixa oficial (verificada) de maior nota; só recorre a vídeos se nenhuma for compatível. */
export function pickBestMatch(
  song: Song,
  results: SearchResult[],
): ScoredResult | null {
  const scored = results
    .map((result) => ({ result, score: scoreResult(song, result) }))
    .filter((item): item is ScoredResult => item.score !== null);

  const best = (items: ScoredResult[]) =>
    items.reduce<ScoredResult | null>(
      (top, item) => (top && top.score >= item.score ? top : item),
      null,
    );
  return best(scored.filter((item) => item.result.verified)) ?? best(scored);
}

/**
 * Busca por ISRC, como no spotDL: o YouTube Music costuma devolver a gravação exata, mas lista só
 * o artista principal, e a média com convidados reprovaria a faixa no `scoreResult`. Por isso basta
 * que o resultado verificado tenha título, artista principal e duração compatíveis.
 */
export function pickIsrcMatch(
  song: Song,
  results: SearchResult[],
): ScoredResult | null {
  const mainArtist = slugify(song.artists[0] ?? "");
  const match = results.find(
    (result) =>
      result.verified &&
      hasCommonWord(song.name, result.name) &&
      result.artists.some(
        (artist) => ratio(mainArtist, slugify(artist)) >= MIN_ARTISTS_MATCH,
      ) &&
      timeScore(song, result) >= MIN_TIME_MATCH,
  );
  return match ? { result: match, score: 100 } : null;
}

export function scoreResult(song: Song, result: SearchResult): number | null {
  if (!hasCommonWord(song.name, result.name)) return null;

  const artistsMatch = artistsScore(song, result);
  const nameMatch =
    nameScore(song, result) -
    15 * forbiddenWordsIn(song.name, result.name).length;
  const timeMatch = timeScore(song, result);

  if (
    nameMatch <= MIN_NAME_MATCH ||
    artistsMatch < MIN_ARTISTS_MATCH ||
    timeMatch < MIN_TIME_MATCH
  )
    return null;

  let average = (artistsMatch + nameMatch) / 2;

  // Álbum só reforça a nota: faixas oficiais costumam aparecer como single no YouTube Music.
  if (result.verified && result.album && song.album) {
    const albumMatch = ratio(slugify(song.album), slugify(result.album));
    if (albumMatch > 80)
      average = Math.max(average, (average + albumMatch) / 2);
  }

  if (timeMatch < 50 && average < 75) return null;

  if (average <= 85) {
    average = (average + timeMatch) / 2;
    if (
      song.explicit !== undefined &&
      result.explicit !== undefined &&
      song.explicit !== result.explicit
    ) {
      average -= 5;
    }
  }

  return Math.min(average, 100);
}

function timeScore(song: Song, result: SearchResult): number {
  return (
    Math.exp(-0.1 * Math.abs(song.durationSeconds - result.durationSeconds)) *
    100
  );
}

function words(value: string): string[] {
  return slugify(value).split("-").filter(Boolean);
}

function sortedSlug(value: string): string {
  return words(value).sort().join("-");
}

function hasCommonWord(songName: string, resultName: string): boolean {
  const haystack = slugify(resultName).replaceAll("-", "");
  return words(songName).some((word) => haystack.includes(word));
}

function forbiddenWordsIn(songName: string, resultName: string): string[] {
  const original = slugify(songName).replaceAll("-", "");
  const candidate = slugify(resultName).replaceAll("-", "");
  return FORBIDDEN_WORDS.filter(
    (word) => candidate.includes(word) && !original.includes(word),
  );
}

function nameScore(song: Song, result: SearchResult): number {
  const direct = ratio(sortedSlug(result.name), sortedSlug(song.name));
  if (direct > 75) return direct;

  // Vídeos costumam vir como "Artista - Título": compara incluindo os artistas.
  const songTitle = sortedSlug(`${song.artists.join(" ")} ${song.name}`);
  const resultTitle = sortedSlug(`${result.artists.join(" ")} ${result.name}`);
  return Math.max(direct, ratio(resultTitle, songTitle));
}

function artistsScore(song: Song, result: SearchResult): number {
  const songArtists = song.artists.map(slugify);
  const resultArtists = result.artists.map(slugify);

  const best = (artist: string) =>
    Math.max(0, ...resultArtists.map((candidate) => ratio(artist, candidate)));
  let score =
    resultArtists.length === 0
      ? 0
      : songArtists.reduce((sum, artist) => sum + best(artist), 0) /
        songArtists.length;

  // Resultado sem artistas compatíveis: aceita se os artistas aparecem no título.
  if (score < MIN_ARTISTS_MATCH) {
    const title = slugify(result.name);
    const found = songArtists.filter((artist) => title.includes(artist)).length;
    score = Math.max(score, (found / songArtists.length) * 100);
  }

  return score;
}
