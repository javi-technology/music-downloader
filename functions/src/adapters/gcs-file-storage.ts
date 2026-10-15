import { randomUUID } from "node:crypto";
import { basename } from "node:path";
import { attachmentDisposition } from "../http/content-disposition.js";
import type { FileStorage } from "../domain/ports.js";

interface UploadOptions {
  destination: string;
  contentType: string;
  resumable: boolean;
  metadata: {
    contentDisposition: string;
    metadata: { firebaseStorageDownloadTokens: string };
  };
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

  async upload(localPath: string, destination: string): Promise<string> {
    await this.bucket.upload(localPath, {
      destination,
      contentType: "audio/mpeg",
      resumable: false,
      // Sem este token, `getDownloadURL()` do SDK web não consegue gerar o link do arquivo.
      metadata: {
        // Sem isto, o navegador nomeia o arquivo com o caminho completo do Storage.
        contentDisposition: attachmentDisposition(basename(destination)),
        metadata: { firebaseStorageDownloadTokens: this.newToken() },
      },
    });
    return destination;
  }
}
