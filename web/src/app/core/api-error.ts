import { HttpErrorResponse } from '@angular/common/http';

/** Converte a resposta de erro da API local (`{ error }`) numa mensagem para o usuário. */
export function apiError(error: unknown): Error {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0)
      return new Error('Não foi possível falar com o app. Confira se ele continua aberto.');
    const message = (error.error as { error?: unknown } | null)?.error;
    if (typeof message === 'string') return new Error(message);
  }
  return error instanceof Error ? error : new Error('Erro inesperado');
}
