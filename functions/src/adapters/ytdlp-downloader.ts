import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { AudioDownloader } from "../domain/ports.js";

export type CommandRunner = (
  command: string,
  args: string[],
) => Promise<{ stdout: string }>;

export const execRunner: CommandRunner = async (command, args) => {
  const { stdout } = await promisify(execFile)(command, args, {
    maxBuffer: 10 * 1024 * 1024,
  });
  return { stdout };
};

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 2000;

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export function buildYtDlpArgs(
  videoId: string,
  outputDir: string,
  ffmpegPath: string,
): string[] {
  return [
    "--no-playlist",
    "--no-progress",
    "-f",
    "bestaudio/best",
    "-x",
    "--audio-format",
    "mp3",
    "--audio-quality",
    "0",
    "--ffmpeg-location",
    ffmpegPath,
    "-o",
    `${outputDir}/%(id)s.%(ext)s`,
    "--print",
    "after_move:filepath",
    `https://music.youtube.com/watch?v=${videoId}`,
  ];
}

export class YtDlpDownloader implements AudioDownloader {
  constructor(
    private readonly options: {
      ytDlpPath: string;
      ffmpegPath: string;
      run?: CommandRunner;
      sleep?: (ms: number) => Promise<void>;
    },
  ) {}

  async download(videoId: string, outputDir: string): Promise<string> {
    const { stdout } = await this.runWithRetry(
      buildYtDlpArgs(videoId, outputDir, this.options.ffmpegPath),
    );
    const filePath = stdout.trim().split("\n").filter(Boolean).at(-1);
    if (!filePath)
      throw new Error(`yt-dlp não retornou o arquivo para o vídeo ${videoId}`);
    return filePath;
  }

  /** O YouTube às vezes serve uma sessão só com SABR (sem formatos baixáveis); outra tentativa costuma funcionar. */
  private async runWithRetry(args: string[]): Promise<{ stdout: string }> {
    const run = this.options.run ?? execRunner;
    const sleep = this.options.sleep ?? defaultSleep;
    for (let attempt = 1; ; attempt++) {
      try {
        return await run(this.options.ytDlpPath, args);
      } catch (error) {
        if (attempt >= MAX_ATTEMPTS) throw error;
        await sleep(RETRY_DELAY_MS);
      }
    }
  }
}
