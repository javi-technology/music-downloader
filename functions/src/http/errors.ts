import { HttpsError } from 'firebase-functions/v2/https';
import { EmptySourceError, TooManyTracksError } from '../jobs/use-cases.js';
import { InvalidSpotifyUrlError } from '../spotify/url.js';

export function toHttpsError(error: unknown): HttpsError {
  if (error instanceof HttpsError) return error;
  if (error instanceof InvalidSpotifyUrlError) return new HttpsError('invalid-argument', error.message);
  if (error instanceof EmptySourceError) return new HttpsError('not-found', error.message);
  if (error instanceof TooManyTracksError) return new HttpsError('failed-precondition', error.message);
  return new HttpsError('internal', 'Erro interno ao processar a solicitação');
}
