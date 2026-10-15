import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * O emulador não exige índices compostos, mas o Firestore real sim: este contrato garante que
 * cada consulta do frontend (`web/src/app/jobs/firebase-jobs.gateway.ts`) tem seu índice.
 */
const { indexes } = JSON.parse(readFileSync(new URL('../../../firestore.indexes.json', import.meta.url), 'utf8')) as {
  indexes: { collectionGroup: string; queryScope: string; fields: { fieldPath: string; order: string }[] }[];
};

const hasIndex = (collectionGroup: string, fields: [string, string][]) =>
  indexes.some(
    (index) =>
      index.collectionGroup === collectionGroup &&
      index.queryScope === 'COLLECTION' &&
      JSON.stringify(index.fields.map((f) => [f.fieldPath, f.order])) === JSON.stringify(fields),
  );

describe('firestore.indexes.json', () => {
  it('cobre a listagem de jobs do usuário (ownerUid ==, createdAt desc)', () => {
    expect(hasIndex('downloadJobs', [['ownerUid', 'ASCENDING'], ['createdAt', 'DESCENDING']])).toBe(true);
  });

  it('cobre a listagem de faixas do job (ownerUid ==, position asc)', () => {
    expect(hasIndex('tracks', [['ownerUid', 'ASCENDING'], ['position', 'ASCENDING']])).toBe(true);
  });
});
