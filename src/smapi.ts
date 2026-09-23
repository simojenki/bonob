import crypto from "crypto";
import { Express, Request } from "express";
import { listen } from "soap";
import { readFileSync } from "fs";
import path from "path";
import { option as O, either as E, taskEither as TE, task as T } from "fp-ts";
import { pipe } from "fp-ts/lib/function";

import logger from "./logger";
import { SonosWSDL, SONOS_SERVICES_NAMESPACE } from "./sonos_wsdl";

import { LinkCodes } from "./link_codes";
import {
  AlbumQuery,
  AlbumQueryType,
  AlbumSummary,
  ArtistSummary,
  Genre,
  Year,
  MusicService,
  RadioStation,
  Rating,
  slice2,
  Sortable,
  Track,
  PlaylistSummary
} from "./music_library";
import { APITokens } from "./api_tokens";
import { Clock } from "./clock";
import { BonobUrl } from "./url_builder";
import { asLANGs, I8N } from "./i8n";
import { ICON, iconForGenre } from "./icon";
import _ from "underscore";
import { Art, formatCoverArt } from "./art";
import {
  isExpiredTokenError,
  MissingLoginTokenError,
  SmapiAuthTokens,
  SMAPI_FAULT_LOGIN_UNAUTHORIZED,
  ToSmapiFault,
} from "./smapi_auth";
import { IncomingHttpHeaders } from "http";

// https://docs.sonos.com/docs/error-handling
export const SMAPI_FAULT_ITEM_NOT_FOUND = {
  Fault: {
    faultcode: "Client.ItemNotFound",
    faultstring:
      "The requested item does not exist.",
  },
};

// https://docs.sonos.com/docs/error-handling - "the default error for most services,
// thrown for any error without a specific alternate exception defined". Used as a
// catch-all for handler errors that aren't already a deliberate SMAPI fault, so Sonos
// gets a well-formed fault instead of whatever the soap library does with a raw
// exception (a malformed hybrid SOAP 1.1/1.2 fault that leaks the error message).
export const SMAPI_FAULT_SERVICE_UNKNOWN_ERROR = {
  Fault: {
    faultcode: "Server.ServiceUnknownError",
    faultstring: "An unknown error occurred.",
  },
};

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
  "1000",
  "1242",
  "1500",
];

export const ALBUMS_SORT_TYPE: AlbumQueryType = "alphabeticalByName";

export const WSDL_FILE = path.resolve(
  __dirname,
  "Sonoswsdl-1.19.6-20231024.wsdl"
);
export const sonosWSDL = new SonosWSDL(readFileSync(WSDL_FILE, 'utf8'));


export type LoginToken = {
    token: string;
    householdId: string;
}

export type Credentials = {
  loginToken: LoginToken;
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
    // Required by Sonos S2: the WSDL declares privateKey in deviceAuthTokenResult.
    // Omitting it makes the S2 app reject the token and abort "Add Service".
    privateKey: string;
    // todo: appears this thing can be optional
    userInfo: {
      userIdHashCode: string;
      nickname: string;
    };
  };
};

// todo: whats going on in here?
export const ratingAsInt = (rating: Rating): number =>
  rating.stars * 10 + (rating.love ? 1 : 0) + 100;

// todo: whats going on in here?
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
      index: 0,
      count,
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
      index: 0,
      count,
      total: count,
      ...result,
    },
  };
}

class SonosSoap {
  linkCodes: LinkCodes;
  bonobUrl: BonobUrl;
  smapiAuthTokens: SmapiAuthTokens;
  clock: Clock;

  constructor(
    bonobUrl: BonobUrl,
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
              .asURLBuilder()
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

  reportAccountAction = (_: { type: string }) => ({})

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
          // Sonos sentinel meaning "I don't issue refreshable private keys".
          // bonob doesn't implement private-key refresh, so this is the correct
          // value (a random/opaque key here makes S2 abort the add).
          privateKey: "alwaysReauthenticate",
          // userIdHashCode must precede nickname to match the WSDL xs:sequence.
          userInfo: {
            userIdHashCode: crypto
              .createHash("sha256")
              .update(association.userId)
              .digest("hex"),
            nickname: association.nickname,
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
          attributes: { "xmlns:ns": SONOS_SERVICES_NAMESPACE },
          detail: {
            "ns:SonosError": "5",
            "ns:ExceptionInfo": "NOT_LINKED_RETRY",
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

// const collection = () => ({
//   itemType: "collection",
//   canScroll: false,
//   canPlay: false,
//   canEnumerate: true,
//   canAddToFavorites: true,
//   containsFavorite: false,
//   canSkip: true, 
// })

const genre = (bonobUrl: BonobUrl, genre: Genre) => ({
  id: `genre:${genre.id}`,
  itemType: "albumList",
  title: genre.name,
  albumArtURI: iconArtURI(bonobUrl, iconForGenre(genre.name)),
});

const yyyy = (bonobUrl: BonobUrl, year: Year) => ({
  id: `year:${year.year}`,
  itemType: "albumList",
  title: year.year,
  // todo: maybe year.year should be nullable?
  albumArtURI: year.year !== "?" ? iconArtURI(bonobUrl, "yyyy", year.year) : iconArtURI(bonobUrl, "music"),
});

export const shouldScrobble = (track: Track, playbackTime: number) => (
  (track.duration < 30 && playbackTime >= 10) ||
  (track.duration >= 30 && playbackTime >= 30))

// canPlay: true,
// canEnumerate: true,
// canResume: false,
// attributes: {
//   readOnly: false,
//   userContent: true,
//   renameable: true,
// },


const playlist = (bonobUrl: BonobUrl, authToken: string, playlist: PlaylistSummary) => ({
  id: `playlist:${playlist.id}`,
  itemType: "playlist",
  title: playlist.name,
  canPlay: true,
  albumArtURI: coverArtURI(bonobUrl, authToken, playlist),
  attributes: {
    userContent: true,
  },
});

export const coverArtURI = (
  bonobUrl: BonobUrl,
  authToken: string,
  { coverArt }: { readonly coverArt?: Art | undefined }
): string =>
  pipe(
    coverArt,
    O.fromNullable,
    O.map((it) =>
      bonobUrl.path(`/art/${encodeURIComponent(formatCoverArt(authToken, it))}/size/180`).href
    ),
    O.getOrElseW(() => iconArtURI(bonobUrl, "vinyl"))
  );

export const iconArtURI = (bonobUrl: BonobUrl, icon: ICON, text: string | undefined = undefined): string =>
  bonobUrl.path(`/icon/${text == undefined ? icon : `${icon}:${text}`}/size/legacy`).href;

export const sonosifyMimeType = (mimeType: string) =>
  mimeType == "audio/x-flac" ? "audio/flac" : mimeType;

export const album = (bonobUrl: BonobUrl, authToken: string, album: AlbumSummary) => ({
  id: `album:${album.id}`,
  itemType: "album",
  title: album.name,
  artist: album.artistName,
  artistId: `artist:${album.artistId}`,
  canPlay: true,
  albumArtURI: coverArtURI(bonobUrl, authToken, album),
  // defaults
  // canScroll: false,
  // canEnumerate: true,
  // canAddToFavorites: true
});

export const internetRadioStation = (station: RadioStation) => ({
  id: `internetRadioStation:${station.id}`,
  itemType: "stream",
  title: station.name,
  mimeType: "audio/mpeg",
  // streamMetadata is required by the mediaMetadata schema (a choice with trackMetadata),
  // but all of its own fields are optional, so an empty object satisfies it.
  streamMetadata: {},
});

export const track = (bonobUrl: BonobUrl, authToken: string, track: Track) => ({
  id: `track:${track.id}`,
  itemType: "track",
  title: track.name,
  mimeType: sonosifyMimeType(track.encoding.mimeType),

  trackMetadata: {
    artistId: track.artist.id ? `artist:${track.artist.id}` : undefined,
    artist: track.artist.name,
    albumArtistId: track.artist.id ? `artist:${track.artist.id}` : undefined,
    albumArtist: track.artist.name,
    albumId: `album:${track.album.id}`,
    album: track.album.name,
    genreId: track.album.genre?.id,
    genre: track.album.genre?.name,
    duration: track.duration,
    albumArtURI: coverArtURI(bonobUrl, authToken, track),
    trackNumber: track.number,
  },
  dynamic: {
    property: [{ name: "rating", value: `${ratingAsInt(track.rating)}` }],
  },
});

export const artist = (bonobUrl: BonobUrl, authToken: string, artist: ArtistSummary) => ({
  id: `artist:${artist.id}`,
  itemType: "artist",
  title: artist.name,
  artistId: artist.id,
  albumArtURI: coverArtURI(bonobUrl, authToken, { coverArt: artist.image }),
});

// assumes things is already sorted by _sortBy
export const scrollIndicesFrom = (things: Readonly<Sortable[]>) => {
  const indicies: Record<string, number | undefined> = {
    "A": undefined, "B": undefined, "C": undefined, "D": undefined,
    "E": undefined, "F": undefined, "G": undefined, "H": undefined,
    "I": undefined, "J": undefined, "K": undefined, "L": undefined,
    "M": undefined, "N": undefined, "O": undefined, "P": undefined,
    "Q": undefined, "R": undefined, "S": undefined, "T": undefined,
    "U": undefined, "V": undefined, "W": undefined, "X": undefined,
    "Y": undefined, "Z": undefined,
  };
  const upperNames = things.map(thing => thing._sortBy.toUpperCase());
  for (let i = 0; i < upperNames.length; i++) {
    const char = upperNames[i]![0]!;
    if (Object.keys(indicies).includes(char) && indicies[char] == undefined) {
      indicies[char] = i;
    }
  }
  // eslint-disable-next-line functional/no-let
  let lastIndex = 0;
  // eslint-disable-next-line functional/prefer-readonly-type
  const result: string[] = [];
  Object.entries(indicies).forEach(([letter, index]) => {
    result.push(letter);
    if (index) { lastIndex = index; }
    result.push(`${lastIndex}`);
  });
  return result.join(",");
};

export const splitId = (id: string) => {
  const [type, typeId] = id.split(":")
  return {
    type: type!,
    typeId: typeId!
  }
}

export function withSplitId<T>(id: string) {
  return (t: T) => ({
    ...t,
    ...splitId(id)
  });
}

export type SoapyHeaders = {
  credentials?: {
    loginToken?: {
      // wsdl seems to imply that token is required, however in practice that doesnt seem to be true
      token?: string;
      key?: string;
      householdId: string;
    },
    deviceId?: string;
    deviceProvider?: string;
  };
};

type Auth = {
  serviceToken: string;
  apiKey: string;
};

function isAuth(thing: any): thing is Auth {
  return thing.serviceToken;
}

export function findLoginToken(
  soapHeaders: SoapyHeaders | undefined,
  httpRequestHeaders: IncomingHttpHeaders
): string | undefined {
  const soapToken = soapHeaders?.credentials?.loginToken?.token
  const httpRequestToken = httpRequestHeaders["authorization"]
  if(soapToken != undefined) return soapToken
  else if(httpRequestToken != undefined) return httpRequestToken.replace(/^Bearer /, "")
  else return undefined
}

function bindSmapiSoapServiceToExpress(
  app: Express,
  soapPath: string,
  bonobUrl: BonobUrl,
  linkCodes: LinkCodes,
  musicService: MusicService,
  apiKeys: APITokens,
  clock: Clock,
  i8n: I8N,
  smapiAuthTokens: SmapiAuthTokens
) {
  const sonosSoap = new SonosSoap(bonobUrl, linkCodes, smapiAuthTokens, clock);

  const auth = (loginToken?: string): E.Either<ToSmapiFault, Auth> => {
    const tokenFrom = E.fromNullable(new MissingLoginTokenError());
    return pipe(
      tokenFrom(loginToken),
      E.chain((token) =>
        pipe(
          smapiAuthTokens.verify({
            token
          }),
          E.map((serviceToken) => ({
            serviceToken
          }))
        )
      ),
      E.map(({ serviceToken }) => ({
        serviceToken,
        apiKey: apiKeys.mint(serviceToken),
      }))
    );
  };

  const login = async (loginToken?: string) => {
    const authOrFail = pipe(
      auth(loginToken),
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
              attributes: { "xmlns:ns": SONOS_SERVICES_NAMESPACE },
              detail: {
                "ns:refreshAuthTokenResult": {
                  "ns:authToken": newToken.token,
                  "ns:privateKey": "nonsense",
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

  // Wraps every SMAPI handler so an error that isn't already a deliberate SMAPI fault (ie.
  // doesn't have a .Fault property) becomes SMAPI_FAULT_SERVICE_UNKNOWN_ERROR instead of
  // propagating as a raw exception - the soap library turns those into a malformed hybrid
  // SOAP 1.1/1.2 fault that leaks the error message. Centralized here so individual
  // handlers don't need their own try/catch for unexpected failures.
  function withUnhandledErrorFault<T extends Record<string, (...args: any[]) => any>>(
    handlers: T
  ): T {
    return Object.fromEntries(
      Object.entries(handlers).map(([name, handler]) => [
        name,
        async (...args: any[]) => {
          try {
            return await handler(...args);
          } catch (e: any) {
            if (e && typeof e === "object" && "Fault" in e) throw e;
            logger.error(`Unhandled error in SMAPI ${name}`, { error: e });
            throw SMAPI_FAULT_SERVICE_UNKNOWN_ERROR;
          }
        },
      ])
    ) as T;
  }

  const soapyService = listen(
    app,
    soapPath,
    {
      Sonos: {
        SonosSoap: withUnhandledErrorFault({
          getAppLink: () => sonosSoap.getAppLink(),
          reportAccountAction: ({ type } : { type: string }) =>
            sonosSoap.reportAccountAction({ type }),
          getDeviceAuthToken: ({ linkCode }: { linkCode: string }) =>
            sonosSoap.getDeviceAuthToken({ linkCode }),
          getLastUpdate: () => ({
            getLastUpdateResult: {
              catalog: clock.now().unix(),
              favorites: clock.now().unix(),
              pollInterval: 60,
              autoRefreshEnabled: true,
            },
          }),
          refreshAuthToken: async (
            _, 
            _2, 
            soapyHeaders: SoapyHeaders,
            { headers }: Pick<Request, "headers">
          ) => {       
            const serviceToken = pipe(
              auth(findLoginToken(soapyHeaders, headers)),
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
                  privateKey: "nonsense",
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
            soapyHeaders: SoapyHeaders,
            { headers }: Pick<Request, "headers">
          ) => 
            login(findLoginToken(soapyHeaders, headers))
              .then(withSplitId(id))
              .then(({ musicLibrary, apiKey, type, typeId }) => {
                switch (type) {
                  case "internetRadioStation":
                    return musicLibrary.radioStation(typeId).then((it) => ({
                      getMediaURIResult: it.url,
                    }));
                  case "track":
                    return {
                      getMediaURIResult: bonobUrl
                        .path(`/stream/${type}/${typeId}`)
                        .href,
                      httpHeaders: [
                        {
                          httpHeader: {
                            header: "authorization",
                            value: apiKey,
                          },
                        },
                      ],
                    };
                  default:
                    logger.info(`Sonos asked for an unsupported getMediaURI: ${type}:${typeId}`);
                    return {
                      getMediaURIResult: iconArtURI(bonobUrl, "error", "?"),
                    }
                  }
              }),
          getMediaMetadata: async (
            { id }: { id: string },
            _,
            soapyHeaders: SoapyHeaders,
            { headers }: Pick<Request, "headers">
          ) =>
            login(findLoginToken(soapyHeaders, headers))
              .then(withSplitId(id))
              .then(async ({ musicLibrary, apiKey, type, typeId }) => {
                switch (type) {
                  case "internetRadioStation":
                    return musicLibrary.radioStation(typeId).then((it) => ({
                      getMediaMetadataResult: internetRadioStation(it),
                    }));
                  case "track":
                    return musicLibrary.track(typeId!).then((it) => ({
                      getMediaMetadataResult: track(bonobUrl, apiKey, it),
                    }));
                  default:
                    logger.info(`Sonos asked for an unsupported getMediaMetadata: ${type}:${typeId}`);
                    throw SMAPI_FAULT_ITEM_NOT_FOUND;
                }
              }),
              // todo: need to support index and count on here.
          search: async (
            { id, term }: { id: string; term: string },
            _,
            soapyHeaders: SoapyHeaders,
            { headers }: Pick<Request, "headers">
          ) =>
            login(findLoginToken(soapyHeaders, headers))
              .then(withSplitId(id))
              .then(async ({ musicLibrary, apiKey }) => {
                switch (id) {
                  case "albums":
                    return musicLibrary.searchAlbums(term).then((it) =>
                      searchResult({
                        count: it.length,
                        mediaCollection: it.map((albumSummary) =>
                          album(bonobUrl, apiKey, albumSummary)
                        ),
                      })
                    );
                  case "artists":
                    return musicLibrary.searchArtists(term).then((it) =>
                      searchResult({
                        count: it.length,
                        mediaCollection: it.map((artistSummary) =>
                          artist(bonobUrl, apiKey, artistSummary)
                        ),
                      })
                    );
                  case "tracks":
                    return musicLibrary.searchTracks(term).then((it) =>
                      searchResult({
                        count: it.length,
                        mediaCollection: it.map((aTrack) =>
                          album(bonobUrl, apiKey, aTrack.album)
                        ),
                      })
                    );
                  default:
                    logger.info(`Sonos asked for an unsupported search of: ${id}, term=${term}`);
                    return searchResult({
                      count: 0,
                      mediaCollection: [],
                    })
                }
              }),
          getExtendedMetadata: async (
            { id }: { id: string },
            _,
            soapyHeaders: SoapyHeaders,
            { headers }: Pick<Request, "headers">
          ) =>
            login(findLoginToken(soapyHeaders, headers))
              .then(withSplitId(id))
              .then(async ({ musicLibrary, apiKey, type, typeId }) => {
                switch (type) {
                  case "artist":
                    return musicLibrary
                      .artist(typeId)
                      .then((it) => ({
                        getExtendedMetadataResult: {
                          mediaCollection: artist(bonobUrl, apiKey, it),
                          relatedBrowse: it
                            .similarArtists
                            .filter((it) => it.inLibrary)
                            .length > 0 
                            ? ([{ id: `relatedArtists:${it.id}`, type: "RELATED_ARTISTS" }]) 
                            : []
                        },
                      }));
                  case "track":
                    return musicLibrary
                      .track(typeId)
                      .then((it) => ({
                        getExtendedMetadataResult: {
                          mediaMetadata: track(bonobUrl, apiKey, it),
                        },
                      }));
                  case "album":
                    return musicLibrary.album(typeId).then((it) => ({
                      getExtendedMetadataResult: {
                        // todo: can these go in the album function?  Also used in search....
                        mediaCollection: {
                          attributes: {
                            readOnly: true,
                            userContent: false,
                            renameable: false,
                          },
                          ...album(bonobUrl, apiKey, it),
                        },
                      },
                    }));
                  case "playlist":
                    return musicLibrary
                      .playlist(typeId!)
                      .then(it => ({
                        getExtendedMetadataResult: {
                          mediaCollection: playlist(bonobUrl, apiKey, it),
                        },
                      }));                    
                  default:
                    logger.info(`Sonos requested extended meta data for currently unsupported type=${type}, typeId=${typeId}`)
                    throw SMAPI_FAULT_ITEM_NOT_FOUND;
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
          ) => {
            return login(findLoginToken(soapyHeaders, headers))
              .then(withSplitId(id))
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
                        album(bonobUrl, apiKey, it)
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
                          itemType: "container",
                          title: lang("artists"),
                          canScroll: true,
                          albumArtURI: iconArtURI(bonobUrl, "artists"),
                        },
                        {
                          id: "albums",
                          itemType: "albumList",
                          title: lang("albums"),
                          canScroll: true,
                          albumArtURI: iconArtURI(bonobUrl, "albums"),
                        },
                        {
                          id: "randomAlbums",
                          itemType: "albumList",
                          title: lang("random"),
                          albumArtURI: iconArtURI(bonobUrl, "random"),
                        },
                        {
                          id: "favouriteAlbums",
                          itemType: "albumList",
                          title: lang("favourites"),
                          albumArtURI: iconArtURI(bonobUrl, "heart"),
                        },
                        {
                          id: "starredAlbums",
                          itemType: "albumList",
                          title: lang("topRated"),
                          albumArtURI: iconArtURI(bonobUrl, "star"),
                        },
                        {
                          id: "playlists",
                          itemType: "collection",
                          title: lang("playlists"),
                          albumArtURI: iconArtURI(bonobUrl, "playlists"),
                          attributes: {
                            userContent: true,
                          },
                        },
                        {
                          id: "genres",
                          itemType: "container",
                          title: lang("genres"),
                          albumArtURI: iconArtURI(bonobUrl, "genres"),
                        },
                        {
                          id: "years",
                          itemType: "container",
                          title: lang("years"),
                          albumArtURI: iconArtURI(bonobUrl, "music"),
                        },
                        {
                          id: "recentlyAdded",
                          itemType: "albumList",
                          title: lang("recentlyAdded"),
                          albumArtURI: iconArtURI(
                            bonobUrl,
                            "recentlyAdded"
                          ),
                        },
                        {
                          id: "recentlyPlayed",
                          itemType: "albumList",
                          title: lang("recentlyPlayed"),
                          albumArtURI: iconArtURI(
                            bonobUrl,
                            "recentlyPlayed"
                          ),
                        },
                        {
                          id: "mostPlayed",
                          itemType: "albumList",
                          title: lang("mostPlayed"),
                          albumArtURI: iconArtURI(
                            bonobUrl,
                            "mostPlayed"
                          ),
                        },
                        {
                          id: "internetRadio",
                          itemType: "container",
                          title: lang("internetRadio"),
                          albumArtURI: iconArtURI(bonobUrl, "radio"),
                        },
                      ],
                    });
                  case "search":
                    return getMetadataResult({
                      mediaCollection: [
                        {
                          id: "artists",
                          itemType: "search",
                          title: lang("artists"),
                        },
                        {
                          id: "albums",
                          itemType: "search",
                          title: lang("albums"),
                        },
                        {
                          id: "tracks",
                          itemType: "search",
                          title: lang("tracks"),
                        },
                      ],
                    });
                  case "artists":
                    return musicLibrary.artists(paging).then((result) => {
                      return getMetadataResult({
                        mediaCollection: result.results.map((it) =>
                          artist(bonobUrl, apiKey, it)
                        ),
                        index: paging._index,
                        total: result.total,
                      });
                    });
                  case "albums": {
                    return albums({
                      type: ALBUMS_SORT_TYPE,
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
                          mediaCollection: page.map((it) => yyyy(bonobUrl, it)),
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
                          mediaCollection: page.map((it) => genre(bonobUrl, it)),
                          index: paging._index,
                          total,
                        })
                      );
                  case "playlists":
                    return musicLibrary
                      .playlists()
                      .then(slice2(paging))
                      .then(([page, total]) => {
                        return getMetadataResult({
                          mediaCollection: page.map((it) => playlist(bonobUrl, apiKey, it)),
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
                            track(bonobUrl, apiKey, it)
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
                            album(bonobUrl, apiKey, it)
                          ),
                          index: paging._index,
                          total,
                        })
                      );
                  case "relatedArtists":
                    return musicLibrary
                      .artist(typeId!)
                      .then((artist) => artist.similarArtists.filter((it) => it.inLibrary))
                      .then(slice2(paging))
                      .then(([page, total]) => {
                        return getMetadataResult({
                          mediaCollection: page.map((it) =>
                            artist(bonobUrl, apiKey, it)
                          ),
                          index: paging._index,
                          total,
                        });
                      });
                  case "album":
                    return musicLibrary
                      .album(typeId!)
                      .then(it => it.tracks)
                      .then(slice2(paging))
                      .then(([page, total]) => {
                        return getMetadataResult({
                          mediaMetadata: page.map((it) =>
                            track(bonobUrl, apiKey, it)
                          ),
                          index: paging._index,
                          total,
                        });
                      });
                  default:
                    logger.info(`Sonos asked for an unsupported getMetadata: ${type}:${typeId}`);
                    return getMetadataResult({
                      mediaMetadata: [],
                      index: paging._index,
                      total: 0,
                    });
                }
              })
          },
          getScrollIndices: async (
            { id }: { id: string },
            _: unknown,
            soapyHeaders: SoapyHeaders,
            { headers }: Pick<Request, "headers">
          ) => {
            switch (id) {
              case "artists": {
                return login(findLoginToken(soapyHeaders, headers))
                  .then(({ musicLibrary }) => musicLibrary.artists({ _index: 0, _count: undefined }))
                  .then((artists) => ({
                    getScrollIndicesResult: scrollIndicesFrom(artists.results)
                  }));
              }
              case "albums": {
                return login(findLoginToken(soapyHeaders, headers))
                  .then(({ musicLibrary }) => musicLibrary.albums({ type: ALBUMS_SORT_TYPE, _index: 0, _count: undefined }))
                  .then((albums) => ({
                    getScrollIndicesResult: scrollIndicesFrom(albums.results)
                  }));
              }
              default:
                throw `Unsupported getScrollIndices id=${id}`;
            }
          },
          // todo: containerType and parentId are ignored - we always create a
          // top-level playlist regardless of what type/parent was requested.
          createContainer: async (
            { title, seedId }: { title: string; seedId: string | undefined },
            _,
            soapyHeaders: SoapyHeaders,
            { headers }: Pick<Request, "headers">
          ) =>
            login(findLoginToken(soapyHeaders, headers))
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
            soapyHeaders: SoapyHeaders,
            { headers }: Pick<Request, "headers">
          ) =>
            login(findLoginToken(soapyHeaders, headers))
              .then(({ musicLibrary }) => musicLibrary.deletePlaylist(id))
              .then((_) => ({ deleteContainerResult: {} })),
          // todo: index and updateId are ignored - we always append, and never check/return
          // a real updateId, so we can't detect a stale container the way Sonos expects.
          addToContainer: async (
            { id, parentId }: { id: string; parentId: string },
            _,
            soapyHeaders: SoapyHeaders,
            { headers }: Pick<Request, "headers">
          ) =>
            login(findLoginToken(soapyHeaders, headers))
              .then(withSplitId(id))
              .then(({ musicLibrary, typeId }) =>
                musicLibrary.addToPlaylist(parentId.split(":")[1]!, typeId)
              )
              .then((_) => ({ addToContainerResult: { updateId: "" } })),
          removeFromContainer: async (
            { id, indices }: { id: string; indices: string },
            _,
            soapyHeaders: SoapyHeaders,
            { headers }: Pick<Request, "headers">
          ) =>
            login(findLoginToken(soapyHeaders, headers))
              .then(withSplitId(id))
              .then((it) => ({
                ...it,
                indices: indices.split(",").map((it) => +it),
              }))
              .then(({ musicLibrary, typeId, indices }) => {
                if (id == "playlists") {
                  musicLibrary.playlists().then((it) => {
                    indices.forEach((i) => {
                      musicLibrary.deletePlaylist(it[i]!.id);
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
            soapyHeaders: SoapyHeaders,
            { headers }: Pick<Request, "headers">
          ) =>
            login(findLoginToken(soapyHeaders, headers))
              .then(withSplitId(id))
              .then(({ musicLibrary, typeId }) =>
                musicLibrary.rate(typeId, ratingFromInt(Math.abs(rating)))
              )
              .then((_) => ({ rateItemResult: { shouldSkip: false } })),

          setPlayedSeconds: async (
            { id, seconds }: { id: string; seconds: string },
            _,
            soapyHeaders: SoapyHeaders,
            { headers }: Pick<Request, "headers">
          ) =>
            login(findLoginToken(soapyHeaders, headers))
              .then(withSplitId(id))
              .then(({ musicLibrary, type, typeId }) => {
                switch (type) {
                  case "track":
                    return musicLibrary.track(typeId).then(track => {
                      if (shouldScrobble(track, +seconds)) {
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
              .then((_) => ({})),
        }),
      },
    },
    sonosWSDL.wsdl,
    (err: any, res: any) => {
      if (err) {
        logger.error("BOOOOM", { err, res });
      }
    }
  );

  soapyService.log = (type, data) => {
    const message = JSON.stringify(data);
    switch (type) {
      // routing all soap info messages to debug so less noisy
      case "info":
        logger.debug(message);
        break;
      case "warn":
        logger.warn(message);
        break;
      case "error":
        logger.error(message);
        break;
      default:
    }
  };
}

export default bindSmapiSoapServiceToExpress;
