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

  async markTrackProcessing(jobId: string, trackId: string): Promise<void> {
    await this.track(jobId, trackId).update({ status: 'processing', updatedAt: FieldValue.serverTimestamp() });
  }

  async markTrackDone(jobId: string, trackId: string, result: { storagePath: string; videoId: string; score: number }): Promise<void> {
    await this.track(jobId, trackId).update({ status: 'done', ...result, updatedAt: FieldValue.serverTimestamp() });
    await this.job(jobId).update({ completedTracks: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() });
  }

  async markTrackFailed(jobId: string, trackId: string, error: string): Promise<void> {
    await this.track(jobId, trackId).update({ status: 'failed', error, updatedAt: FieldValue.serverTimestamp() });
    await this.job(jobId).update({ failedTracks: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() });
  }

  private job(jobId: string) {
    return this.db.collection(COLLECTIONS.jobs).doc(jobId);
  }

  private track(jobId: string, trackId: string) {
    return this.job(jobId).collection(TRACKS_SUBCOLLECTION).doc(trackId);
  }
}
