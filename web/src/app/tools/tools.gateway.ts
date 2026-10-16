import { Observable } from 'rxjs';
import { ToolsStatus } from './tools.model';

export abstract class ToolsGateway {
  /** Estado das ferramentas de download (yt-dlp, ffmpeg, deno), com o progresso da instalação. */
  abstract watchStatus(): Observable<ToolsStatus>;
  /** Tenta instalar de novo as ferramentas que faltam. */
  abstract install(): Promise<void>;
}
