import type { Song } from "../domain/types.js";
import type { SongCollection } from "../jobs/types.js";
import type { SpotifyResource } from "./url.js";

const API = "https://api.spotify.com/v1";
const TOKEN_URL = "https://accounts.spotify.com/api/token";

export interface SpotifyClientOptions {
  clientId: string;
  clientSecret: string;
  fetch?: typeof fetch;
}

interface SpotifyAlbum {
  name: string;
  release_date?: string;
  images?: { url: string; width?: number }[];
}

interface SpotifyTrack {
  id: string | null;
  name: string;
  type?: string;
  is_local?: boolean;
  artists: { name: string }[];
  album?: SpotifyAlbum;
  duration_ms: number;
  explicit?: boolean;
  track_number?: number;
  external_ids?: { isrc?: string };
}

interface Page<T> {
  items: T[];
  next: string | null;
}

export class SpotifyClient {
  private readonly fetch: typeof fetch;
  private token?: { value: string; expiresAt: number };

  constructor(private readonly options: SpotifyClientOptions) {
    this.fetch = options.fetch ?? globalThis.fetch;
  }

  /** Faixas da fonte e, para álbum/playlist, o nome usado como pasta de destino. */
  async getCollection(resource: SpotifyResource): Promise<SongCollection> {
    switch (resource.type) {
      case "track":
        return {
          songs: [
            toSong(
              await this.get<SpotifyTrack>(`${API}/tracks/${resource.id}`),
            ),
          ],
        };
      case "album":
        return this.getAlbum(resource.id);
      case "playlist": {
        const [playlist, songs] = await Promise.all([
          this.get<{ name: string }>(
            `${API}/playlists/${resource.id}?fields=name`,
          ),
          this.getPlaylistSongs(resource.id),
        ]);
        return { title: playlist.name, songs };
      }
    }
  }

  private async getAlbum(id: string): Promise<SongCollection> {
    const album = await this.get<SpotifyAlbum & { tracks: Page<SpotifyTrack> }>(
      `${API}/albums/${id}`,
    );
    const tracks = await this.collect(album.tracks);
    return {
      title: album.name,
      songs: tracks.map((track) => toSong({ ...track, album })),
    };
  }

  private async getPlaylistSongs(id: string): Promise<Song[]> {
    const first = await this.get<Page<{ track: SpotifyTrack | null }>>(
      `${API}/playlists/${id}/tracks?limit=100`,
    );
    const items = await this.collect(first);
    return items
      .map((item) => item.track)
      .filter(
        (track): track is SpotifyTrack =>
          !!track &&
          !!track.id &&
          !track.is_local &&
          (track.type ?? "track") === "track",
      )
      .map(toSong);
  }

  private async collect<T>(page: Page<T>): Promise<T[]> {
    const items = [...page.items];
    let next = page.next;
    while (next) {
      const current: Page<T> = await this.get<Page<T>>(next);
      items.push(...current.items);
      next = current.next;
    }
    return items;
  }

  private async get<T>(url: string): Promise<T> {
    const response = await this.fetch(url, {
      headers: { Authorization: `Bearer ${await this.accessToken()}` },
    });
    if (!response.ok)
      throw new Error(`Spotify API ${response.status} em ${url}`);
    return (await response.json()) as T;
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now())
      return this.token.value;

    const response = await this.fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${this.options.clientId}:${this.options.clientSecret}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });
    if (!response.ok) throw new Error(`Spotify auth ${response.status}`);

    const body = (await response.json()) as {
      access_token: string;
      expires_in: number;
    };
    this.token = {
      value: body.access_token,
      expiresAt: Date.now() + (body.expires_in - 60) * 1000,
    };
    return this.token.value;
  }
}

function toSong(track: SpotifyTrack): Song {
  const album = track.album;
  const cover = [...(album?.images ?? [])].sort(
    (a, b) => (b.width ?? 0) - (a.width ?? 0),
  )[0];
  return {
    spotifyId: track.id!,
    name: track.name,
    artists: track.artists.map((artist) => artist.name),
    album: album?.name ?? "",
    durationSeconds: track.duration_ms / 1000,
    // Firestore rejeita `undefined`: campos opcionais só entram quando existem.
    ...(track.explicit !== undefined ? { explicit: track.explicit } : {}),
    ...(track.track_number !== undefined
      ? { trackNumber: track.track_number }
      : {}),
    ...(album?.release_date
      ? { releaseYear: album.release_date.slice(0, 4) }
      : {}),
    ...(cover?.url ? { coverUrl: cover.url } : {}),
    ...(track.external_ids?.isrc ? { isrc: track.external_ids.isrc } : {}),
  };
}
