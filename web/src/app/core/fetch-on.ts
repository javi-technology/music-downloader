import { EMPTY, Observable, catchError, switchMap } from 'rxjs';

/**
 * Faz a consulta a cada gatilho. Uma falha não encerra o stream: os dados anteriores continuam na
 * tela e o próximo gatilho (evento do servidor ou reconexão) tenta de novo.
 */
export function fetchOn<T>(
  triggers: Observable<unknown>,
  request: () => Observable<T>,
): Observable<T> {
  return triggers.pipe(
    switchMap(() =>
      request().pipe(
        catchError((error: unknown) => {
          console.error('Falha ao consultar o app local:', error);
          return EMPTY;
        }),
      ),
    ),
  );
}
