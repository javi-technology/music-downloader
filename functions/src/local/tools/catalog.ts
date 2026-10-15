export type ToolName = "yt-dlp" | "ffmpeg" | "deno";

export interface ArtifactFile {
  /** Nome do arquivo dentro do pacote (comparado pelo nome, ignorando pastas). */
  entry: string;
  /** Nome final na pasta de binários do app. */
  target: string;
}

export interface Artifact {
  url: string;
  format: "raw" | "zip" | "tar.xz";
  files: ArtifactFile[];
}

export interface ToolSpec {
  name: ToolName;
  artifacts: Artifact[];
}

export class UnsupportedPlatformError extends Error {
  constructor(platform: string, arch: string) {
    super(`Sistema não suportado: ${platform} ${arch}`);
    this.name = "UnsupportedPlatformError";
  }
}

const YT_DLP = "https://github.com/yt-dlp/yt-dlp/releases/latest/download";
const FFMPEG_BUILDS =
  "https://github.com/yt-dlp/FFmpeg-Builds/releases/download/latest";
const MARTIN_RIEDL = "https://ffmpeg.martin-riedl.de/redirect/latest/macos";
const DENO = "https://github.com/denoland/deno/releases/latest/download";

const raw = (url: string, entry: string, target: string): Artifact => ({
  url,
  format: "raw",
  files: [{ entry, target }],
});

const archive = (
  url: string,
  format: "zip" | "tar.xz",
  names: string[],
): Artifact => ({
  url,
  format,
  files: names.map((name) => ({ entry: name, target: name })),
});

/** De onde baixar cada ferramenta no sistema atual (binários standalone oficiais). */
export function toolCatalog(
  platform: NodeJS.Platform,
  arch: string,
): ToolSpec[] {
  if (platform === "darwin" && (arch === "arm64" || arch === "x64")) {
    const ffmpegArch = arch === "arm64" ? "arm64" : "amd64";
    const denoArch = arch === "arm64" ? "aarch64" : "x86_64";
    return [
      {
        name: "yt-dlp",
        artifacts: [raw(`${YT_DLP}/yt-dlp_macos`, "yt-dlp_macos", "yt-dlp")],
      },
      {
        name: "ffmpeg",
        artifacts: ["ffmpeg", "ffprobe"].map((name) =>
          archive(`${MARTIN_RIEDL}/${ffmpegArch}/release/${name}.zip`, "zip", [
            name,
          ]),
        ),
      },
      {
        name: "deno",
        artifacts: [
          archive(`${DENO}/deno-${denoArch}-apple-darwin.zip`, "zip", ["deno"]),
        ],
      },
    ];
  }

  // Windows on ARM roda os binários x64 por emulação.
  if (platform === "win32" && (arch === "x64" || arch === "arm64")) {
    return [
      {
        name: "yt-dlp",
        artifacts: [raw(`${YT_DLP}/yt-dlp.exe`, "yt-dlp.exe", "yt-dlp.exe")],
      },
      {
        name: "ffmpeg",
        artifacts: [
          archive(
            `${FFMPEG_BUILDS}/ffmpeg-master-latest-win64-gpl.zip`,
            "zip",
            ["ffmpeg.exe", "ffprobe.exe"],
          ),
        ],
      },
      {
        name: "deno",
        artifacts: [
          archive(`${DENO}/deno-x86_64-pc-windows-msvc.zip`, "zip", [
            "deno.exe",
          ]),
        ],
      },
    ];
  }

  if (platform === "linux" && (arch === "x64" || arch === "arm64")) {
    const arm = arch === "arm64";
    const ytDlp = arm ? "yt-dlp_linux_aarch64" : "yt-dlp_linux";
    return [
      {
        name: "yt-dlp",
        artifacts: [raw(`${YT_DLP}/${ytDlp}`, ytDlp, "yt-dlp")],
      },
      {
        name: "ffmpeg",
        artifacts: [
          archive(
            `${FFMPEG_BUILDS}/ffmpeg-master-latest-${arm ? "linuxarm64" : "linux64"}-gpl.tar.xz`,
            "tar.xz",
            ["ffmpeg", "ffprobe"],
          ),
        ],
      },
      {
        name: "deno",
        artifacts: [
          archive(
            `${DENO}/deno-${arm ? "aarch64" : "x86_64"}-unknown-linux-gnu.zip`,
            "zip",
            ["deno"],
          ),
        ],
      },
    ];
  }

  throw new UnsupportedPlatformError(platform, arch);
}
