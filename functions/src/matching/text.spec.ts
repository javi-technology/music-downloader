import { describe, expect, it } from 'vitest';
import { ratio, slugify } from './text.js';

describe('slugify', () => {
  it('normaliza para minúsculas separadas por hífen', () => {
    expect(slugify('Hello World!')).toBe('hello-world');
  });

  it('remove acentos e caracteres especiais', () => {
    expect(slugify('Pássaro  Café (Ao Vivo)')).toBe('passaro-cafe-ao-vivo');
  });

  it('não deixa hífens nas pontas', () => {
    expect(slugify(' - Test - ')).toBe('test');
  });
});

describe('ratio (similaridade Indel, 0–100)', () => {
  it('retorna 100 para strings iguais', () => {
    expect(ratio('abc', 'abc')).toBe(100);
  });

  it('retorna 100 para duas strings vazias', () => {
    expect(ratio('', '')).toBe(100);
  });

  it('retorna 0 quando não há caracteres em comum', () => {
    expect(ratio('abc', 'xyz')).toBe(0);
  });

  it('calcula 2*LCS/(len1+len2)', () => {
    // LCS("kitten","sitting") = 4 → 8/13
    expect(ratio('kitten', 'sitting')).toBeCloseTo((8 / 13) * 100, 5);
  });
});
