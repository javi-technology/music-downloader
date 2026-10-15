import { describe, expect, it, vi } from 'vitest';
import { GcsFileStorage } from './gcs-file-storage.js';

describe('GcsFileStorage', () => {
  it('envia o MP3 com token de download do Firebase (exigido pelo getDownloadURL do SDK web)', async () => {
    const bucket = { upload: vi.fn().mockResolvedValue(undefined) };
    await new GcsFileStorage(bucket, { newToken: () => 'token-fixo' }).upload('/tmp/a.mp3', 'music-downloader/users/u/j/000/a.mp3');

    expect(bucket.upload).toHaveBeenCalledWith('/tmp/a.mp3', {
      destination: 'music-downloader/users/u/j/000/a.mp3',
      contentType: 'audio/mpeg',
      resumable: false,
      metadata: { metadata: { firebaseStorageDownloadTokens: 'token-fixo' } },
    });
  });

  it('gera um token diferente por arquivo por padrão', async () => {
    const bucket = { upload: vi.fn().mockResolvedValue(undefined) };
    const storage = new GcsFileStorage(bucket);
    await storage.upload('/a', 'a');
    await storage.upload('/b', 'b');

    const tokens = bucket.upload.mock.calls.map(([, options]) => options.metadata.metadata.firebaseStorageDownloadTokens);
    expect(tokens[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(tokens[0]).not.toBe(tokens[1]);
  });
});
