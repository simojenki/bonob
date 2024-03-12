import crypto from "crypto";
import { Express, Request } from "express";
import { listen } from "soap";
import { readFileSync } from "fs";
import path from "path";
import { option as O, either as E, taskEither as TE, task as T } from "fp-ts";
import { pipe } from "fp-ts/lib/function";

import logger from "./logger";

import { LinkCodes } from "./link_codes";
import {
  Album,
  AlbumQuery,
  AlbumSummary,
  ArtistSummary,
  Genre,
  Year,
  MusicService,
  Playlist,
  RadioStation,
  Rating,
  slice2,
  Track,
} from "./music_service";
import { APITokens } from "./api_tokens";
import { Clock } from "./clock";
import { URLBuilder } from "./url_builder";
import { asLANGs, I8N } from "./i8n";
import { ICON, iconForGenre } from "./icon";
import _ from "underscore";
import { BUrn, formatForURL } from "./burn";
import {
  isExpiredTokenError,
  MissingLoginTokenError,
  SmapiAuthTokens,
  SMAPI_FAULT_LOGIN_UNAUTHORIZED,
  ToSmapiFault,
} from "./smapi_auth";

export const LOGIN_ROUTE = "/login";
export const CREATE_REGISTRATION_ROUTE = "/registration/add";
export const REMOVE_REGISTRATION_ROUTE = "/registration/remove";
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
    key: string;
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

export const ratingAsInt = (rating: Rating): number =>
  rating.stars * 10 + (rating.love ? 1 : 0) + 100;
export const ratingFromInt = (value: number): Rating => {
  const x = value - 100;
  return { love: x % 10 == 1, stars: Math.floor(x / 10) };
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
  smapiAuthTokens: SmapiAuthTokens;
  clock: Clock;

  constructor(
    bonobUrl: URLBuilder,
    linkCodes: LinkCodes,
    smapiAuthTokens: SmapiAuthTokens,
    clock: Clock
  ) {
    this.bonobUrl = bonobUrl;
    this.linkCodes = linkCodes;
    this.smapiAuthTokens = smapiAuthTokens;
    this.clock = clock;
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
      const smapiAuthToken = this.smapiAuthTokens.issue(
        association.serviceToken
      );
      return {
        getDeviceAuthTokenResult: {
          authToken: smapiAuthToken.token,
          privateKey: smapiAuthToken.key,
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
      logger.info(
        "Client not linked, awaiting user to associate account with link code by logging in."
      );
      throw {
        Fault: {
          faultcode: "Client.NOT_LINKED_RETRY",
          faultstring:
            "Link Code not found yet, sonos app will keep polling until you log in to bonob",
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

const genre = (bonobUrl: URLBuilder, genre: Genre) => ({
  itemType: "albumList",
  id: `genre:${genre.id}`,
  title: genre.name,
  albumArtURI: iconArtURI(bonobUrl, iconForGenre(genre.name)).href(),
});

const year = (bonobUrl: URLBuilder, year: Year) => ({
  itemType: "albumList",
  id: `year:${year.year}`,
  title: year.year,
  albumArtURI: iconArtURI(bonobUrl, "music").href(),
});

const playlist = (bonobUrl: URLBuilder, playlist: Playlist) => ({
  itemType: "playlist",
  id: `playlist:${playlist.id}`,
  title: playlist.name,
  albumArtURI: coverArtURI(bonobUrl, playlist).href(),
  canPlay: true,
  attributes: {
    readOnly: false,
    userContent: false,
    renameable: false,
  },
});

export const coverArtURI = (
  bonobUrl: URLBuilder,
  { coverArt }: { coverArt?: BUrn | undefined }
) =>
  pipe(
    coverArt,
    O.fromNullable,
    O.map((it) =>
      bonobUrl.append({
        pathname: `/art/${encodeURIComponent(formatForURL(it))}/size/180`,
      })
    ),
    O.getOrElseW(() => iconArtURI(bonobUrl, "vinyl"))
  );

export const iconArtURI = (bonobUrl: URLBuilder, icon: ICON) =>
  bonobUrl.append({
    pathname: `/icon/${icon}/size/legacy`,
  });

export const sonosifyMimeType = (mimeType: string) =>
  mimeType == "audio/x-flac" ? "audio/flac" : mimeType;

export const album = (bonobUrl: URLBuilder, album: AlbumSummary) => ({
  itemType: "album",
  id: `album:${album.id}`,
  artist: album.artistName,
  artistId: `artist:${album.artistId}`,
  title: album.name,
  albumArtURI: coverArtURI(bonobUrl, album).href(),
  canPlay: true,
  // defaults
  // canScroll: false,
  // canEnumerate: true,
  // canAddToFavorites: true
});

export const internetRadioStation = (station: RadioStation) => ({
  itemType: "stream",
  id: `internetRadioStation:${station.id}`,
  title: station.name,
  mimeType: "audio/mpeg",
});

export const track = (bonobUrl: URLBuilder, track: Track) => ({
  itemType: "track",
  id: `track:${track.id}`,
  mimeType: sonosifyMimeType(track.encoding.mimeType),
  title: track.name,

  trackMetadata: {
    album: track.album.name,
    albumId: `album:${track.album.id}`,
    albumArtist: track.artist.name,
    albumArtistId: track.artist.id ? `artist:${track.artist.id}` : undefined,
    albumArtURI: coverArtURI(bonobUrl, track).href(),
    artist: track.artist.name,
    artistId: track.artist.id ? `artist:${track.artist.id}` : undefined,
    duration: track.duration,
    genre: track.album.genre?.name,
    genreId: track.album.genre?.id,
    trackNumber: track.number,
  },
  dynamic: {
    property: [{ name: "rating", value: `${ratingAsInt(track.rating)}` }],
  },
});

export const artist = (bonobUrl: URLBuilder, artist: ArtistSummary) => ({
  itemType: "artist",
  id: `artist:${artist.id}`,
  artistId: artist.id,
  title: artist.name,
  albumArtURI: coverArtURI(bonobUrl, { coverArt: artist.image }).href(),
});

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

type Auth = {
  serviceToken: string;
  credentials: Credentials;
  apiKey: string;
};

function isAuth(thing: any): thing is Auth {
  return thing.serviceToken;
}

function bindSmapiSoapServiceToExpress(
  app: Express,
  soapPath: string,
  bonobUrl: URLBuilder,
  linkCodes: LinkCodes,
  musicService: MusicService,
  apiKeys: APITokens,
  clock: Clock,
  i8n: I8N,
  smapiAuthTokens: SmapiAuthTokens
) {
  const sonosSoap = new SonosSoap(bonobUrl, linkCodes, smapiAuthTokens, clock);

  const urlWithToken = (accessToken: string) =>
    bonobUrl.append({
      searchParams: {
        bat: accessToken,
      },
    });

  const auth = (credentials?: Credentials): E.Either<ToSmapiFault, Auth> => {
    const credentialsFrom = E.fromNullable(new MissingLoginTokenError());
    return pipe(
      credentialsFrom(credentials),
      E.chain((credentials) =>
        pipe(
          smapiAuthTokens.verify({
            token: credentials.loginToken.token,
            key: credentials.loginToken.key,
          }),
          E.map((serviceToken) => ({
            serviceToken,
            credentials,
          }))
        )
      ),
      E.map(({ serviceToken, credentials }) => ({
        serviceToken,
        credentials,
        apiKey: apiKeys.mint(serviceToken),
      }))
    );
  };

  const login = async (credentials?: Credentials) => {
    const authOrFail = pipe(
      auth(credentials),
      E.getOrElseW((fault) => fault)
    );
    if (isAuth(authOrFail)) {
      return musicService
        .login(authOrFail.serviceToken)
        .then((musicLibrary) => ({ ...authOrFail, musicLibrary }))
        .catch((_) => {
          throw SMAPI_FAULT_LOGIN_UNAUTHORIZED;
        });
    } else if (isExpiredTokenError(authOrFail)) {
      throw await pipe(
        musicService.refreshToken(authOrFail.expiredToken),
        TE.map((it) => smapiAuthTokens.issue(it.serviceToken)),
        TE.map((newToken) => ({
          Fault: {
            faultcode: "Client.TokenRefreshRequired",
            faultstring: "Token has expired",
            detail: {
              refreshAuthTokenResult: {
                authToken: newToken.token,
                privateKey: newToken.key,
              },
            },
          },
        })),
        TE.getOrElse(() => T.of(SMAPI_FAULT_LOGIN_UNAUTHORIZED))
      )();
    } else {
      throw authOrFail.toSmapiFault();
    }
  };

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
          refreshAuthToken: async (_, _2, soapyHeaders: SoapyHeaders) => {
            const serviceToken = pipe(
              auth(soapyHeaders?.credentials),
              E.fold(
                (fault) =>
                  isExpiredTokenError(fault)
                    ? E.right(fault.expiredToken)
                    : E.left(fault),
                (creds) => E.right(creds.serviceToken)
              ),
              E.getOrElseW((fault) => {
                throw fault.toSmapiFault();
              })
            );
            return pipe(
              musicService.refreshToken(serviceToken),
              TE.map((it) => smapiAuthTokens.issue(it.serviceToken)),
              TE.map((it) => ({
                refreshAuthTokenResult: {
                  authToken: it.token,
                  privateKey: it.key,
                },
              })),
              TE.getOrElse((_) => {
                throw SMAPI_FAULT_LOGIN_UNAUTHORIZED;
              })
            )();
          },
          getMediaURI: async (
            { id }: { id: string },
            _,
            soapyHeaders: SoapyHeaders
          ) =>
            login(soapyHeaders?.credentials)
              .then(splitId(id))
              .then(({ musicLibrary, credentials, type, typeId }) => {
                switch (type) {
                  case "internetRadioStation":
                    return musicLibrary.radioStation(typeId).then((it) => ({
                      getMediaURIResult: it.url,
                    }));
                  case "track":
                    return {
                      getMediaURIResult: bonobUrl
                        .append({
                          pathname: `/stream/${type}/${typeId}`,
                        })
                        .href(),
                      httpHeaders: [
                        {
                          httpHeader: {
                            header: "bnbt",
                            value: credentials.loginToken.token,
                          },
                        },
                        {
                          httpHeader: {
                            header: "bnbk",
                            value: credentials.loginToken.key,
                          },
                        },
                      ],
                    };
                  default:
                    throw `Unsupported type:${type}`;
                  }
              }),
          getMediaMetadata: async (
            { id }: { id: string },
            _,
            soapyHeaders: SoapyHeaders
          ) =>
            login(soapyHeaders?.credentials)
              .then(splitId(id))
              .then(async ({ musicLibrary, apiKey, type, typeId }) => {
                switch (type) {
                  case "internetRadioStation":
                    return musicLibrary.radioStation(typeId).then((it) => ({
                      getMediaMetadataResult: internetRadioStation(it),
                    }));
                  case "track":
                    return musicLibrary.track(typeId!).then((it) => ({
                      getMediaMetadataResult: track(urlWithToken(apiKey), it),
                    }));
                  default:
                    throw `Unsupported type:${type}`;
                }
              }),
          search: async (
            { id, term }: { id: string; term: string },
            _,
            soapyHeaders: SoapyHeaders
          ) =>
            login(soapyHeaders?.credentials)
              .then(splitId(id))
              .then(async ({ musicLibrary, apiKey }) => {
                switch (id) {
                  case "albums":
                    return musicLibrary.searchAlbums(term).then((it) =>
                      searchResult({
                        count: it.length,
                        mediaCollection: it.map((albumSummary) =>
                          album(urlWithToken(apiKey), albumSummary)
                        ),
                      })
                    );
                  case "artists":
                    return musicLibrary.searchArtists(term).then((it) =>
                      searchResult({
                        count: it.length,
                        mediaCollection: it.map((artistSummary) =>
                          artist(urlWithToken(apiKey), artistSummary)
                        ),
                      })
                    );
                  case "tracks":
                    return musicLibrary.searchTracks(term).then((it) =>
                      searchResult({
                        count: it.length,
                        mediaCollection: it.map((aTrack) =>
                          album(urlWithToken(apiKey), aTrack.album)
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
            soapyHeaders: SoapyHeaders
          ) =>
            login(soapyHeaders?.credentials)
              .then(splitId(id))
              .then(async ({ musicLibrary, apiKey, type, typeId }) => {
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
                            album(urlWithToken(apiKey), it)
                          ),
                          relatedBrowse:
                            artist.similarArtists.filter((it) => it.inLibrary)
                              .length > 0
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
                        mediaMetadata: track(urlWithToken(apiKey), it),
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
                          ...album(urlWithToken(apiKey), it),
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
            soapyHeaders: SoapyHeaders,
            { headers }: Pick<Request, "headers">
          ) =>
            login(soapyHeaders?.credentials)
              .then(splitId(id))
              .then(({ musicLibrary, apiKey, type, typeId }) => {
                const paging = { _index: index, _count: count };
                const acceptLanguage = headers["accept-language"];
                logger.debug(
                  `Fetching metadata type=${type}, typeId=${typeId}, acceptLanguage=${acceptLanguage}`
                );
                const lang = i8n(...asLANGs(acceptLanguage));

                const albums = (q: AlbumQuery): Promise<GetMetadataResponse> =>
                  musicLibrary.albums(q).then((result) => {
                    return getMetadataResult({
                      mediaCollection: result.results.map((it) =>
                        album(urlWithToken(apiKey), it)
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
                          id: "artists",
                          title: lang("artists"),
                          albumArtURI: iconArtURI(bonobUrl, "artists").href(),
                          itemType: "container",
                        },
                        {
                          id: "albums",
                          title: lang("albums"),
                          albumArtURI: iconArtURI(bonobUrl, "albums").href(),
                          itemType: "albumList",
                        },
                        {
                          id: "randomAlbums",
                          title: lang("random"),
                          albumArtURI: iconArtURI(bonobUrl, "random").href(),
                          itemType: "albumList",
                        },
                        {
                          id: "favouriteAlbums",
                          title: lang("favourites"),
                          albumArtURI: iconArtURI(bonobUrl, "heart").href(),
                          itemType: "albumList",
                        },
                        {
                          id: "starredAlbums",
                          title: lang("topRated"),
                          albumArtURI: iconArtURI(bonobUrl, "star").href(),
                          itemType: "albumList",
                        },
                        {
                          id: "playlists",
                          title: lang("playlists"),
                          albumArtURI: iconArtURI(bonobUrl, "playlists").href(),
                          itemType: "playlist",
                          attributes: {
                            readOnly: false,
                            userContent: true,
                            renameable: false,
                          },
                        },
                        {
                          id: "genres",
                          title: lang("genres"),
                          albumArtURI: iconArtURI(bonobUrl, "genres").href(),
                          itemType: "container",
                        },
                        {
                          id: "years",
                          title: lang("years"),
                          albumArtURI: iconArtURI(bonobUrl, "music").href(),
                          itemType: "container",
                        },
                        {
                          id: "recentlyAdded",
                          title: lang("recentlyAdded"),
                          albumArtURI: iconArtURI(
                            bonobUrl,
                            "recentlyAdded"
                          ).href(),
                          itemType: "albumList",
                        },
                        {
                          id: "recentlyPlayed",
                          title: lang("recentlyPlayed"),
                          albumArtURI: iconArtURI(
                            bonobUrl,
                            "recentlyPlayed"
                          ).href(),
                          itemType: "albumList",
                        },
                        {
                          id: "mostPlayed",
                          title: lang("mostPlayed"),
                          albumArtURI: iconArtURI(
                            bonobUrl,
                            "mostPlayed"
                          ).href(),
                          itemType: "albumList",
                        },
                        {
                          id: "internetRadio",
                          title: lang("internetRadio"),
                          albumArtURI: iconArtURI(bonobUrl, "radio").href(),
                          itemType: "stream",
                        },
                      ],
                    });
                  case "search":
                    return getMetadataResult({
                      mediaCollection: [
                        {
                          itemType: "search",
                          id: "artists",
                          title: lang("artists"),
                        },
                        {
                          itemType: "search",
                          id: "albums",
                          title: lang("albums"),
                        },
                        {
                          itemType: "search",
                          id: "tracks",
                          title: lang("tracks"),
                        },
                      ],
                    });
                  case "artists":
                    return musicLibrary.artists(paging).then((result) => {
                      return getMetadataResult({
                        mediaCollection: result.results.map((it) =>
                          artist(urlWithToken(apiKey), it)
                        ),
                        index: paging._index,
                        total: result.total,
                      });
                    });
                  case "albums": {
                    return albums({
                      type: "alphabeticalByName",
                      ...paging,
                    });
                  }
                  case "genre":
                    return albums({
                      type: "byGenre",
                      genre: typeId,
                      ...paging,
                    });
                  case "year":
                    return albums({
                      type: "byYear",
                      fromYear: typeId,
                      toYear: typeId,
                      ...paging,
                    });
                  case "randomAlbums":
                    return albums({
                      type: "random",
                      ...paging,
                    });
                  case "favouriteAlbums":
                    return albums({
                      type: "favourited",
                      ...paging,
                    });
                  case "starredAlbums":
                    return albums({
                      type: "starred",
                      ...paging,
                    });
                  case "recentlyAdded":
                    return albums({
                      type: "recentlyAdded",
                      ...paging,
                    });
                  case "recentlyPlayed":
                    return albums({
                      type: "recentlyPlayed",
                      ...paging,
                    });
                  case "mostPlayed":
                    return albums({
                      type: "mostPlayed",
                      ...paging,
                    });
                  case "internetRadio":
                    return musicLibrary
                      .radioStations()
                      .then(slice2(paging))
                      .then(([page, total]) =>
                        getMetadataResult({
                          mediaMetadata: page.map((it) =>
                            internetRadioStation(it)
                          ),
                          index: paging._index,
                          total,
                        })
                      );
                  case "years":
                    return musicLibrary
                      .years()
                      .then(slice2(paging))
                      .then(([page, total]) =>
                        getMetadataResult({
                          mediaCollection: page.map((it) =>
                            year(bonobUrl, it)
                          ),
                          index: paging._index,
                          total,
                        })
                      );
                  case "genres":
                    return musicLibrary
                      .genres()
                      .then(slice2(paging))
                      .then(([page, total]) =>
                        getMetadataResult({
                          mediaCollection: page.map((it) =>
                            genre(bonobUrl, it)
                          ),
                          index: paging._index,
                          total,
                        })
                      );
                  case "playlists":
                    return musicLibrary
                      .playlists()
                      .then((it) =>
                        Promise.all(
                          it.map((playlist) => {
                            // todo: whats this odd copy all about, can we just delete it?
                            return {
                              id: playlist.id,
                              name: playlist.name,
                              coverArt: playlist.coverArt,
                              // todo: are these every important?
                              entries: [],
                            };
                          })
                        )
                      )
                      .then(slice2(paging))
                      .then(([page, total]) => {
                        return getMetadataResult({
                          mediaCollection: page.map((it) =>
                            playlist(urlWithToken(apiKey), it)
                          ),
                          index: paging._index,
                          total,
                        });
                      });
                  case "playlist":
                    return musicLibrary
                      .playlist(typeId!)
                      .then((playlist) => playlist.entries)
                      .then(slice2(paging))
                      .then(([page, total]) => {
                        return getMetadataResult({
                          mediaMetadata: page.map((it) =>
                            track(urlWithToken(apiKey), it)
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
                      .then(([page, total]) =>
                        getMetadataResult({
                          mediaCollection: page.map((it) =>
                            album(urlWithToken(apiKey), it)
                          ),
                          index: paging._index,
                          total,
                        })
                      );
                  case "relatedArtists":
                    return musicLibrary
                      .artist(typeId!)
                      .then((artist) => artist.similarArtists)
                      .then((similarArtists) =>
                        similarArtists.filter((it) => it.inLibrary)
                      )
                      .then(slice2(paging))
                      .then(([page, total]) => {
                        return getMetadataResult({
                          mediaCollection: page.map((it) =>
                            artist(urlWithToken(apiKey), it)
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
                            track(urlWithToken(apiKey), it)
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
            soapyHeaders: SoapyHeaders
          ) =>
            login(soapyHeaders?.credentials)
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
            soapyHeaders: SoapyHeaders
          ) =>
            login(soapyHeaders?.credentials)
              .then(({ musicLibrary }) => musicLibrary.deletePlaylist(id))
              .then((_) => ({ deleteContainerResult: {} })),
          addToContainer: async (
            { id, parentId }: { id: string; parentId: string },
            _,
            soapyHeaders: SoapyHeaders
          ) =>
            login(soapyHeaders?.credentials)
              .then(splitId(id))
              .then(({ musicLibrary, typeId }) =>
                musicLibrary.addToPlaylist(parentId.split(":")[1]!, typeId)
              )
              .then((_) => ({ addToContainerResult: { updateId: "" } })),
          removeFromContainer: async (
            { id, indices }: { id: string; indices: string },
            _,
            soapyHeaders: SoapyHeaders
          ) =>
            login(soapyHeaders?.credentials)
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
          rateItem: async (
            { id, rating }: { id: string; rating: number },
            _,
            soapyHeaders: SoapyHeaders
          ) =>
            login(soapyHeaders?.credentials)
              .then(splitId(id))
              .then(({ musicLibrary, typeId }) =>
                musicLibrary.rate(typeId, ratingFromInt(Math.abs(rating)))
              )
              .then((_) => ({ rateItemResult: { shouldSkip: false } })),

          setPlayedSeconds: async (
            { id, seconds }: { id: string; seconds: string },
            _,
            soapyHeaders: SoapyHeaders
          ) =>
            login(soapyHeaders?.credentials)
              .then(splitId(id))
              .then(({ musicLibrary, type, typeId }) => {
                switch (type) {
                  case "track":
                    return musicLibrary.track(typeId).then(({ duration }) => {
                      if (
                        (duration < 30 && +seconds >= 10) ||
                        (duration >= 30 && +seconds >= 30)
                      ) {
                        return musicLibrary.scrobble(typeId);
                      } else {
                        return Promise.resolve(true);
                      }
                    });
                  default:
                    logger.info("Unsupported scrobble", { id, seconds });
                    return Promise.resolve(true);
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
      // routing all soap info messages to debug so less noisy
      case "info":
        logger.debug({ level: "info", data });
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
