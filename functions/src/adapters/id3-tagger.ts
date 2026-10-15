import NodeID3 from 'node-id3';
import type { AudioTagger } from '../domain/ports.js';
import type { Song } from '../domain/types.js';

type WriteTags = (tags: NodeID3.Tags, filePath: string) => true | Error;

export function buildId3Tags(song: Song, cover: Buffer | undefined): NodeID3.Tags {
  return {
    title: song.name,
    artist: song.artists.join('/'),
    performerInfo: song.artists[0],
    album: song.album,
    ...(song.trackNumber !== undefined ? { trackNumber: String(song.trackNumber) } : {}),
    ...(song.releaseYear ? { year: song.releaseYear } : {}),
    ...(song.isrc ? { ISRC: song.isrc } : {}),
    ...(cover ? { image: { mime: 'image/jpeg', type: { id: 3, name: 'front cover' }, description: 'Cover', imageBuffer: cover } } : {}),
  };
}

export class Id3Tagger implements AudioTagger {
  private readonly fetch: typeof fetch;
  private readonly write: WriteTags;

  constructor(options: { fetch?: typeof fetch; write?: WriteTags } = {}) {
    this.fetch = options.fetch ?? globalThis.fetch;
    this.write = options.write ?? ((tags, filePath) => NodeID3.write(tags, filePath));
  }

  async tag(filePath: string, song: Song): Promise<void> {
    const result = this.write(buildId3Tags(song, await this.downloadCover(song.coverUrl)), filePath);
    if (result instanceof Error) throw result;
  }

  private async downloadCover(url: string | undefined): Promise<Buffer | undefined> {
    if (!url) return undefined;
    try {
      const response = await this.fetch(url);
      return response.ok ? Buffer.from(await response.arrayBuffer()) : undefined;
    } catch {
      return undefined;
    }
  }
}
