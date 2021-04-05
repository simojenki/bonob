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
  MusicLibrary,
  MusicService,
  slice2,
  Track,
} from "./music_service";
import { AccessTokens } from "./access_tokens";
import { BONOB_ACCESS_TOKEN_HEADER } from "./server";

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

export type Container = {
  itemType: "container";
  id: string;
  title: string;
};

const container = ({
  id,
  title,
}: {
  id: string;
  title: string;
}): Container => ({
  itemType: "container",
  id,
  title,
});

const genre = (genre: Genre) => ({
  itemType: "container",
  id: `genre:${genre.id}`,
  title: genre.name,
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

type SoapyHeaders = {
  credentials?: Credentials;
};

function bindSmapiSoapServiceToExpress(
  app: Express,
  soapPath: string,
  webAddress: string,
  linkCodes: LinkCodes,
  musicService: MusicService,
  accessTokens: AccessTokens
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
          getMediaURI: async (
            { id }: { id: string },
            _,
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
            await musicService
              .login(headers.credentials.loginToken.token)
              .catch((_) => {
                throw {
                  Fault: {
                    faultcode: "Client.LoginUnauthorized",
                    faultstring: "Credentials not found...",
                  },
                };
              });

            const [type, typeId] = id.split(":");
            return {
              getMediaURIResult: `${webAddress}/stream/${type}/${typeId}`,
              httpHeaders: [
                {
                  header: BONOB_ACCESS_TOKEN_HEADER,
                  value: accessTokens.mint(
                    headers?.credentials?.loginToken.token
                  ),
                },
              ],
            };
          },
          getMediaMetadata: async (
            { id }: { id: string },
            _,
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
            const login = await musicService
              .login(headers.credentials.loginToken.token)
              .catch((_) => {
                throw {
                  Fault: {
                    faultcode: "Client.LoginUnauthorized",
                    faultstring: "Credentials not found...",
                  },
                };
              });

            const typeId = id.split(":")[1];
            const musicLibrary = login as MusicLibrary;
            return musicLibrary.track(typeId!).then((it) => {
              const accessToken = accessTokens.mint(authToken);
              return {
                getMediaMetadataResult: track(webAddress, accessToken, it),
              };
            });
          },
          getExtendedMetadata: async (
            {
              id,
              index,
              count,
            }: // recursive,
            { id: string; index: number; count: number; recursive: boolean },
            _,
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
            const login = await musicService.login(authToken).catch((_) => {
              throw {
                Fault: {
                  faultcode: "Client.LoginUnauthorized",
                  faultstring: "Credentials not found...",
                },
              };
            });

            const musicLibrary = login as MusicLibrary;

            const [type, typeId] = id.split(":");
            const paging = { _index: index, _count: count };
            switch (type) {
              case "artist":
                return await musicLibrary.artist(typeId!).then((artist) => {
                  const [page, total] = slice2<Album>(paging)(artist.albums);
                  const accessToken = accessTokens.mint(authToken);

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
          },
          getMetadata: async (
            {
              id,
              index,
              count,
            }: // recursive,
            { id: string; index: number; count: number; recursive: boolean },
            _,
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
            const login = await musicService.login(authToken).catch((_) => {
              throw {
                Fault: {
                  faultcode: "Client.LoginUnauthorized",
                  faultstring: "Credentials not found...",
                },
              };
            });

            const musicLibrary = login as MusicLibrary;

            const [type, typeId] = id.split(":");
            const paging = { _index: index, _count: count };
            logger.debug(`Fetching metadata type=${type}, typeId=${typeId}`);

            const albums = (q: AlbumQuery): Promise<GetMetadataResponse> =>
              musicLibrary.albums(q).then((result) => {
                const accessToken = accessTokens.mint(authToken);
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
                    container({ id: "artists", title: "Artists" }),
                    container({ id: "albums", title: "Albums" }),
                    container({ id: "genres", title: "Genres" }),
                    container({ id: "randomAlbums", title: "Random" }),
                    container({ id: "recentlyAdded", title: "Recently Added" }),
                    container({
                      id: "recentlyPlayed",
                      title: "Recently Played",
                    }),
                  ],
                  index: 0,
                  total: 6,
                });
              case "artists":
                return await musicLibrary.artists(paging).then((result) => {
                  const accessToken = accessTokens.mint(authToken);
                  return getMetadataResult({
                    mediaCollection: result.results.map((it) =>
                      artist(webAddress, accessToken, it)
                    ),
                    index: paging._index,
                    total: result.total,
                  });
                });
              case "albums": {
                return await albums({
                  type: "alphabeticalByArtist",
                  ...paging,
                });
              }
              case "randomAlbums":
                return await albums({
                  type: "random",
                  ...paging,
                });
              case "genre":
                return await albums({
                  type: "byGenre",
                  genre: typeId,
                  ...paging,
                });
              case "recentlyAdded":
                return await albums({
                  type: "newest",
                  ...paging,
                });
              case "recentlyPlayed":
                return await albums({
                  type: "frequent",
                  ...paging,
                });
              case "genres":
                return await musicLibrary
                  .genres()
                  .then(slice2(paging))
                  .then(([page, total]) =>
                    getMetadataResult({
                      mediaCollection: page.map(genre),
                      index: paging._index,
                      total,
                    })
                  );
              case "artist":
                return await musicLibrary
                  .artist(typeId!)
                  .then((artist) => artist.albums)
                  .then(slice2(paging))
                  .then(([page, total]) => {
                    const accessToken = accessTokens.mint(authToken);
                    return getMetadataResult({
                      mediaCollection: page.map((it) =>
                        album(webAddress, accessToken, it)
                      ),
                      index: paging._index,
                      total,
                    });
                  });
              case "relatedArtists":
                return await musicLibrary
                  .artist(typeId!)
                  .then((artist) => artist.similarArtists)
                  .then(slice2(paging))
                  .then(([page, total]) => {
                    const accessToken = accessTokens.mint(authToken);
                    return getMetadataResult({
                      mediaCollection: page.map((it) =>
                        artist(webAddress, accessToken, it)
                      ),
                      index: paging._index,
                      total,
                    });
                  });
              case "album":
                return await musicLibrary
                  .tracks(typeId!)
                  .then(slice2(paging))
                  .then(([page, total]) => {
                    const accessToken = accessTokens.mint(authToken);
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
          },
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
