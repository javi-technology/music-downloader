import { FieldValue } from 'firebase-admin/firestore';
import { describe, expect, it, vi } from 'vitest';
import type { Song } from '../domain/types.js';
import { FirestoreJobRepository } from './firestore-job-repository.js';

const song = (id: string): Song => ({ spotifyId: id, name: `S${id}`, artists: ['A'], album: 'B', durationSeconds: 1 });

function fakeDb() {
  const writes: { path: string; data: unknown }[] = [];
  const updates: { path: string; data: unknown }[] = [];
  const ref = (path: string): any => ({
    id: path.split('/').at(-1),
    path,
    collection: (name: string) => collection(`${path}/${name}`),
    update: vi.fn(async (data: unknown) => void updates.push({ path, data })),
  });
  const collection = (path: string) => ({
    doc: (id?: string) => ref(`${path}/${id ?? 'job1'}`),
  });
  const batch = { set: vi.fn((r: any, data: unknown) => void writes.push({ path: r.path, data })), commit: vi.fn(async () => {}) };
  return { db: { collection, batch: () => batch } as any, writes, updates, batch };
}

describe('FirestoreJobRepository', () => {
  it('cria o job e as faixas em um único batch', async () => {
    const { db, writes, batch } = fakeDb();
    const repo = new FirestoreJobRepository(db);

    const id = await repo.createJob({
      ownerUid: 'u1',
      sourceUrl: 'spotify:album:x',
      source: { type: 'album', id: 'x' },
      songs: [song('a'), song('b')],
    });

    expect(id).toBe('job1');
    expect(batch.commit).toHaveBeenCalledOnce();
    expect(writes[0]).toEqual({
      path: 'downloadJobs/job1',
      data: {
        ownerUid: 'u1',
        sourceUrl: 'spotify:album:x',
        source: { type: 'album', id: 'x' },
        totalTracks: 2,
        completedTracks: 0,
        failedTracks: 0,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
    });
    expect(writes.slice(1)).toEqual([
      {
        path: 'downloadJobs/job1/tracks/000',
        data: { ownerUid: 'u1', position: 0, song: song('a'), status: 'pending', createdAt: FieldValue.serverTimestamp() },
      },
      {
        path: 'downloadJobs/job1/tracks/001',
        data: { ownerUid: 'u1', position: 1, song: song('b'), status: 'pending', createdAt: FieldValue.serverTimestamp() },
      },
    ]);
  });

  it('marca faixa concluída e incrementa o contador do job', async () => {
    const { db, updates } = fakeDb();
    await new FirestoreJobRepository(db).markTrackDone('j', '001', { storagePath: 'p', videoId: 'v', score: 90 });
    expect(updates).toEqual([
      {
        path: 'downloadJobs/j/tracks/001',
        data: { status: 'done', storagePath: 'p', videoId: 'v', score: 90, updatedAt: FieldValue.serverTimestamp() },
      },
      { path: 'downloadJobs/j', data: { completedTracks: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() } },
    ]);
  });

  it('marca faixa com falha e incrementa o contador de falhas', async () => {
    const { db, updates } = fakeDb();
    await new FirestoreJobRepository(db).markTrackFailed('j', '001', 'erro');
    expect(updates).toEqual([
      { path: 'downloadJobs/j/tracks/001', data: { status: 'failed', error: 'erro', updatedAt: FieldValue.serverTimestamp() } },
      { path: 'downloadJobs/j', data: { failedTracks: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() } },
    ]);
  });

  it('marca faixa como processando', async () => {
    const { db, updates } = fakeDb();
    await new FirestoreJobRepository(db).markTrackProcessing('j', '001');
    expect(updates).toEqual([{ path: 'downloadJobs/j/tracks/001', data: { status: 'processing', updatedAt: FieldValue.serverTimestamp() } }]);
  });
});
