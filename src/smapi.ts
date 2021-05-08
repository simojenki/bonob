import crypto from "crypto";
import { Express } from "express";
import { listen } from "soap";
import { readFileSync } from "fs";
import path from "path";
import logger from "./logger";

import { LinkCodes } from "./link_codes";
import {
  Album,
  AlbumQuery,
  AlbumSummary,
  ArtistSummary,
  Genre,
  MusicService,
  PlaylistSummary,
  slice2,
  Track,
} from "./music_service";
import { AccessTokens } from "./access_tokens";
import { BONOB_ACCESS_TOKEN_HEADER } from "./server";
import { Clock } from "./clock";

export const LOGIN_ROUTE = "/login";
export const SOAP_PATH = "/ws/sonos";
export const STRINGS_ROUTE = "/sonos/strings.xml";
export const PRESENTATION_MAP_ROUTE = "/sonos/presentationMap.xml";
export const SONOS_RECOMMENDED_IMAGE_SIZES = [
  "60",
  "80",
  "120",
  "180",
  "192",
  "200",
  "230",
  "300",
  "600",
  "640",
  "750",
  "1242",
  "1500",
];

const WSDL_FILE = path.resolve(
  __dirname,
  "Sonoswsdl-1.19.4-20190411.142401-3.wsdl"
);

export type Credentials = {
  loginToken: {
    token: string;
    householdId: string;
  };
  deviceId: string;
  deviceProvider: string;
};

export type GetAppLinkResult = {
  getAppLinkResult: {
    authorizeAccount: {
      appUrlStringId: string;
      deviceLink: { regUrl: string; linkCode: string; showLinkCode: boolean };
    };
  };
};

export type GetDeviceAuthTokenResult = {
  getDeviceAuthTokenResult: {
    authToken: string;
    privateKey: string;
    userInfo: {
      nickname: string;
      userIdHashCode: string;
    };
  };
};

export type MediaCollection = {
  id: string;
  itemType: "collection";
  title: string;
};

export type getMetadataResult = {
  count: number;
  index: number;
  total: number;
  mediaCollection?: any[];
  mediaMetadata?: any[];
};

export type GetMetadataResponse = {
  getMetadataResult: getMetadataResult;
};

export function getMetadataResult(
  result: Partial<getMetadataResult>
): GetMetadataResponse {
  const count =
    (result?.mediaCollection?.length || 0) +
    (result?.mediaMetadata?.length || 0);
  return {
    getMetadataResult: {
      count,
      index: 0,
      total: count,
      ...result,
    },
  };
}

export type SearchResponse = {
  searchResult: getMetadataResult;
};

export function searchResult(
  result: Partial<getMetadataResult>
): SearchResponse {
  const count =
    (result?.mediaCollection?.length || 0) +
    (result?.mediaMetadata?.length || 0);
  return {
    searchResult: {
      count,
      index: 0,
      total: count,
      ...result,
    },
  };
}

class SonosSoap {
  linkCodes: LinkCodes;
  webAddress: string;

  constructor(webAddress: string, linkCodes: LinkCodes) {
    this.webAddress = webAddress;
    this.linkCodes = linkCodes;
  }

  getAppLink(): GetAppLinkResult {
    const linkCode = this.linkCodes.mint();
    return {
      getAppLinkResult: {
        authorizeAccount: {
          appUrlStringId: "AppLinkMessage",
          deviceLink: {
            regUrl: `${this.webAddress}${LOGIN_ROUTE}?linkCode=${linkCode}`,
            linkCode: linkCode,
            showLinkCode: false,
          },
        },
      },
    };
  }

  getDeviceAuthToken({
    linkCode,
  }: {
    linkCode: string;
  }): GetDeviceAuthTokenResult {
    const association = this.linkCodes.associationFor(linkCode);
    if (association) {
      return {
        getDeviceAuthTokenResult: {
          authToken: association.authToken,
          privateKey: "",
          userInfo: {
            nickname: association.nickname,
            userIdHashCode: crypto
              .createHash("sha256")
              .update(association.userId)
              .digest("hex"),
          },
        },
      };
    } else {
      throw {
        Fault: {
          faultcode: "Client.NOT_LINKED_RETRY",
          faultstring: "Link Code not found retry...",
          detail: {
            ExceptionInfo: "NOT_LINKED_RETRY",
            SonosError: "5",
          },
        },
      };
    }
  }
}

export type ContainerType = "container" | "search" | "albumList";

export type Container = {
  itemType: ContainerType;
  id: string;
  title: string;
  displayType: string | undefined;
};

const genre = (genre: Genre) => ({
  itemType: "container",
  id: `genre:${genre.id}`,
  title: genre.name,
});

const playlist = (playlist: PlaylistSummary) => ({
  itemType: "album",
  id: `playlist:${playlist.id}`,
  title: playlist.name,
  canPlay: true,
});

export const defaultAlbumArtURI = (
  webAddress: string,
  accessToken: string,
  album: AlbumSummary
) =>
  `${webAddress}/album/${album.id}/art/size/180?${BONOB_ACCESS_TOKEN_HEADER}=${accessToken}`;

export const defaultArtistArtURI = (
  webAddress: string,
  accessToken: string,
  artist: ArtistSummary
) =>
  `${webAddress}/artist/${artist.id}/art/size/180?${BONOB_ACCESS_TOKEN_HEADER}=${accessToken}`;

export const album = (
  webAddress: string,
  accessToken: string,
  album: AlbumSummary
) => ({
  itemType: "album",
  id: `album:${album.id}`,
  artist: album.artistName,
  artistId: album.artistId,
  title: album.name,
  albumArtURI: defaultAlbumArtURI(webAddress, accessToken, album),
  canPlay: true,
});

export const track = (
  webAddress: string,
  accessToken: string,
  track: Track
) => ({
  itemType: "track",
  id: `track:${track.id}`,
  mimeType: track.mimeType,
  title: track.name,

  trackMetadata: {
    album: track.album.name,
    albumId: track.album.id,
    albumArtist: track.artist.name,
    albumArtistId: track.artist.id,
    albumArtURI: defaultAlbumArtURI(webAddress, accessToken, track.album),
    artist: track.artist.name,
    artistId: track.artist.id,
    duration: track.duration,
    genre: track.album.genre?.name,
    genreId: track.album.genre?.id,
    trackNumber: track.number,
  },
});

export const artist = (
  webAddress: string,
  accessToken: string,
  artist: ArtistSummary
) => ({
  itemType: "artist",
  id: `artist:${artist.id}`,
  artistId: artist.id,
  title: artist.name,
  albumArtURI: defaultArtistArtURI(webAddress, accessToken, artist),
});

const auth = async (
  musicService: MusicService,
  accessTokens: AccessTokens,
  id: string,
  headers?: SoapyHeaders
) => {
  if (!headers?.credentials) {
    throw {
      Fault: {
        faultcode: "Client.LoginUnsupported",
        faultstring: "Missing credentials...",
      },
    };
  }
  const authToken = headers.credentials.loginToken.token;
  const accessToken = accessTokens.mint(authToken);
  const [type, typeId] = id.split(":");
  return musicService
    .login(authToken)
    .then((musicLibrary) => ({
      musicLibrary,
      authToken,
      accessToken,
      type,
      typeId,
    }))
    .catch((_) => {
      throw {
        Fault: {
          faultcode: "Client.LoginUnauthorized",
          faultstring: "Credentials not found...",
        },
      };
    });
};

type SoapyHeaders = {
  credentials?: Credentials;
};

function bindSmapiSoapServiceToExpress(
  app: Express,
  soapPath: string,
  webAddress: string,
  linkCodes: LinkCodes,
  musicService: MusicService,
  accessTokens: AccessTokens,
  clock: Clock
) {
  const sonosSoap = new SonosSoap(webAddress, linkCodes);
  const soapyService = listen(
    app,
    soapPath,
    {
      Sonos: {
        SonosSoap: {
          getAppLink: () => sonosSoap.getAppLink(),
          getDeviceAuthToken: ({ linkCode }: { linkCode: string }) =>
            sonosSoap.getDeviceAuthToken({ linkCode }),
          getLastUpdate: () => ({
            getLastUpdateResult: {
              favorites: clock.now().unix(),
              catalog: clock.now().unix(),
              pollInterval: 120,
            },
          }),
          getMediaURI: async (
            { id }: { id: string },
            _,
            headers?: SoapyHeaders
          ) =>
            auth(musicService, accessTokens, id, headers).then(
              ({ accessToken, type, typeId }) => ({
                getMediaURIResult: `${webAddress}/stream/${type}/${typeId}`,
                httpHeaders: [
                  {
                    header: BONOB_ACCESS_TOKEN_HEADER,
                    value: accessToken,
                  },
                ],
              })
            ),
          getMediaMetadata: async (
            { id }: { id: string },
            _,
            headers?: SoapyHeaders
          ) =>
            auth(musicService, accessTokens, id, headers).then(
              async ({ musicLibrary, accessToken, typeId }) =>
                musicLibrary.track(typeId!).then((it) => ({
                  getMediaMetadataResult: track(webAddress, accessToken, it),
                }))
            ),
          search: async (
            { id, term }: { id: string; term: string },
            _,
            headers?: SoapyHeaders
          ) =>
            auth(musicService, accessTokens, id, headers).then(
              async ({ musicLibrary, accessToken }) => {
                switch (id) {
                  case "albums":
                    return musicLibrary.searchAlbums(term).then((it) =>
                      searchResult({
                        count: it.length,
                        mediaCollection: it.map((albumSummary) =>
                          album(webAddress, accessToken, albumSummary)
                        ),
                      })
                    );
                  case "artists":
                    return musicLibrary.searchArtists(term).then((it) =>
                      searchResult({
                        count: it.length,
                        mediaCollection: it.map((artistSummary) =>
                          artist(webAddress, accessToken, artistSummary)
                        ),
                      })
                    );
                  case "tracks":
                    return musicLibrary.searchTracks(term).then((it) =>
                      searchResult({
                        count: it.length,
                        mediaCollection: it.map((aTrack) =>
                          album(webAddress, accessToken, aTrack.album)
                        ),
                      })
                    );
                  default:
                    throw `Unsupported search by:${id}`;
                }
              }
            ),
          getExtendedMetadata: async (
            {
              id,
              index,
              count,
            }: // recursive,
            { id: string; index: number; count: number; recursive: boolean },
            _,
            headers?: SoapyHeaders
          ) =>
            auth(musicService, accessTokens, id, headers).then(
              async ({ musicLibrary, accessToken, type, typeId }) => {
                const paging = { _index: index, _count: count };
                switch (type) {
                  case "artist":
                    return musicLibrary.artist(typeId!).then((artist) => {
                      const [page, total] = slice2<Album>(paging)(
                        artist.albums
                      );
                      return {
                        getExtendedMetadataResult: {
                          count: page.length,
                          index: paging._index,
                          total,
                          mediaCollection: page.map((it) =>
                            album(webAddress, accessToken, it)
                          ),
                          relatedBrowse:
                            artist.similarArtists.length > 0
                              ? [
                                  {
                                    id: `relatedArtists:${artist.id}`,
                                    type: "RELATED_ARTISTS",
                                  },
                                ]
                              : [],
                        },
                      };
                    });
                  default:
                    throw `Unsupported id:${id}`;
                }
              }
            ),
          getMetadata: async (
            {
              id,
              index,
              count,
            }: // recursive,
            { id: string; index: number; count: number; recursive: boolean },
            _,
            headers?: SoapyHeaders
          ) =>
            auth(musicService, accessTokens, id, headers).then(
              ({ musicLibrary, accessToken, type, typeId }) => {
                const paging = { _index: index, _count: count };
                logger.debug(
                  `Fetching metadata type=${type}, typeId=${typeId}`
                );

                const albums = (q: AlbumQuery): Promise<GetMetadataResponse> =>
                  musicLibrary.albums(q).then((result) => {
                    return getMetadataResult({
                      mediaCollection: result.results.map((it) =>
                        album(webAddress, accessToken, it)
                      ),
                      index: paging._index,
                      total: result.total,
                    });
                  });

                switch (type) {
                  case "root":
                    return getMetadataResult({
                      mediaCollection: [
                        {
                          itemType: "container",
                          id: "artists",
                          title: "Artists",
                        },
                        {
                          itemType: "albumList",
                          id: "albums",
                          title: "Albums",
                        },
                        {
                          itemType: "container",
                          id: "playlists",
                          title: "Playlists",
                        },
                        {
                          itemType: "container",
                          id: "genres",
                          title: "Genres",
                        },
                        {
                          itemType: "albumList",
                          id: "randomAlbums",
                          title: "Random",
                        },
                        {
                          itemType: "albumList",
                          id: "starredAlbums",
                          title: "Starred",
                        },
                        {
                          itemType: "albumList",
                          id: "recentlyAdded",
                          title: "Recently Added",
                        },
                        {
                          itemType: "albumList",
                          id: "recentlyPlayed",
                          title: "Recently Played",
                        },
                        {
                          itemType: "albumList",
                          id: "mostPlayed",
                          title: "Most Played",
                        },
                      ],
                      index: 0,
                      total: 9,
                    });
                  case "search":
                    return getMetadataResult({
                      mediaCollection: [
                        { itemType: "search", id: "artists", title: "Artists" },
                        { itemType: "search", id: "albums", title: "Albums" },
                        { itemType: "search", id: "tracks", title: "Tracks" },
                      ],
                      index: 0,
                      total: 3,
                    });
                  case "artists":
                    return musicLibrary.artists(paging).then((result) => {
                      return getMetadataResult({
                        mediaCollection: result.results.map((it) =>
                          artist(webAddress, accessToken, it)
                        ),
                        index: paging._index,
                        total: result.total,
                      });
                    });
                  case "albums": {
                    return albums({
                      type: "alphabeticalByArtist",
                      ...paging,
                    });
                  }
                  case "genre":
                    return albums({
                      type: "byGenre",
                      genre: typeId,
                      ...paging,
                    });
                  case "randomAlbums":
                    return albums({
                      type: "random",
                      ...paging,
                    });
                  case "starredAlbums":
                    return albums({
                      type: "starred",
                      ...paging,
                    });
                  case "recentlyAdded":
                    return albums({
                      type: "newest",
                      ...paging,
                    });
                  case "recentlyPlayed":
                    return albums({
                      type: "recent",
                      ...paging,
                    });
                  case "mostPlayed":
                    return albums({
                      type: "frequent",
                      ...paging,
                    });
                  case "genres":
                    return musicLibrary
                      .genres()
                      .then(slice2(paging))
                      .then(([page, total]) =>
                        getMetadataResult({
                          mediaCollection: page.map(genre),
                          index: paging._index,
                          total,
                        })
                      );
                  case "playlists":
                    return musicLibrary
                      .playlists()
                      .then(slice2(paging))
                      .then(([page, total]) =>
                        getMetadataResult({
                          mediaCollection: page.map(playlist),
                          index: paging._index,
                          total,
                        })
                      );
                  case "playlist":
                    return musicLibrary
                      .playlist(typeId!)
                      .then(playlist => playlist.entries)
                      .then(slice2(paging))
                      .then(([page, total]) => {
                        return getMetadataResult({
                          mediaMetadata: page.map((it) =>
                            track(webAddress, accessToken, it)
                          ),
                          index: paging._index,
                          total,
                        });
                      });
                  case "artist":
                    return musicLibrary
                      .artist(typeId!)
                      .then((artist) => artist.albums)
                      .then(slice2(paging))
                      .then(([page, total]) => {
                        return getMetadataResult({
                          mediaCollection: page.map((it) =>
                            album(webAddress, accessToken, it)
                          ),
                          index: paging._index,
                          total,
                        });
                      });
                  case "relatedArtists":
                    return musicLibrary
                      .artist(typeId!)
                      .then((artist) => artist.similarArtists)
                      .then(slice2(paging))
                      .then(([page, total]) => {
                        return getMetadataResult({
                          mediaCollection: page.map((it) =>
                            artist(webAddress, accessToken, it)
                          ),
                          index: paging._index,
                          total,
                        });
                      });
                  case "album":
                    return musicLibrary
                      .tracks(typeId!)
                      .then(slice2(paging))
                      .then(([page, total]) => {
                        return getMetadataResult({
                          mediaMetadata: page.map((it) =>
                            track(webAddress, accessToken, it)
                          ),
                          index: paging._index,
                          total,
                        });
                      });
                  default:
                    throw `Unsupported id:${id}`;
                }
              }
            ),
        },
      },
    },
    readFileSync(WSDL_FILE, "utf8")
  );

  soapyService.log = (type, data) => {
    switch (type) {
      case "info":
        logger.info({ level: "info", data });
        break;
      case "warn":
        logger.warn({ level: "warn", data });
        break;
      case "error":
        logger.error({ level: "error", data });
        break;
      default:
        logger.debug({ level: "debug", data });
    }
  };
}

export default bindSmapiSoapServiceToExpress;
