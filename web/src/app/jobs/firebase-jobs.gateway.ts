import { Injectable, inject } from '@angular/core';
import { User, onAuthStateChanged } from 'firebase/auth';
import { Query, collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { getDownloadURL, ref } from 'firebase/storage';
import { Observable, of, switchMap } from 'rxjs';
import { FIREBASE_AUTH, FIRESTORE, FUNCTIONS, STORAGE } from '../core/firebase';
import { toDownloadJob, toJobTrack } from './firestore-mappers';
import { DownloadJob, JobTrack } from './job.model';
import { JobsGateway } from './jobs.gateway';

const JOBS = 'downloadJobs';
const TRACKS = 'tracks';

@Injectable()
export class FirebaseJobsGateway extends JobsGateway {
  private readonly auth = inject(FIREBASE_AUTH);
  private readonly firestore = inject(FIRESTORE);
  private readonly functions = inject(FUNCTIONS);
  private readonly storage = inject(STORAGE);

  async createJob(url: string): Promise<{ jobId: string; totalTracks: number }> {
    const call = httpsCallable<{ url: string }, { jobId: string; totalTracks: number }>(this.functions, 'mdCreateDownloadJob');
    return (await call({ url })).data;
  }

  watchJobs(): Observable<DownloadJob[]> {
    return this.authUser().pipe(
      switchMap((user) =>
        user
          ? this.snapshots(
              query(collection(this.firestore, JOBS), where('ownerUid', '==', user.uid), orderBy('createdAt', 'desc'), limit(50)),
              toDownloadJob,
            )
          : of([]),
      ),
    );
  }

  watchTracks(jobId: string): Observable<JobTrack[]> {
    return this.authUser().pipe(
      switchMap((user) =>
        user
          ? this.snapshots(
              query(collection(this.firestore, JOBS, jobId, TRACKS), where('ownerUid', '==', user.uid), orderBy('position')),
              toJobTrack,
            )
          : of([]),
      ),
    );
  }

  getDownloadUrl(storagePath: string): Promise<string> {
    return getDownloadURL(ref(this.storage, storagePath));
  }

  private authUser(): Observable<User | null> {
    return new Observable((subscriber) => onAuthStateChanged(this.auth, (user) => subscriber.next(user)));
  }

  private snapshots<T>(source: Query, map: (id: string, data: Record<string, unknown>) => T): Observable<T[]> {
    return new Observable((subscriber) =>
      onSnapshot(
        source,
        (snapshot) => subscriber.next(snapshot.docs.map((doc) => map(doc.id, doc.data()))),
        (error) => subscriber.error(error),
      ),
    );
  }
}
