const SPOTIFY_URL =
  /^(?:https?:\/\/open\.spotify\.com\/(?:intl-[a-z-]+\/)?(?:track|album|playlist)\/[A-Za-z0-9]+(?:[/?#].*)?|spotify:(?:track|album|playlist):[A-Za-z0-9]+)$/;

/** Mesmas regras do parser do backend (`functions/src/spotify/url.ts`). */
export function isSpotifyUrl(value: string): boolean {
  return SPOTIFY_URL.test(value.trim());
}
