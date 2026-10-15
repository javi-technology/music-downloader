export type SpotifyResourceType = 'track' | 'album' | 'playlist';

export interface SpotifyResource {
  type: SpotifyResourceType;
  id: string;
}

export class InvalidSpotifyUrlError extends Error {
  constructor(url: string) {
    super(`URL do Spotify inválida ou não suportada: "${url}"`);
    this.name = 'InvalidSpotifyUrlError';
  }
}

const WEB_URL = /^https?:\/\/open\.spotify\.com\/(?:intl-[a-z-]+\/)?(track|album|playlist)\/([A-Za-z0-9]+)(?:[/?#].*)?$/;
const URI = /^spotify:(track|album|playlist):([A-Za-z0-9]+)$/;

export function parseSpotifyUrl(input: string): SpotifyResource {
  const value = input.trim();
  const match = WEB_URL.exec(value) ?? URI.exec(value);
  if (!match) throw new InvalidSpotifyUrlError(input);
  return { type: match[1] as SpotifyResourceType, id: match[2] };
}
