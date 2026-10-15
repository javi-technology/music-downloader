import { describe, expect, it } from 'vitest';
import type { SearchResult, Song } from '../domain/types.js';
import { pickBestMatch, scoreResult } from './matcher.js';

const song: Song = {
  spotifyId: 'sp1',
  name: 'Blinding Lights',
  artists: ['The Weeknd'],
  album: 'After Hours',
  durationSeconds: 200,
};

const result = (overrides: Partial<SearchResult> = {}): SearchResult => ({
  videoId: 'yt1',
  name: 'Blinding Lights',
  artists: ['The Weeknd'],
  album: 'After Hours',
  durationSeconds: 200,
  verified: true,
  ...overrides,
});

describe('scoreResult', () => {
  it('dá nota alta para o resultado idêntico', () => {
    expect(scoreResult(song, result())).toBeGreaterThanOrEqual(90);
  });

  it('descarta resultados sem nenhuma palavra em comum no título', () => {
    expect(scoreResult(song, result({ name: 'Something Else' }))).toBeNull();
  });

  it('descarta resultados de outro artista', () => {
    expect(scoreResult(song, result({ artists: ['Coldplay'] }))).toBeNull();
  });

  it('descarta resultados com duração muito diferente', () => {
    expect(scoreResult(song, result({ durationSeconds: 260 }))).toBeNull();
  });

  it('penaliza palavras proibidas (remix, live...) ausentes no título original', () => {
    const original = scoreResult(song, result())!;
    const remix = scoreResult(song, result({ name: 'Blinding Lights (Remix)' }));
    expect(remix === null || remix < original).toBe(true);
  });

  it('não penaliza palavra proibida que já existe no título original', () => {
    const live: Song = { ...song, name: 'Blinding Lights (Live)' };
    expect(scoreResult(live, result({ name: 'Blinding Lights (Live)' }))).toBeGreaterThanOrEqual(90);
  });

  it('aceita artista presente apenas no título (vídeos sem artistas)', () => {
    const score = scoreResult(song, result({ name: 'The Weeknd - Blinding Lights', artists: [], verified: false }));
    expect(score).not.toBeNull();
  });

  it('ignora acentos e caixa', () => {
    const br: Song = { ...song, name: 'Garota de Ipanema', artists: ['João Gilberto'], album: 'X' };
    expect(scoreResult(br, result({ name: 'garota de ipanema', artists: ['Joao Gilberto'], album: 'X' }))).toBeGreaterThanOrEqual(90);
  });

  it('nunca passa de 100', () => {
    expect(scoreResult(song, result())).toBeLessThanOrEqual(100);
  });
});

describe('pickBestMatch', () => {
  it('retorna null sem resultados válidos', () => {
    expect(pickBestMatch(song, [])).toBeNull();
    expect(pickBestMatch(song, [result({ artists: ['Coldplay'] })])).toBeNull();
  });

  it('escolhe o melhor resultado entre vários', () => {
    const best = pickBestMatch(song, [
      result({ videoId: 'remix', name: 'Blinding Lights (Remix)' }),
      result({ videoId: 'longe', durationSeconds: 215 }),
      result({ videoId: 'certo' }),
    ]);
    expect(best?.result.videoId).toBe('certo');
    expect(best?.score).toBeGreaterThanOrEqual(90);
  });
});
