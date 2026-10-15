import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { COLLECTIONS } from '../config.js';
import type { JobRepository, NewJob } from '../jobs/types.js';

export const TRACKS_SUBCOLLECTION = 'tracks';

/** Persistência dos jobs no database nomeado `music-downloader`. */
export class FirestoreJobRepository implements JobRepository {
  constructor(private readonly db: Firestore) {}

  async createJob(job: NewJob): Promise<string> {
    const jobRef = this.db.collection(COLLECTIONS.jobs).doc();
    const batch = this.db.batch();
    const now = FieldValue.serverTimestamp();

    batch.set(jobRef, {
      ownerUid: job.ownerUid,
      sourceUrl: job.sourceUrl,
      source: job.source,
      totalTracks: job.songs.length,
      completedTracks: 0,
      failedTracks: 0,
      createdAt: now,
      updatedAt: now,
    });

    job.songs.forEach((song, position) => {
      const trackRef = jobRef.collection(TRACKS_SUBCOLLECTION).doc(String(position).padStart(3, '0'));
      batch.set(trackRef, { ownerUid: job.ownerUid, position, song, status: 'pending', createdAt: now });
    });

    await batch.commit();
    return jobRef.id;
  }

  async claimTrack(jobId: string, trackId: string): Promise<boolean> {
    const track = this.track(jobId, trackId);
    return this.db.runTransaction(async (tx) => {
      const snapshot = await tx.get(track);
      if (snapshot.get('status') !== 'pending') return false;
      tx.update(track, { status: 'processing', updatedAt: FieldValue.serverTimestamp() });
      return true;
    });
  }

  async completeTrack(jobId: string, trackId: string, result: { storagePath: string; videoId: string; score: number }): Promise<void> {
    await this.finishTrack(jobId, trackId, { status: 'done', ...result }, 'completedTracks');
  }

  async failTrack(jobId: string, trackId: string, error: string): Promise<void> {
    await this.finishTrack(jobId, trackId, { status: 'failed', error }, 'failedTracks');
  }

  /** Transição final + contador do job na mesma transação, só a partir de `processing`. */
  private async finishTrack(
    jobId: string,
    trackId: string,
    data: Record<string, unknown>,
    counter: 'completedTracks' | 'failedTracks',
  ): Promise<void> {
    const track = this.track(jobId, trackId);
    await this.db.runTransaction(async (tx) => {
      const snapshot = await tx.get(track);
      if (snapshot.get('status') !== 'processing') return;
      const now = FieldValue.serverTimestamp();
      tx.update(track, { ...data, updatedAt: now });
      tx.update(this.job(jobId), { [counter]: FieldValue.increment(1), updatedAt: now });
    });
  }

  private job(jobId: string) {
    return this.db.collection(COLLECTIONS.jobs).doc(jobId);
  }

  private track(jobId: string, trackId: string) {
    return this.job(jobId).collection(TRACKS_SUBCOLLECTION).doc(trackId);
  }
}
