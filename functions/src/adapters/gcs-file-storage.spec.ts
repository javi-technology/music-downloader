import { describe, expect, it, vi } from 'vitest';
import { GcsFileStorage } from './gcs-file-storage.js';

describe('GcsFileStorage', () => {
  it('envia o arquivo como audio/mpeg para o destino informado', async () => {
    const bucket = { upload: vi.fn().mockResolvedValue(undefined) };
    await new GcsFileStorage(bucket).upload('/tmp/a.mp3', 'music-downloader/users/u/j/a.mp3');
    expect(bucket.upload).toHaveBeenCalledWith('/tmp/a.mp3', {
      destination: 'music-downloader/users/u/j/a.mp3',
      contentType: 'audio/mpeg',
      resumable: false,
    });
  });
});
