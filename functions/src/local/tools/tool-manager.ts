import { existsSync, statSync } from "node:fs";
import {
  chmod,
  mkdir,
  mkdtemp,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { basename, isAbsolute, join } from "node:path";
import { executableName, resolveBinary } from "../../adapters/binaries.js";
import type { Artifact, ToolName, ToolSpec } from "./catalog.js";
import { extractZipEntries } from "./zip.js";

export const TOOL_NAMES: readonly ToolName[] = ["yt-dlp", "ffmpeg", "deno"];

export interface ToolStatus {
  name: ToolName;
  state: "missing" | "downloading" | "installed" | "error";
  /** `app`: baixada pelo app; `system`: encontrada no PATH ou em variável de ambiente. */
  source?: "app" | "system";
  receivedBytes?: number;
  totalBytes?: number;
  error?: string;
}

export interface ToolsStatus {
  ready: boolean;
  installing: boolean;
  tools: ToolStatus[];
}

export interface ToolPaths {
  ytDlp: string;
  ffmpeg: string;
  deno: string;
}

interface ToolManagerDeps {
  binDir: string;
  catalog: ToolSpec[];
  platform?: NodeJS.Platform;
  env?: Record<string, string | undefined>;
  fetch?: typeof fetch;
  /** Extrai um `.tar.xz` (usado só para o ffmpeg no Linux). */
  extractTarXz: (archive: string, destination: string) => Promise<void>;
  onChange?: (status: ToolsStatus) => void;
  now?: () => number;
}

type Transient = Pick<
  ToolStatus,
  "state" | "receivedBytes" | "totalBytes" | "error"
>;

const PROGRESS_INTERVAL_MS = 250;

/** Baixa e localiza o yt-dlp, o ffmpeg/ffprobe e o deno usados pelo app. */
export class ToolManager {
  private readonly platform: NodeJS.Platform;
  private readonly env: Record<string, string | undefined>;
  private readonly fetch: typeof fetch;
  private readonly now: () => number;
  private readonly transient = new Map<ToolName, Transient>();
  private running?: Promise<void>;
  private lastProgressAt = 0;

  constructor(private readonly deps: ToolManagerDeps) {
    this.platform = deps.platform ?? process.platform;
    this.env = deps.env ?? process.env;
    this.fetch = deps.fetch ?? globalThis.fetch;
    this.now = deps.now ?? Date.now;
  }

  status(): ToolsStatus {
    const tools = TOOL_NAMES.map((name): ToolStatus => {
      if (this.isInstalledByApp(name))
        return { name, state: "installed", source: "app" };
      if (this.systemPath(name))
        return { name, state: "installed", source: "system" };
      return { name, ...(this.transient.get(name) ?? { state: "missing" }) };
    });
    return {
      ready: tools.every((tool) => tool.state === "installed"),
      installing: this.running !== undefined,
      tools,
    };
  }

  paths(): ToolPaths {
    const resolve = (name: ToolName) =>
      resolveBinary(name, {
        binDir: this.deps.binDir,
        env: this.env,
        platform: this.platform,
      });
    return {
      ytDlp: resolve("yt-dlp"),
      ffmpeg: resolve("ffmpeg"),
      deno: resolve("deno"),
    };
  }

  /** Instala as ferramentas ausentes. Erros ficam no `status()`; chamar de novo tenta outra vez. */
  install(): Promise<void> {
    return this.exclusive(async () => {
      for (const name of TOOL_NAMES) {
        if (this.isInstalledByApp(name) || this.systemPath(name)) continue;
        await this.installTool(name);
      }
    });
  }

  /** O YouTube muda com frequência: mantém atualizado o yt-dlp baixado pelo app. */
  updateYtDlpIfStale(maxAgeMs: number): Promise<void> {
    return this.exclusive(async () => {
      if (!this.isInstalledByApp("yt-dlp")) return;
      const [target] = this.targets("yt-dlp");
      const age = this.now() - statSync(join(this.deps.binDir, target)).mtimeMs;
      if (age > maxAgeMs) await this.installTool("yt-dlp");
    });
  }

  private exclusive(work: () => Promise<void>): Promise<void> {
    const previous = this.running ?? Promise.resolve();
    const current = previous.then(work).finally(() => {
      if (this.running === current) {
        this.running = undefined;
        this.emit();
      }
    });
    this.running = current;
    this.emit();
    return current;
  }

  private async installTool(name: ToolName): Promise<void> {
    const spec = this.deps.catalog.find((tool) => tool.name === name);
    if (!spec) {
      this.setTransient(name, {
        state: "error",
        error: "Download não disponível para este sistema",
      });
      return;
    }

    await mkdir(this.deps.binDir, { recursive: true });
    const workDir = await mkdtemp(join(this.deps.binDir, ".download-"));
    const progress = { receivedBytes: 0, totalBytes: 0 };
    this.setTransient(name, { state: "downloading", ...progress });
    try {
      const files: { target: string; path: string }[] = [];
      for (const [index, artifact] of spec.artifacts.entries()) {
        const data = await this.download(name, artifact.url, progress);
        const dir = join(workDir, String(index));
        await mkdir(dir);
        files.push(...(await this.unpack(artifact, data, dir)));
      }
      // Só substitui os binários depois que todos os pacotes foram baixados e conferidos.
      for (const file of files) {
        await chmod(file.path, 0o755);
        await rename(file.path, join(this.deps.binDir, file.target));
      }
      this.transient.delete(name);
      this.emit();
    } catch (error) {
      this.setTransient(name, {
        state: "error",
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  }

  private async download(
    name: ToolName,
    url: string,
    progress: { receivedBytes: number; totalBytes: number },
  ): Promise<Buffer> {
    const response = await this.fetch(url, { redirect: "follow" });
    if (!response.ok || !response.body)
      throw new Error(`Falha ao baixar ${url}: HTTP ${response.status}`);

    progress.totalBytes += Number(response.headers.get("content-length")) || 0;
    this.setTransient(name, { state: "downloading", ...progress });

    const chunks: Uint8Array[] = [];
    for await (const chunk of response.body) {
      chunks.push(chunk);
      progress.receivedBytes += chunk.length;
      if (this.now() - this.lastProgressAt >= PROGRESS_INTERVAL_MS)
        this.setTransient(name, { state: "downloading", ...progress });
    }
    return Buffer.concat(chunks);
  }

  private async unpack(
    artifact: Artifact,
    data: Buffer,
    dir: string,
  ): Promise<{ target: string; path: string }[]> {
    if (artifact.format === "raw") {
      const [file] = artifact.files;
      const path = join(dir, file.target);
      await writeFile(path, data);
      return [{ target: file.target, path }];
    }

    if (artifact.format === "zip") {
      const entries = extractZipEntries(
        data,
        artifact.files.map((file) => file.entry),
      );
      return Promise.all(
        artifact.files.map(async (file) => {
          const path = join(dir, file.target);
          await writeFile(path, entries.get(file.entry)!);
          return { target: file.target, path };
        }),
      );
    }

    const archive = join(dir, "package.tar.xz");
    const extracted = join(dir, "extracted");
    await writeFile(archive, data);
    await mkdir(extracted);
    await this.deps.extractTarXz(archive, extracted);
    const found = (await readdir(extracted, { recursive: true })).map((path) =>
      join(extracted, path),
    );
    return artifact.files.map((file) => {
      const path = found.find(
        (candidate) => basename(candidate) === file.entry,
      );
      if (!path) throw new Error(`Arquivo ausente no pacote: ${file.entry}`);
      return { target: file.target, path };
    });
  }

  private targets(name: ToolName): string[] {
    const spec = this.deps.catalog.find((tool) => tool.name === name);
    return (
      spec?.artifacts.flatMap((artifact) =>
        artifact.files.map((file) => file.target),
      ) ?? [executableName(name, this.platform)]
    );
  }

  private isInstalledByApp(name: ToolName): boolean {
    return this.targets(name).every((target) =>
      existsSync(join(this.deps.binDir, target)),
    );
  }

  private systemPath(name: ToolName): string | undefined {
    const path = resolveBinary(name, {
      binDir: "",
      env: this.env,
      platform: this.platform,
    });
    return isAbsolute(path) && existsSync(path) ? path : undefined;
  }

  private setTransient(name: ToolName, value: Transient): void {
    this.transient.set(name, value);
    this.emit();
  }

  private emit(): void {
    this.lastProgressAt = this.now();
    this.deps.onChange?.(this.status());
  }
}
