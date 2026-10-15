import { randomUUID } from 'node:crypto';
import type { FileStorage } from '../domain/ports.js';

interface UploadOptions {
  destination: string;
  contentType: string;
  resumable: boolean;
  metadata: { metadata: { firebaseStorageDownloadTokens: string } };
}

interface UploadableBucket {
  upload(localPath: string, options: UploadOptions): Promise<unknown>;
}

export class GcsFileStorage implements FileStorage {
  private readonly newToken: () => string;

  constructor(
    private readonly bucket: UploadableBucket,
    options: { newToken?: () => string } = {},
  ) {
    this.newToken = options.newToken ?? randomUUID;
  }

  async upload(localPath: string, destination: string): Promise<void> {
    await this.bucket.upload(localPath, {
      destination,
      contentType: 'audio/mpeg',
      resumable: false,
      // Sem este token, `getDownloadURL()` do SDK web não consegue gerar o link do arquivo.
      metadata: { metadata: { firebaseStorageDownloadTokens: this.newToken() } },
    });
  }
}
