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

export function buildYtDlpArgs(
  videoId: string,
  outputDir: string,
  ffmpegPath: string,
): string[] {
  return [
    "--no-playlist",
    "--no-progress",
    "-f",
    "bestaudio",
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
    },
  ) {}

  async download(videoId: string, outputDir: string): Promise<string> {
    const run = this.options.run ?? execRunner;
    const { stdout } = await run(
      this.options.ytDlpPath,
      buildYtDlpArgs(videoId, outputDir, this.options.ffmpegPath),
    );
    const filePath = stdout.trim().split("\n").filter(Boolean).at(-1);
    if (!filePath)
      throw new Error(`yt-dlp não retornou o arquivo para o vídeo ${videoId}`);
    return filePath;
  }
}
