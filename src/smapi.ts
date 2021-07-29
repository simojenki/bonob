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
import { URLBuilder } from "./url_builder";

export const LOGIN_ROUTE = "/login";
export const REGISTER_ROUTE = "/register";
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
  bonobUrl: URLBuilder;

  constructor(bonobUrl: URLBuilder, linkCodes: LinkCodes) {
    this.bonobUrl = bonobUrl;
    this.linkCodes = linkCodes;
  }

  getAppLink(): GetAppLinkResult {
    const linkCode = this.linkCodes.mint();
    return {
      getAppLinkResult: {
        authorizeAccount: {
          appUrlStringId: "AppLinkMessage",
          deviceLink: {
            regUrl: this.bonobUrl
              .append({ pathname: LOGIN_ROUTE })
              .with({ searchParams: { linkCode } })
              .href(),
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
  itemType: "playlist",
  id: `playlist:${playlist.id}`,
  title: playlist.name,
  canPlay: true,
  attributes: {
    readOnly: false,
    userContent: false,
    renameable: false,
  },
});

export const defaultAlbumArtURI = (bonobUrl: URLBuilder, album: AlbumSummary) =>
  bonobUrl.append({ pathname: `/album/${album.id}/art/size/180` });

export const defaultArtistArtURI = (
  bonobUrl: URLBuilder,
  artist: ArtistSummary
) => bonobUrl.append({ pathname: `/artist/${artist.id}/art/size/180` });

export const album = (bonobUrl: URLBuilder, album: AlbumSummary) => ({
  itemType: "album",
  id: `album:${album.id}`,
  artist: album.artistName,
  artistId: album.artistId,
  title: album.name,
  albumArtURI: defaultAlbumArtURI(bonobUrl, album).href(),
  canPlay: true,
  // defaults
  // canScroll: false,
  // canEnumerate: true,
  // canAddToFavorites: true
});

export const track = (bonobUrl: URLBuilder, track: Track) => ({
  itemType: "track",
  id: `track:${track.id}`,
  mimeType: track.mimeType,
  title: track.name,

  trackMetadata: {
    album: track.album.name,
    albumId: track.album.id,
    albumArtist: track.artist.name,
    albumArtistId: track.artist.id,
    albumArtURI: defaultAlbumArtURI(bonobUrl, track.album).href(),
    artist: track.artist.name,
    artistId: track.artist.id,
    duration: track.duration,
    genre: track.album.genre?.name,
    genreId: track.album.genre?.id,
    trackNumber: track.number,
  },
});

export const artist = (bonobUrl: URLBuilder, artist: ArtistSummary) => ({
  itemType: "artist",
  id: `artist:${artist.id}`,
  artistId: artist.id,
  title: artist.name,
  albumArtURI: defaultArtistArtURI(bonobUrl, artist).href(),
});

const auth = async (
  musicService: MusicService,
  accessTokens: AccessTokens,
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

  return musicService
    .login(authToken)
    .then((musicLibrary) => ({
      musicLibrary,
      authToken,
      accessToken,
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

function splitId<T>(id: string) {
  const [type, typeId] = id.split(":");
  return (t: T) => ({
    ...t,
    type,
    typeId: typeId!,
  });
}

type SoapyHeaders = {
  credentials?: Credentials;
};

function bindSmapiSoapServiceToExpress(
  app: Express,
  soapPath: string,
  bonobUrl: URLBuilder,
  linkCodes: LinkCodes,
  musicService: MusicService,
  accessTokens: AccessTokens,
  clock: Clock
) {
  const sonosSoap = new SonosSoap(bonobUrl, linkCodes);
  const urlWithToken = (accessToken: string) =>
    bonobUrl.append({
      searchParams: {
        "bonob-access-token": accessToken,
      },
    });

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
              autoRefreshEnabled: true,
              favorites: clock.now().unix(),
              catalog: clock.now().unix(),
              pollInterval: 60,
            },
          }),
          getMediaURI: async (
            { id }: { id: string },
            _,
            headers?: SoapyHeaders
          ) =>
            auth(musicService, accessTokens, headers)
              .then(splitId(id))
              .then(({ accessToken, type, typeId }) => ({
                getMediaURIResult: bonobUrl
                  .append({
                    pathname: `/stream/${type}/${typeId}`,
                  })
                  .href(),
                httpHeaders: [
                  {
                    header: BONOB_ACCESS_TOKEN_HEADER,
                    value: accessToken,
                  },
                ],
              })),
          getMediaMetadata: async (
            { id }: { id: string },
            _,
            headers?: SoapyHeaders
          ) =>
            auth(musicService, accessTokens, headers)
              .then(splitId(id))
              .then(async ({ musicLibrary, accessToken, typeId }) =>
                musicLibrary.track(typeId!).then((it) => ({
                  getMediaMetadataResult: track(
                    urlWithToken(accessToken),
                    it
                  ),
                }))
              ),
          search: async (
            { id, term }: { id: string; term: string },
            _,
            headers?: SoapyHeaders
          ) =>
            auth(musicService, accessTokens, headers)
              .then(splitId(id))
              .then(async ({ musicLibrary, accessToken }) => {
                switch (id) {
                  case "albums":
                    return musicLibrary.searchAlbums(term).then((it) =>
                      searchResult({
                        count: it.length,
                        mediaCollection: it.map((albumSummary) =>
                          album(urlWithToken(accessToken), albumSummary)
                        ),
                      })
                    );
                  case "artists":
                    return musicLibrary.searchArtists(term).then((it) =>
                      searchResult({
                        count: it.length,
                        mediaCollection: it.map((artistSummary) =>
                          artist(urlWithToken(accessToken), artistSummary)
                        ),
                      })
                    );
                  case "tracks":
                    return musicLibrary.searchTracks(term).then((it) =>
                      searchResult({
                        count: it.length,
                        mediaCollection: it.map((aTrack) =>
                          album(urlWithToken(accessToken), aTrack.album)
                        ),
                      })
                    );
                  default:
                    throw `Unsupported search by:${id}`;
                }
              }),
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
            auth(musicService, accessTokens, headers)
              .then(splitId(id))
              .then(async ({ musicLibrary, accessToken, type, typeId }) => {
                const paging = { _index: index, _count: count };
                switch (type) {
                  case "artist":
                    return musicLibrary.artist(typeId).then((artist) => {
                      const [page, total] = slice2<Album>(paging)(
                        artist.albums
                      );
                      return {
                        getExtendedMetadataResult: {
                          count: page.length,
                          index: paging._index,
                          total,
                          mediaCollection: page.map((it) =>
                            album(urlWithToken(accessToken), it)
                          ),
                          relatedBrowse:
                            artist.similarArtists.filter(it => it.inLibrary).length > 0
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
                  case "track":
                    return musicLibrary.track(typeId).then((it) => ({
                      getExtendedMetadataResult: {
                        mediaMetadata: {
                          id: `track:${it.id}`,
                          itemType: "track",
                          title: it.name,
                          mimeType: it.mimeType,
                          trackMetadata: {
                            artistId: `artist:${it.artist.id}`,
                            artist: it.artist.name,
                            albumId: `album:${it.album.id}`,
                            album: it.album.name,
                            genre: it.genre?.name,
                            genreId: it.genre?.id,
                            duration: it.duration,
                            albumArtURI: defaultAlbumArtURI(
                              urlWithToken(accessToken),
                              it.album
                            ).href(),
                          },
                        },
                      },
                    }));
                  case "album":
                    return musicLibrary.album(typeId).then((it) => ({
                      getExtendedMetadataResult: {
                        mediaCollection: {
                          attributes: {
                            readOnly: true,
                            userContent: false,
                            renameable: false,
                          },
                          ...album(urlWithToken(accessToken), it),
                        },
                        // <mediaCollection readonly="true">
                        //   </mediaCollection>
                        //   <relatedText>
                        //     <id>AL:123456</id>
                        //     <type>ALBUM_NOTES</type>
                        //   </relatedText>
                        // </getExtendedMetadataResult>
                      },
                    }));
                  default:
                    throw `Unsupported getExtendedMetadata id=${id}`;
                }
              }),
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
            auth(musicService, accessTokens, headers)
              .then(splitId(id))
              .then(({ musicLibrary, accessToken, type, typeId }) => {
                const paging = { _index: index, _count: count };
                logger.debug(
                  `Fetching metadata type=${type}, typeId=${typeId}`
                );

                const albums = (q: AlbumQuery): Promise<GetMetadataResponse> =>
                  musicLibrary.albums(q).then((result) => {
                    return getMetadataResult({
                      mediaCollection: result.results.map((it) =>
                        album(urlWithToken(accessToken), it)
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
                          itemType: "playlist",
                          id: "playlists",
                          title: "Playlists",
                          attributes: {
                            readOnly: false,
                            userContent: true,
                            renameable: false,
                          },
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
                          artist(urlWithToken(accessToken), it)
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
                      .then((playlist) => playlist.entries)
                      .then(slice2(paging))
                      .then(([page, total]) => {
                        return getMetadataResult({
                          mediaMetadata: page.map((it) =>
                            track(urlWithToken(accessToken), it)
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
                            album(urlWithToken(accessToken), it)
                          ),
                          index: paging._index,
                          total,
                        });
                      });
                  case "relatedArtists":
                    return musicLibrary
                      .artist(typeId!)
                      .then((artist) => artist.similarArtists)
                      .then(similarArtists => similarArtists.filter(it => it.inLibrary))
                      .then(slice2(paging))
                      .then(([page, total]) => {
                        return getMetadataResult({
                          mediaCollection: page.map((it) =>
                            artist(urlWithToken(accessToken), it)
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
                            track(urlWithToken(accessToken), it)
                          ),
                          index: paging._index,
                          total,
                        });
                      });
                  default:
                    throw `Unsupported getMetadata id=${id}`;
                }
              }),
          createContainer: async (
            { title, seedId }: { title: string; seedId: string | undefined },
            _,
            headers?: SoapyHeaders
          ) =>
            auth(musicService, accessTokens, headers)
              .then(({ musicLibrary }) =>
                musicLibrary
                  .createPlaylist(title)
                  .then((playlist) => ({ playlist, musicLibrary }))
              )
              .then(({ musicLibrary, playlist }) => {
                if (seedId) {
                  musicLibrary.addToPlaylist(
                    playlist.id,
                    seedId.split(":")[1]!
                  );
                }
                return playlist;
              })
              .then((it) => ({
                createContainerResult: {
                  id: `playlist:${it.id}`,
                  updateId: "",
                },
              })),
          deleteContainer: async (
            { id }: { id: string },
            _,
            headers?: SoapyHeaders
          ) =>
            auth(musicService, accessTokens, headers)
              .then(({ musicLibrary }) => musicLibrary.deletePlaylist(id))
              .then((_) => ({ deleteContainerResult: {} })),
          addToContainer: async (
            { id, parentId }: { id: string; parentId: string },
            _,
            headers?: SoapyHeaders
          ) =>
            auth(musicService, accessTokens, headers)
              .then(splitId(id))
              .then(({ musicLibrary, typeId }) =>
                musicLibrary.addToPlaylist(parentId.split(":")[1]!, typeId)
              )
              .then((_) => ({ addToContainerResult: { updateId: "" } })),
          removeFromContainer: async (
            { id, indices }: { id: string; indices: string },
            _,
            headers?: SoapyHeaders
          ) =>
            auth(musicService, accessTokens, headers)
              .then(splitId(id))
              .then((it) => ({
                ...it,
                indices: indices.split(",").map((it) => +it),
              }))
              .then(({ musicLibrary, typeId, indices }) => {
                if (id == "playlists") {
                  musicLibrary.playlists().then((it) => {
                    indices.forEach((i) => {
                      musicLibrary.deletePlaylist(it[i]?.id!);
                    });
                  });
                } else {
                  musicLibrary.removeFromPlaylist(typeId, indices);
                }
              })
              .then((_) => ({ removeFromContainerResult: { updateId: "" } })),
          setPlayedSeconds: async (
            { id, seconds }: { id: string; seconds: string },
            _,
            headers?: SoapyHeaders
          ) =>
            auth(musicService, accessTokens, headers)
              .then(splitId(id))
              .then(({ musicLibrary, type, typeId }) => {
                switch (type) {
                  case "track":
                    musicLibrary.track(typeId).then(({ duration }) => {
                      if (
                        (duration < 30 && +seconds >= 10) ||
                        (duration >= 30 && +seconds >= 30)
                      ) {
                        musicLibrary.scrobble(typeId);
                      }
                    });
                    break;
                  default:
                    logger.info("Unsupported scrobble", { id, seconds });
                    break;
                }
              })
              .then((_) => ({
                setPlayedSecondsResult: {},
              })),
        },
      },
    },
    readFileSync(WSDL_FILE, "utf8"),
    (err: any, res: any) => {
      if (err) {
        logger.error("BOOOOM", { err, res });
      }
    }
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
