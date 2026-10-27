import { readFileSync, statSync } from "node:fs";
import { extname, isAbsolute, relative, resolve } from "node:path";

/** Arquivos do build do Angular, pelo caminho relativo (`index.html`, `main-ABC.js`). */
export interface WebAssets {
  get(path: string): Buffer | undefined;
}

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

export function contentTypeFor(path: string): string {
  return (
    CONTENT_TYPES[extname(path).toLowerCase()] ?? "application/octet-stream"
  );
}

/** Build numa pasta do disco (desenvolvimento e `npm run local`). */
export function directoryAssets(root: string): WebAssets {
  const base = resolve(root);
  return {
    get(path) {
      const file = resolve(base, path);
      const inside = relative(base, file);
      // Outro drive no Windows dá um caminho absoluto; `..` sai da pasta.
      if (!inside || inside.startsWith("..") || isAbsolute(inside))
        return undefined;
      try {
        return statSync(file).isFile() ? readFileSync(file) : undefined;
      } catch {
        return undefined;
      }
    },
  };
}

/** Build embutido no executável (Node SEA), com as chaves `web/<caminho>`. */
export function seaAssets(getAsset: (key: string) => ArrayBuffer): WebAssets {
  return {
    get(path) {
      try {
        return Buffer.from(getAsset(`web/${path}`));
      } catch {
        return undefined;
      }
    },
  };
}
