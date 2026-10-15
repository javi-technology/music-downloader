import { HttpsError } from 'firebase-functions/v2/https';
import { describe, expect, it } from 'vitest';
import { EmptySourceError, TooManyTracksError } from '../jobs/use-cases.js';
import { InvalidSpotifyUrlError } from '../spotify/url.js';
import { toHttpsError } from './errors.js';

describe('toHttpsError', () => {
  it.each([
    [new InvalidSpotifyUrlError('x'), 'invalid-argument'],
    [new EmptySourceError(), 'not-found'],
    [new TooManyTracksError(999), 'failed-precondition'],
    [new Error('boom'), 'internal'],
  ])('mapeia %s para %s', (error, code) => {
    const mapped = toHttpsError(error);
    expect(mapped).toBeInstanceOf(HttpsError);
    expect(mapped.code).toBe(code);
  });

  it('mantém a mensagem de erros de domínio e esconde a de erros internos', () => {
    expect(toHttpsError(new EmptySourceError()).message).toBe(new EmptySourceError().message);
    expect(toHttpsError(new Error('segredo')).message).not.toContain('segredo');
  });

  it('repassa HttpsError sem alterar', () => {
    const original = new HttpsError('unauthenticated', 'x');
    expect(toHttpsError(original)).toBe(original);
  });
});
