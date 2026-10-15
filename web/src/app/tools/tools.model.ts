export type ToolName = 'yt-dlp' | 'ffmpeg' | 'deno';

/** Espelha `ToolsStatus` do servidor (`functions/src/local/tools/tool-manager.ts`). */
export interface ToolStatus {
  name: ToolName;
  state: 'missing' | 'downloading' | 'installed' | 'error';
  source?: 'app' | 'system';
  receivedBytes?: number;
  totalBytes?: number;
  error?: string;
}

export interface ToolsStatus {
  ready: boolean;
  installing: boolean;
  tools: ToolStatus[];
}
