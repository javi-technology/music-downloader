import { describe, expect, it, vi } from "vitest";
import { YTMusicSearcher } from "./ytmusic-searcher.js";

const SONGS = "Eg-KAQwIARAAGAAgACgAMABqChAEEAMQCRAFEAo%3D";
const VIDEOS = "Eg-KAQwIABABGAAgACgAMABqChAEEAMQCRAFEAo%3D";

type Run = string | [text: string, pageType: string];

const ARTIST = "MUSIC_PAGE_TYPE_ARTIST";
const ALBUM = "MUSIC_PAGE_TYPE_ALBUM";
const CHANNEL = "MUSIC_PAGE_TYPE_USER_CHANNEL";

function run(value: Run) {
  if (typeof value === "string") return { text: value };
  const [text, pageType] = value;
  return {
    text,
    navigationEndpoint: {
      browseEndpoint: {
        browseId: `id-${text}`,
        browseEndpointContextSupportedConfigs: {
          browseEndpointContextMusicConfig: { pageType },
        },
      },
    },
  };
}

/** Item no formato da resposta bruta do YouTube Music (`musicResponsiveListItemRenderer`). */
function item(videoId: string, name: string, subtitle: Run[]) {
  return {
    musicResponsiveListItemRenderer: {
      flexColumns: [[name], subtitle, ["1M plays"]].map((runs) => ({
        musicResponsiveListItemFlexColumnRenderer: {
          text: { runs: runs.map(run) },
        },
      })),
      playlistItemData: { videoId },
    },
  };
}

function response(...items: unknown[]) {
  return {
    contents: {
      tabbedSearchResultsRenderer: {
        tabs: [
          {
            tabRenderer: {
              content: {
                sectionListRenderer: {
                  contents: [{ musicShelfRenderer: { contents: items } }],
                },
              },
            },
          },
        ],
      },
    },
  };
}

const songItem = item("s1", "Blinding Lights", [
  ["The Weeknd", ARTIST],
  " • ",
  ["After Hours", ALBUM],
  " • ",
  "3:20",
]);
const videoItem = item("v1", "The Weeknd - Blinding Lights (Official Video)", [
  ["The Weeknd", ARTIST],
  " • ",
  "1B views",
  " • ",
  "4:23",
]);

function makeApi(songs: unknown[] = [songItem], videos: unknown[] = [videoItem]) {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    constructRequest: vi.fn(
      async (_endpoint: string, body: Record<string, unknown>) =>
        body.params === SONGS ? response(...songs) : response(...videos),
    ),
  };
}

describe("YTMusicSearcher", () => {
  it("inicializa a API uma única vez", async () => {
    const api = makeApi();
    const searcher = new YTMusicSearcher(api);
    await searcher.search("a");
    await searcher.search("b");
    expect(api.initialize).toHaveBeenCalledTimes(1);
  });

  it("busca com os filtros de músicas e de vídeos", async () => {
    const api = makeApi();
    await new YTMusicSearcher(api).search("The Weeknd - Blinding Lights");
    expect(api.constructRequest).toHaveBeenCalledWith("search", {
      query: "The Weeknd - Blinding Lights",
      params: SONGS,
    });
    expect(api.constructRequest).toHaveBeenCalledWith("search", {
      query: "The Weeknd - Blinding Lights",
      params: VIDEOS,
    });
  });

  it("combina músicas (verificadas) e vídeos", async () => {
    const searcher = new YTMusicSearcher(makeApi());
    expect(await searcher.search("The Weeknd - Blinding Lights")).toEqual([
      {
        videoId: "s1",
        name: "Blinding Lights",
        artists: ["The Weeknd"],
        album: "After Hours",
        durationSeconds: 200,
        verified: true,
      },
      {
        videoId: "v1",
        name: "The Weeknd - Blinding Lights (Official Video)",
        artists: ["The Weeknd"],
        durationSeconds: 263,
        verified: false,
      },
    ]);
  });

  it("ignora itens sem duração", async () => {
    const api = makeApi(
      [item("s2", "Blinding Lights", [["The Weeknd", ARTIST]])],
      [],
    );
    expect(await new YTMusicSearcher(api).search("q")).toEqual([]);
  });

  it("lê o artista sem página de artista (sem confundi-lo com o álbum)", async () => {
    const api = makeApi(
      [
        item("_udBTipMd5k", "The Night We Met", [
          "Joni Fuller",
          " • ",
          ["Bridgerton Season Four (Covers from the Netflix Series)", ALBUM],
          " • ",
          "3:29",
        ]),
      ],
      [],
    );
    const [result] = await new YTMusicSearcher(api).search("q");
    expect(result).toMatchObject({
      artists: ["Joni Fuller"],
      album: "Bridgerton Season Four (Covers from the Netflix Series)",
      durationSeconds: 209,
    });
  });

  it("traz todos os artistas da faixa, mantendo nomes com & inteiros", async () => {
    const api = makeApi(
      [
        item("s3", "Get Lucky", [
          ["Daft Punk", ARTIST],
          ", ",
          ["Pharrell Williams", ARTIST],
          " & ",
          ["Simon & Garfunkel", ARTIST],
          " • ",
          ["Random Access Memories", ALBUM],
          " • ",
          "6:10",
        ]),
      ],
      [],
    );
    const [result] = await new YTMusicSearcher(api).search("q");
    expect(result.artists).toEqual([
      "Daft Punk",
      "Pharrell Williams",
      "Simon & Garfunkel",
    ]);
  });

  it("usa o canal como artista dos vídeos", async () => {
    const api = makeApi(
      [],
      [
        item("TPjGEoO_6YI", "The Night We Met - Joni Fuller", [
          ["Capitol Records", CHANNEL],
          " • ",
          "1M views",
          " • ",
          "1:02:03",
        ]),
      ],
    );
    const [result] = await new YTMusicSearcher(api).search("q");
    expect(result).toMatchObject({
      videoId: "TPjGEoO_6YI",
      artists: ["Capitol Records"],
      durationSeconds: 3723,
      verified: false,
    });
  });
});
