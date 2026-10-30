import YTMusic from "ytmusic-api";
import type { MusicSearcher } from "../domain/ports.js";
import type { SearchResult } from "../domain/types.js";

/** Filtros da busca do YouTube Music (os mesmos do `ytmusicapi`, usado pelo spotDL). */
const SONGS_FILTER = "Eg-KAQwIARAAGAAgACgAMABqChAEEAMQCRAFEAo%3D";
const VIDEOS_FILTER = "Eg-KAQwIABABGAAgACgAMABqChAEEAMQCRAFEAo%3D";

const SEPARATOR = /^\s*[,&•]\s*$/;
const DURATION = /^(\d+:)?\d{1,2}:\d{2}$/;

/**
 * Subconjunto do pacote `ytmusic-api` usado aqui: só a requisição bruta. Os parsers da biblioteca
 * tomam o álbum pelo artista quando este não tem página no YouTube Music e trazem um único artista.
 */
export interface YTMusicApi {
  initialize(): Promise<unknown>;
  constructRequest(
    endpoint: string,
    body: Record<string, unknown>,
  ): Promise<unknown>;
}

/** Cliente real: `constructRequest` é privado na tipagem do `ytmusic-api`, mas existe em execução. */
export function createYTMusicApi(): YTMusicApi {
  return new YTMusic() as unknown as YTMusicApi;
}

interface Run {
  text: string;
  navigationEndpoint?: {
    browseEndpoint?: {
      browseEndpointContextSupportedConfigs?: {
        browseEndpointContextMusicConfig?: { pageType?: string };
      };
    };
  };
}

interface ListItem {
  flexColumns?: {
    musicResponsiveListItemFlexColumnRenderer?: { text?: { runs?: Run[] } };
  }[];
  playlistItemData?: { videoId?: string };
}

/** Busca no YouTube Music músicas (resultados "verificados") e vídeos, como o spotDL. */
export class YTMusicSearcher implements MusicSearcher {
  private ready?: Promise<unknown>;

  constructor(private readonly api: YTMusicApi) {}

  async search(query: string): Promise<SearchResult[]> {
    this.ready ??= this.api.initialize();
    await this.ready;

    const [songs, videos] = await Promise.all(
      [SONGS_FILTER, VIDEOS_FILTER].map((params) =>
        this.api.constructRequest("search", { query, params }),
      ),
    );
    return [
      ...listItems(songs).map((item) => toResult(item, true)),
      ...listItems(videos).map((item) => toResult(item, false)),
    ].filter((result): result is SearchResult => result !== null);
  }
}

function listItems(data: unknown): ListItem[] {
  if (Array.isArray(data)) return data.flatMap(listItems);
  if (!data || typeof data !== "object") return [];
  const record = data as Record<string, unknown>;
  if (record.musicResponsiveListItemRenderer)
    return [record.musicResponsiveListItemRenderer as ListItem];
  return Object.values(record).flatMap(listItems);
}

/**
 * A 1ª coluna traz o título; a 2ª, "artistas • álbum (ou visualizações) • duração". Os artistas
 * são os textos antes do primeiro "•", com ou sem link para a página de artista.
 */
function toResult(item: ListItem, verified: boolean): SearchResult | null {
  const [title = [], subtitle = []] = (item.flexColumns ?? []).map(
    (column) =>
      column.musicResponsiveListItemFlexColumnRenderer?.text?.runs ?? [],
  );
  const videoId = item.playlistItemData?.videoId;
  const duration = subtitle.findLast((run) => DURATION.test(run.text.trim()));
  if (!videoId || !title[0] || !duration) return null;

  const firstDot = subtitle.findIndex((run) => run.text.trim() === "•");
  const artists = subtitle
    .slice(0, firstDot === -1 ? subtitle.length : firstDot)
    .filter((run) => run !== duration && !SEPARATOR.test(run.text))
    .map((run) => run.text.trim());
  const album = subtitle.find(
    (run) => pageType(run) === "MUSIC_PAGE_TYPE_ALBUM",
  );

  return {
    videoId,
    name: title[0].text,
    artists,
    ...(album ? { album: album.text } : {}),
    durationSeconds: toSeconds(duration.text),
    verified,
  };
}

function pageType(run: Run): string | undefined {
  return run.navigationEndpoint?.browseEndpoint
    ?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig
    ?.pageType;
}

function toSeconds(duration: string): number {
  return duration
    .trim()
    .split(":")
    .reduce((total, part) => total * 60 + Number(part), 0);
}
