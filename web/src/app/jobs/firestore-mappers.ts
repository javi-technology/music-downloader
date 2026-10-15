import { DocumentData, Timestamp } from 'firebase/firestore';
import { DownloadJob, JobTrack } from './job.model';

export function toDownloadJob(id: string, data: DocumentData): DownloadJob {
  return {
    id,
    sourceUrl: data['sourceUrl'],
    source: data['source'],
    totalTracks: data['totalTracks'],
    completedTracks: data['completedTracks'],
    failedTracks: data['failedTracks'],
    createdAt: data['createdAt'] instanceof Timestamp ? data['createdAt'].toDate() : null,
  };
}

export function toJobTrack(id: string, data: DocumentData): JobTrack {
  const song = data['song'];
  return {
    id,
    position: data['position'],
    status: data['status'],
    song: { name: song.name, artists: song.artists, album: song.album },
    ...(data['storagePath'] ? { storagePath: data['storagePath'] } : {}),
    ...(data['error'] ? { error: data['error'] } : {}),
  };
}
