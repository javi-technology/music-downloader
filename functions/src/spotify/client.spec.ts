import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SpotifyClient } from './client.js';

const artist = (name: string) => ({ name });
const album = {
  name: 'After Hours',
  release_date: '2020-03-20',
  images: [{ url: 'https://img/large.jpg', width: 640 }, { url: 'https://img/small.jpg', width: 64 }],
};
const track = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  name: `Track ${id}`,
  artists: [artist('The Weeknd'), artist('Daft Punk')],
  album,
  duration_ms: 200_500,
  explicit: false,
  track_number: 3,
  external_ids: { isrc: `ISRC${id}` },
  type: 'track',
  ...extra,
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('SpotifyClient', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let client: SpotifyClient;

  beforeEach(() => {
    fetchMock = vi.fn();
    client = new SpotifyClient({ clientId: 'id', clientSecret: 'secret', fetch: fetchMock as typeof fetch });
  });

  function routes(map: Record<string, unknown>) {
    fetchMock.mockImplementation(async (input: string) => {
      if (input.startsWith('https://accounts.spotify.com/api/token')) {
        return jsonResponse({ access_token: 'tok', expires_in: 3600 });
      }
      const key = Object.keys(map).find((path) => input === `https://api.spotify.com/v1${path}`);
      if (!key) return jsonResponse({ error: 'not found' }, 404);
      return jsonResponse(map[key]);
    });
  }

  it('autentica com client credentials (Basic auth) e reutiliza o token', async () => {
    routes({ '/tracks/a': track('a'), '/tracks/b': track('b') });
    await client.getSongs({ type: 'track', id: 'a' });
    await client.getSongs({ type: 'track', id: 'b' });

    const tokenCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes('accounts.spotify.com'));
    expect(tokenCalls).toHaveLength(1);
    const init = tokenCalls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe(`Basic ${btoa('id:secret')}`);
    expect(String(init.body)).toBe('grant_type=client_credentials');

    const apiInit = fetchMock.mock.calls.find(([url]) => String(url).includes('/tracks/a'))![1] as RequestInit;
    expect((apiInit.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });

  it('mapeia uma faixa para Song', async () => {
    routes({ '/tracks/a': track('a') });
    expect(await client.getSongs({ type: 'track', id: 'a' })).toEqual([
      {
        spotifyId: 'a',
        name: 'Track a',
        artists: ['The Weeknd', 'Daft Punk'],
        album: 'After Hours',
        durationSeconds: 200.5,
        explicit: false,
        trackNumber: 3,
        releaseYear: '2020',
        coverUrl: 'https://img/large.jpg',
        isrc: 'ISRCa',
      },
    ]);
  });

  it('omite metadados ausentes em vez de usar undefined', async () => {
    const { external_ids: _e, explicit: _x, track_number: _n, ...bare } = track('a');
    routes({ '/tracks/a': { ...bare, album: { name: 'Single', images: [] } } });

    const [song] = await client.getSongs({ type: 'track', id: 'a' });

    expect(Object.values(song)).not.toContain(undefined);
    expect(song).not.toHaveProperty('isrc');
    expect(song).not.toHaveProperty('coverUrl');
    expect(song).not.toHaveProperty('releaseYear');
  });

  it('busca todas as faixas de um álbum (paginado) com os dados do álbum', async () => {
    const simplified = (id: string) => {
      const { album: _a, external_ids: _e, ...rest } = track(id);
      return rest;
    };
    routes({
      '/albums/x': { ...album, tracks: { items: [simplified('1')], next: 'https://api.spotify.com/v1/albums/x/tracks?offset=1&limit=50' } },
      '/albums/x/tracks?offset=1&limit=50': { items: [simplified('2')], next: null },
    });

    const songs = await client.getSongs({ type: 'album', id: 'x' });
    expect(songs.map((s) => s.spotifyId)).toEqual(['1', '2']);
    expect(songs[1].album).toBe('After Hours');
    expect(songs[1].coverUrl).toBe('https://img/large.jpg');
  });

  it('busca todas as faixas de uma playlist ignorando itens vazios, locais e episódios', async () => {
    routes({
      '/playlists/p/tracks?limit=100': {
        items: [{ track: track('1') }, { track: null }, { track: track('ep', { type: 'episode' }) }],
        next: 'https://api.spotify.com/v1/playlists/p/tracks?offset=100&limit=100',
      },
      '/playlists/p/tracks?offset=100&limit=100': {
        items: [{ track: track('local', { id: null, is_local: true }) }, { track: track('2') }],
        next: null,
      },
    });

    const songs = await client.getSongs({ type: 'playlist', id: 'p' });
    expect(songs.map((s) => s.spotifyId)).toEqual(['1', '2']);
  });

  it('lança erro descritivo quando a API falha', async () => {
    routes({});
    await expect(client.getSongs({ type: 'track', id: 'nope' })).rejects.toThrow(/Spotify API 404/);
  });
});
