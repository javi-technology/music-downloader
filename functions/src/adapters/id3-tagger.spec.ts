import { describe, expect, it, vi } from 'vitest';
import type { Song } from '../domain/types.js';
import { Id3Tagger, buildId3Tags } from './id3-tagger.js';

const song: Song = {
  spotifyId: 'sp1',
  name: 'Blinding Lights',
  artists: ['The Weeknd', 'Daft Punk'],
  album: 'After Hours',
  durationSeconds: 200,
  trackNumber: 9,
  releaseYear: '2020',
  coverUrl: 'https://img/cover.jpg',
  isrc: 'USUG11904206',
};

describe('buildId3Tags', () => {
  it('mapeia os metadados do Spotify para ID3', () => {
    const cover = Buffer.from('img');
    expect(buildId3Tags(song, cover)).toEqual({
      title: 'Blinding Lights',
      artist: 'The Weeknd/Daft Punk',
      performerInfo: 'The Weeknd',
      album: 'After Hours',
      trackNumber: '9',
      year: '2020',
      ISRC: 'USUG11904206',
      image: { mime: 'image/jpeg', type: { id: 3, name: 'front cover' }, description: 'Cover', imageBuffer: cover },
    });
  });

  it('omite campos ausentes', () => {
    expect(buildId3Tags({ ...song, trackNumber: undefined, releaseYear: undefined, isrc: undefined }, undefined)).toEqual({
      title: 'Blinding Lights',
      artist: 'The Weeknd/Daft Punk',
      performerInfo: 'The Weeknd',
      album: 'After Hours',
    });
  });
});

describe('Id3Tagger', () => {
  it('baixa a capa e grava as tags no arquivo', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(Buffer.from('img')));
    const write = vi.fn().mockReturnValue(true);
    await new Id3Tagger({ fetch: fetchMock as typeof fetch, write }).tag('/tmp/a.mp3', song);

    expect(fetchMock).toHaveBeenCalledWith('https://img/cover.jpg');
    expect(write).toHaveBeenCalledWith(buildId3Tags(song, Buffer.from('img')), '/tmp/a.mp3');
  });

  it('grava as tags mesmo se a capa falhar', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('x', { status: 500 }));
    const write = vi.fn().mockReturnValue(true);
    await new Id3Tagger({ fetch: fetchMock as typeof fetch, write }).tag('/tmp/a.mp3', song);
    expect(write).toHaveBeenCalledWith(buildId3Tags(song, undefined), '/tmp/a.mp3');
  });

  it('propaga erro de escrita', async () => {
    const write = vi.fn().mockReturnValue(new Error('disco cheio'));
    await expect(new Id3Tagger({ fetch: vi.fn() as unknown as typeof fetch, write }).tag('/a', { ...song, coverUrl: undefined })).rejects.toThrow(
      'disco cheio',
    );
  });
});
