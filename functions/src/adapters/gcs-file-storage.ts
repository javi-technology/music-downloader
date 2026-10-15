import { randomUUID } from "node:crypto";
import { basename } from "node:path";
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

  async upload(localPath: string, destination: string): Promise<void> {
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
  }
}

/** `filename` ASCII para navegadores antigos + `filename*` UTF-8 (RFC 5987) com o nome real. */
function attachmentDisposition(fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7e]|["\\]/g, "_");
  const utf8 = encodeURIComponent(fileName).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${ascii}"; filename*=UTF-8''${utf8}`;
}
