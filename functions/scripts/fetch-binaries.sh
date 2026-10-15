#!/usr/bin/env bash
# Baixa yt-dlp e ffmpeg standalone (Linux x64) para functions/bin.
# Executado automaticamente pelo build do Cloud Functions (script `gcp-build`).
# Em desenvolvimento local, instale via `brew install yt-dlp ffmpeg` (são buscados no PATH).
set -euo pipefail

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "fetch-binaries: ignorado fora do Linux (use os binários do PATH)."
  exit 0
fi

BIN_DIR="$(cd "$(dirname "$0")/.." && pwd)/bin"
mkdir -p "$BIN_DIR"

curl -fsSL -o "$BIN_DIR/yt-dlp" https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux
chmod +x "$BIN_DIR/yt-dlp"

TMP="$(mktemp -d)"
curl -fsSL https://github.com/yt-dlp/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linux64-gpl.tar.xz | tar -xJ -C "$TMP"
cp "$TMP"/ffmpeg-*/bin/ffmpeg "$TMP"/ffmpeg-*/bin/ffprobe "$BIN_DIR/"
chmod +x "$BIN_DIR/ffmpeg" "$BIN_DIR/ffprobe"
rm -rf "$TMP"

echo "fetch-binaries: binários instalados em $BIN_DIR"
