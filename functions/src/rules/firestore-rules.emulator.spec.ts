import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, orderBy, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

const rules = readFileSync(new URL('../../../firestore.rules', import.meta.url), 'utf8');
let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-music-downloader-rules', firestore: { rules } });
});

afterAll(() => env.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'downloadJobs/j1'), { ownerUid: 'dono', totalTracks: 1 });
    await setDoc(doc(db, 'downloadJobs/j1/tracks/000'), { ownerUid: 'dono', position: 0, status: 'done' });
  });
});

const as = (uid: string | null) => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).firestore();

describe('firestore.rules', () => {
  it('o dono lê o próprio job; outros usuários e anônimos não', async () => {
    await assertSucceeds(getDoc(doc(as('dono'), 'downloadJobs/j1')));
    await assertFails(getDoc(doc(as('outro'), 'downloadJobs/j1')));
    await assertFails(getDoc(doc(as(null), 'downloadJobs/j1')));
  });

  it('o dono lê as faixas do próprio job', async () => {
    await assertSucceeds(getDoc(doc(as('dono'), 'downloadJobs/j1/tracks/000')));
    await assertSucceeds(
      getDocs(query(collection(as('dono'), 'downloadJobs/j1/tracks'), where('ownerUid', '==', 'dono'), orderBy('position'))),
    );
  });

  it('outros usuários e anônimos não leem faixas alheias', async () => {
    await assertFails(getDoc(doc(as('outro'), 'downloadJobs/j1/tracks/000')));
    await assertFails(getDoc(doc(as(null), 'downloadJobs/j1/tracks/000')));
    await assertFails(getDocs(query(collection(as('outro'), 'downloadJobs/j1/tracks'), where('ownerUid', '==', 'dono'))));
  });

  it('ninguém escreve em jobs ou faixas pelo cliente (somente o backend)', async () => {
    await assertFails(setDoc(doc(as('dono'), 'downloadJobs/novo'), { ownerUid: 'dono' }));
    await assertFails(updateDoc(doc(as('dono'), 'downloadJobs/j1'), { completedTracks: 99 }));
    await assertFails(updateDoc(doc(as('dono'), 'downloadJobs/j1/tracks/000'), { status: 'done' }));
    await assertFails(setDoc(doc(as('dono'), 'downloadJobs/j1/tracks/999'), { ownerUid: 'dono' }));
  });
});
