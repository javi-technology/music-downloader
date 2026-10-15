import { describe, expect, it } from "vitest";
import { InvalidSpotifyUrlError, parseSpotifyUrl } from "./url.js";

describe("parseSpotifyUrl", () => {
  it.each([
    [
      "https://open.spotify.com/track/6rqhFgbbKwnb9MLmUQDhG6",
      "track",
      "6rqhFgbbKwnb9MLmUQDhG6",
    ],
    [
      "https://open.spotify.com/album/4aawyAB9vmqN3uQ7FjRGTy?si=abc",
      "album",
      "4aawyAB9vmqN3uQ7FjRGTy",
    ],
    [
      "https://open.spotify.com/intl-pt/playlist/37i9dQZF1DXcBWIGoYBM5M",
      "playlist",
      "37i9dQZF1DXcBWIGoYBM5M",
    ],
    ["spotify:track:6rqhFgbbKwnb9MLmUQDhG6", "track", "6rqhFgbbKwnb9MLmUQDhG6"],
    [
      "  https://open.spotify.com/track/6rqhFgbbKwnb9MLmUQDhG6  ",
      "track",
      "6rqhFgbbKwnb9MLmUQDhG6",
    ],
  ])("interpreta %s", (url, type, id) => {
    expect(parseSpotifyUrl(url)).toEqual({ type, id });
  });

  it.each([
    "",
    "https://example.com/track/6rqhFgbbKwnb9MLmUQDhG6",
    "https://open.spotify.com/artist/0OdUWJ0sBjDrqHygGUXeCF",
    "https://open.spotify.com/track/",
    "spotify:episode:abc",
  ])("rejeita %s", (url) => {
    expect(() => parseSpotifyUrl(url)).toThrow(InvalidSpotifyUrlError);
  });
});
