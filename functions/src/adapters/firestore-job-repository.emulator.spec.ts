import { Firestore } from 'firebase-admin/firestore';
import { beforeEach, describe, expect, it } from 'vitest';
import { FIRESTORE_DATABASE_ID } from '../config.js';
import type { Song } from '../domain/types.js';
import { FirestoreJobRepository } from './firestore-job-repository.js';

const PROJECT_ID = 'demo-music-downloader';
const db = new Firestore({ projectId: PROJECT_ID, databaseId: FIRESTORE_DATABASE_ID });
const repository = new FirestoreJobRepository(db);

const song = (id: string): Song => ({ spotifyId: id, name: `S${id}`, artists: ['A'], album: 'B', durationSeconds: 1 });

async function clearDatabase() {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  await fetch(`http://${host}/emulator/v1/projects/${PROJECT_ID}/databases/${FIRESTORE_DATABASE_ID}/documents`, { method: 'DELETE' });
}

async function newJob(total = 1) {
  return repository.createJob({
    ownerUid: 'u1',
    sourceUrl: 'spotify:album:x',
    source: { type: 'album', id: 'x' },
    songs: Array.from({ length: total }, (_, i) => song(String(i))),
  });
}

const read = async (path: string) => (await db.doc(path).get()).data()!;

describe('FirestoreJobRepository (Firestore Emulator, database music-downloader)', () => {
  beforeEach(clearDatabase);

  it('cria o job e as faixas pendentes', async () => {
    const jobId = await newJob(2);
    expect(await read(`downloadJobs/${jobId}`)).toMatchObject({ ownerUid: 'u1', totalTracks: 2, completedTracks: 0, failedTracks: 0 });
    expect(await read(`downloadJobs/${jobId}/tracks/001`)).toMatchObject({ ownerUid: 'u1', position: 1, status: 'pending' });
  });

  it('reivindica a faixa uma única vez, mesmo com entregas concorrentes', async () => {
    const jobId = await newJob();
    const claims = await Promise.all([repository.claimTrack(jobId, '000'), repository.claimTrack(jobId, '000')]);

    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(await repository.claimTrack(jobId, '000')).toBe(false);
    expect((await read(`downloadJobs/${jobId}/tracks/000`)).status).toBe('processing');
  });

  it('conclui a faixa e incrementa o contador uma única vez', async () => {
    const jobId = await newJob();
    await repository.claimTrack(jobId, '000');
    const result = { storagePath: 'p/x.mp3', videoId: 'v', score: 95 };

    await repository.completeTrack(jobId, '000', result);
    await repository.completeTrack(jobId, '000', result);
    await repository.failTrack(jobId, '000', 'atrasado');

    expect(await read(`downloadJobs/${jobId}/tracks/000`)).toMatchObject({ status: 'done', ...result });
    expect(await read(`downloadJobs/${jobId}`)).toMatchObject({ completedTracks: 1, failedTracks: 0 });
  });

  it('registra falha e incrementa o contador de falhas uma única vez', async () => {
    const jobId = await newJob();
    await repository.claimTrack(jobId, '000');

    await repository.failTrack(jobId, '000', 'sem match');
    await repository.failTrack(jobId, '000', 'sem match');

    expect(await read(`downloadJobs/${jobId}/tracks/000`)).toMatchObject({ status: 'failed', error: 'sem match' });
    expect(await read(`downloadJobs/${jobId}`)).toMatchObject({ completedTracks: 0, failedTracks: 1 });
  });

  it('ignora conclusão de faixa que não foi reivindicada', async () => {
    const jobId = await newJob();
    await repository.completeTrack(jobId, '000', { storagePath: 'p', videoId: 'v', score: 1 });

    expect((await read(`downloadJobs/${jobId}/tracks/000`)).status).toBe('pending');
    expect((await read(`downloadJobs/${jobId}`)).completedTracks).toBe(0);
  });
});
