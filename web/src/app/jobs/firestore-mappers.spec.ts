import { Timestamp } from 'firebase/firestore';
import { toDownloadJob, toJobTrack } from './firestore-mappers';

describe('firestore-mappers', () => {
  it('converte documento de job, incluindo o Timestamp', () => {
    const createdAt = new Date('2026-10-15T12:00:00Z');
    expect(
      toDownloadJob('j1', {
        ownerUid: 'u1',
        sourceUrl: 'spotify:album:x',
        source: { type: 'album', id: 'x' },
        totalTracks: 3,
        completedTracks: 1,
        failedTracks: 0,
        createdAt: Timestamp.fromDate(createdAt),
      }),
    ).toEqual({
      id: 'j1',
      sourceUrl: 'spotify:album:x',
      source: { type: 'album', id: 'x' },
      totalTracks: 3,
      completedTracks: 1,
      failedTracks: 0,
      createdAt,
    });
  });

  it('aceita createdAt ainda pendente (escrita local) como null', () => {
    expect(
      toDownloadJob('j1', { source: { type: 'track', id: 't' }, createdAt: null }).createdAt,
    ).toBeNull();
  });

  it('converte documento de faixa', () => {
    expect(
      toJobTrack('001', {
        ownerUid: 'u1',
        position: 1,
        status: 'failed',
        error: 'erro',
        song: { spotifyId: 's', name: 'N', artists: ['A'], album: 'B', durationSeconds: 1 },
      }),
    ).toEqual({
      id: '001',
      position: 1,
      status: 'failed',
      error: 'erro',
      song: { name: 'N', artists: ['A'], album: 'B' },
    });
  });
});
