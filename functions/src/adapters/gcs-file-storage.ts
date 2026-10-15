import type { FileStorage } from '../domain/ports.js';

interface UploadableBucket {
  upload(localPath: string, options: { destination: string; contentType: string; resumable: boolean }): Promise<unknown>;
}

export class GcsFileStorage implements FileStorage {
  constructor(private readonly bucket: UploadableBucket) {}

  async upload(localPath: string, destination: string): Promise<void> {
    await this.bucket.upload(localPath, { destination, contentType: 'audio/mpeg', resumable: false });
  }
}
