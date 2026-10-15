import { describe, expect, it, vi } from 'vitest';
import { YTMusicSearcher } from './ytmusic-searcher.js';

const songItem = {
  type: 'SONG' as const,
  videoId: 's1',
  name: 'Blinding Lights',
  artist: { artistId: 'a', name: 'The Weeknd' },
  album: { albumId: 'al', name: 'After Hours' },
  duration: 200,
  thumbnails: [],
};
const videoItem = {
  type: 'VIDEO' as const,
  videoId: 'v1',
  name: 'The Weeknd - Blinding Lights (Official Video)',
  artist: { artistId: 'a', name: 'The Weeknd' },
  duration: 263,
  thumbnails: [],
};

function makeApi() {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    searchSongs: vi.fn().mockResolvedValue([songItem, { ...songItem, videoId: 's2', duration: null }]),
    searchVideos: vi.fn().mockResolvedValue([videoItem]),
  };
}

describe('YTMusicSearcher', () => {
  it('inicializa a API uma única vez', async () => {
    const api = makeApi();
    const searcher = new YTMusicSearcher(api);
    await searcher.search('a');
    await searcher.search('b');
    expect(api.initialize).toHaveBeenCalledTimes(1);
  });

  it('combina músicas (verificadas) e vídeos, ignorando itens sem duração', async () => {
    const searcher = new YTMusicSearcher(makeApi());
    expect(await searcher.search('The Weeknd - Blinding Lights')).toEqual([
      { videoId: 's1', name: 'Blinding Lights', artists: ['The Weeknd'], album: 'After Hours', durationSeconds: 200, verified: true },
      {
        videoId: 'v1',
        name: 'The Weeknd - Blinding Lights (Official Video)',
        artists: ['The Weeknd'],
        durationSeconds: 263,
        verified: false,
      },
    ]);
  });

  it('separa artistas concatenados ("A & B", "A, B")', async () => {
    const api = makeApi();
    api.searchSongs.mockResolvedValue([{ ...songItem, artist: { artistId: null, name: 'Daft Punk & The Weeknd, Kavinsky' } }]);
    api.searchVideos.mockResolvedValue([]);
    const [result] = await new YTMusicSearcher(api).search('q');
    expect(result.artists).toEqual(['Daft Punk', 'The Weeknd', 'Kavinsky']);
  });
});
