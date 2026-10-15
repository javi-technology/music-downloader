import { isSpotifyUrl } from './spotify-url';

describe('isSpotifyUrl', () => {
  it.each([
    'https://open.spotify.com/track/6rqhFgbbKwnb9MLmUQDhG6',
    'https://open.spotify.com/album/4aawyAB9vmqN3uQ7FjRGTy?si=abc',
    'https://open.spotify.com/intl-pt/playlist/37i9dQZF1DXcBWIGoYBM5M',
    'spotify:track:6rqhFgbbKwnb9MLmUQDhG6',
    '  https://open.spotify.com/track/6rqhFgbbKwnb9MLmUQDhG6 ',
  ])('aceita %s', (url) => {
    expect(isSpotifyUrl(url)).toBe(true);
  });

  it.each(['', 'https://example.com/track/abc', 'https://open.spotify.com/artist/abc', 'spotify:episode:abc'])('rejeita "%s"', (url) => {
    expect(isSpotifyUrl(url)).toBe(false);
  });
});
