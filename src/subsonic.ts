import { option as O, taskEither as TE } from "fp-ts";
import * as A from "fp-ts/Array";
import { ordString } from "fp-ts/lib/Ord";
import { pipe } from "fp-ts/lib/function";
import { Md5 } from "ts-md5";
import {
  Credentials,
  MusicService,
  Album,
  Result,
  slice2,
  AlbumQuery,
  ArtistQuery,
  MusicLibrary,
  AlbumSummary,
  Genre,
  Track,
  CoverArt,
  Rating,
  AlbumQueryType,
  Artist,
  AuthFailure,
  PlaylistSummary,
  Encoding,
} from "./music_service";
import sharp from "sharp";
import _ from "underscore";
import fse from "fs-extra";
import path from "path";

import axios, { AxiosRequestConfig } from "axios";
import randomstring from "randomstring";
import { b64Encode, b64Decode } from "./b64";
import logger from "./logger";
import { assertSystem, BUrn } from "./burn";
import { artist } from "./smapi";
import { URLBuilder } from "./url_builder";

export const BROWSER_HEADERS = {
  accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "accept-encoding": "gzip, deflate, br",
  "accept-language": "en-GB,en;q=0.5",
  "upgrade-insecure-requests": "1",
  "user-agent":
    "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:86.0) Gecko/20100101 Firefox/86.0",
};

export const t = (password: string, s: string) =>
  Md5.hashStr(`${password}${s}`);

export const t_and_s = (password: string) => {
  const s = randomstring.generate();
  return {
    t: t(password, s),
    s,
  };
};

export const DODGY_IMAGE_NAME = "2a96cbd8b46e442fc41c2b86b821562f.png";

export const isValidImage = (url: string | undefined) =>
  url != undefined && !url.endsWith(DODGY_IMAGE_NAME);

type SubsonicEnvelope = {
  "subsonic-response": SubsonicResponse;
};

type SubsonicResponse = {
  status: string;
};

type album = {
  id: string;
  name: string;
  artist: string | undefined;
  artistId: string | undefined;
  coverArt: string | undefined;
  genre: string | undefined;
  year: string | undefined;
};

type artist = {
  id: string;
  name: string;
  albumCount: number;
  artistImageUrl: string | undefined;
};

type GetArtistsResponse = SubsonicResponse & {
  artists: {
    index: {
      artist: artist[];
      name: string;
    }[];
  };
};

type GetAlbumListResponse = SubsonicResponse & {
  albumList2: {
    totalCount: number;
    album: album[];
  };
};

type genre = {
  songCount: number;
  albumCount: number;
  value: string;
};

type GetGenresResponse = SubsonicResponse & {
  genres: {
    genre: genre[];
  };
};

type SubsonicError = SubsonicResponse & {
  error: {
    code: string;
    message: string;
  };
};

export type images = {
  smallImageUrl: string | undefined;
  mediumImageUrl: string | undefined;
  largeImageUrl: string | undefined;
};

type artistInfo = images & {
  biography: string | undefined;
  musicBrainzId: string | undefined;
  lastFmUrl: string | undefined;
  similarArtist: artist[];
};

type ArtistSummary = IdName & {
  image: BUrn | undefined;
};

type GetArtistInfoResponse = SubsonicResponse & {
  artistInfo2: artistInfo;
};

type GetArtistResponse = SubsonicResponse & {
  artist: artist & {
    album: album[];
  };
};

export type song = {
  id: string;
  parent: string | undefined;
  title: string;
  album: string | undefined;
  albumId: string | undefined;
  artist: string | undefined;
  artistId: string | undefined;
  track: number | undefined;
  year: string | undefined;
  genre: string | undefined;
  coverArt: string | undefined;
  created: string | undefined;
  duration: number | undefined;
  bitRate: number | undefined;
  suffix: string | undefined;
  contentType: string;
  transcodedContentType: string | undefined;
  type: string | undefined;
  userRating: number | undefined;
  starred: string | undefined;
};

type GetAlbumResponse = {
  album: album & {
    song: song[];
  };
};

type playlist = {
  id: string;
  name: string;
  coverArt: string | undefined;
};

type GetPlaylistResponse = {
  // todo: isnt the type here a composite? playlistSummary && { entry: song[]; }
  playlist: {
    id: string;
    name: string;
    coverArt: string | undefined;
    entry: song[];
  };
};

type GetPlaylistsResponse = {
  playlists: { playlist: playlist[] };
};

type GetSimilarSongsResponse = {
  similarSongs2: { song: song[] };
};

type GetTopSongsResponse = {
  topSongs: { song: song[] };
};

type GetInternetRadioStationsResponse = {
  internetRadioStations: { internetRadioStation: { 
    id: string,
    name: string, 
    streamUrl: string, 
    homePageUrl?: string }[] 
  }
} 

type GetSongResponse = {
  song: song;
};

type GetStarredResponse = {
  starred2: {
    song: song[];
    album: album[];
  };
};

export type PingResponse = {
  status: string;
  version: string;
  type: string;
  serverVersion: string;
};

type Search3Response = SubsonicResponse & {
  searchResult3: {
    artist: artist[];
    album: album[];
    song: song[];
  };
};

export function isError(
  subsonicResponse: SubsonicResponse
): subsonicResponse is SubsonicError {
  return (subsonicResponse as SubsonicError).error !== undefined;
}

type IdName = {
  id: string;
  name: string;
};

const coverArtURN = (coverArt: string | undefined): BUrn | undefined =>
  pipe(
    coverArt,
    O.fromNullable,
    O.map((it: string) => ({ system: "subsonic", resource: `art:${it}` })),
    O.getOrElseW(() => undefined)
  );

export const artistImageURN = (
  spec: Partial<{
    artistId: string | undefined;
    artistImageURL: string | undefined;
  }>
): BUrn | undefined => {
  const deets = {
    artistId: undefined,
    artistImageURL: undefined,
    ...spec,
  };
  if (deets.artistImageURL && isValidImage(deets.artistImageURL)) {
    return {
      system: "external",
      resource: deets.artistImageURL,
    };
  } else if (artistIsInLibrary(deets.artistId)) {
    return {
      system: "subsonic",
      resource: `art:${deets.artistId!}`,
    };
  } else {
    return undefined;
  }
};

export const asTrack = (album: Album, song: song, customPlayers: CustomPlayers): Track => ({
  id: song.id,
  name: song.title,
  encoding: pipe(
    customPlayers.encodingFor({ mimeType: song.contentType }),
    O.getOrElse(() => ({ 
      player: DEFAULT_CLIENT_APPLICATION, 
      mimeType: song.transcodedContentType ? song.transcodedContentType : song.contentType
    }))
  ),
  duration: song.duration || 0,
  number: song.track || 0,
  genre: maybeAsGenre(song.genre),
  coverArt: coverArtURN(song.coverArt),
  album,
  artist: {
    id: song.artistId,
    name: song.artist ? song.artist : "?",
    image: song.artistId
      ? artistImageURN({ artistId: song.artistId })
      : undefined,
  },
  rating: {
    love: song.starred != undefined,
    stars:
      song.userRating && song.userRating <= 5 && song.userRating >= 0
        ? song.userRating
        : 0,
  },
});

const asAlbum = (album: album): Album => ({
  id: album.id,
  name: album.name,
  year: album.year,
  genre: maybeAsGenre(album.genre),
  artistId: album.artistId,
  artistName: album.artist,
  coverArt: coverArtURN(album.coverArt),
});

// coverArtURN
const asPlayListSummary = (playlist: playlist): PlaylistSummary => ({
  id: playlist.id,
  name: playlist.name,
  coverArt: coverArtURN(playlist.coverArt),
});

export const asGenre = (genreName: string) => ({
  id: b64Encode(genreName),
  name: genreName,
});

const maybeAsGenre = (genreName: string | undefined): Genre | undefined =>
  pipe(
    genreName,
    O.fromNullable,
    O.map(asGenre),
    O.getOrElseW(() => undefined)
  );

export const asYear = (year: string) => ({
  year: year,
});

export interface CustomPlayers {
  encodingFor({ mimeType }: { mimeType: string }): O.Option<Encoding>
}

export type CustomClient = {
  mimeType: string;
  transcodedMimeType: string;
};

export class TranscodingCustomPlayers implements CustomPlayers {
  transcodings: Map<string, string>;

  constructor(transcodings: Map<string, string>) {
    this.transcodings = transcodings;
  }

  static from(config: string): TranscodingCustomPlayers {
    const parts: [string, string][] = config
      .split(",")
      .map((it) => it.split(">"))
      .map((pair) => {
        if (pair.length == 1) return [pair[0]!, pair[0]!];
        else if (pair.length == 2) return [pair[0]!, pair[1]!];
        else throw new Error(`Invalid configuration item ${config}`);
      });
    return new TranscodingCustomPlayers(new Map(parts));
  }

  encodingFor = ({ mimeType }: { mimeType: string }): O.Option<Encoding> => pipe(
    this.transcodings.get(mimeType),
    O.fromNullable,
    O.map(transcodedMimeType => ({ 
      player:`${DEFAULT_CLIENT_APPLICATION}+${mimeType}`, 
      mimeType: transcodedMimeType
    }))
  )
}

export const NO_CUSTOM_PLAYERS: CustomPlayers = {
  encodingFor(_) {
    return O.none
  },
}

const DEFAULT_CLIENT_APPLICATION = "bonob";
const USER_AGENT = "bonob";

export const asURLSearchParams = (q: any) => {
  const urlSearchParams = new URLSearchParams();
  Object.keys(q).forEach((k) => {
    _.flatten([q[k]]).forEach((v) => {
      urlSearchParams.append(k, `${v}`);
    });
  });
  return urlSearchParams;
};

export type ImageFetcher = (url: string) => Promise<CoverArt | undefined>;

export const cachingImageFetcher =
  (cacheDir: string, delegate: ImageFetcher) =>
  async (url: string): Promise<CoverArt | undefined> => {
    const filename = path.join(cacheDir, `${Md5.hashStr(url)}.png`);
    return fse
      .readFile(filename)
      .then((data) => ({ contentType: "image/png", data }))
      .catch(() =>
        delegate(url).then((image) => {
          if (image) {
            return sharp(image.data)
              .png()
              .toBuffer()
              .then((png) => {
                return fse
                  .writeFile(filename, png)
                  .then(() => ({ contentType: "image/png", data: png }));
              });
          } else {
            return undefined;
          }
        })
      );
  };

export const axiosImageFetcher = (url: string): Promise<CoverArt | undefined> =>
  axios
    .get(url, {
      headers: BROWSER_HEADERS,
      responseType: "arraybuffer",
    })
    .then((res) => ({
      contentType: res.headers["content-type"],
      data: Buffer.from(res.data, "binary"),
    }))
    .catch(() => undefined);

const AlbumQueryTypeToSubsonicType: Record<AlbumQueryType, string> = {
  alphabeticalByArtist: "alphabeticalByArtist",
  alphabeticalByName: "alphabeticalByName",
  byGenre: "byGenre",
  byYear: "byYear",
  random: "random",
  recentlyPlayed: "recent",
  mostPlayed: "frequent",
  recentlyAdded: "newest",
  favourited: "starred",
  starred: "highest",
};

const artistIsInLibrary = (artistId: string | undefined) =>
  artistId != undefined && artistId != "-1";

type SubsonicCredentials = Credentials & {
  type: string;
  bearer: string | undefined;
};

export const asToken = (credentials: SubsonicCredentials) =>
  b64Encode(JSON.stringify(credentials));
export const parseToken = (token: string): SubsonicCredentials =>
  JSON.parse(b64Decode(token));

interface SubsonicMusicLibrary extends MusicLibrary {
  flavour(): string;
  bearerToken(
    credentials: Credentials
  ): TE.TaskEither<Error, string | undefined>;
}

export class Subsonic implements MusicService {
  url: URLBuilder;
  customPlayers: CustomPlayers;
  externalImageFetcher: ImageFetcher;

  constructor(
    url: URLBuilder,
    customPlayers: CustomPlayers = NO_CUSTOM_PLAYERS,
    externalImageFetcher: ImageFetcher = axiosImageFetcher
  ) {
    this.url = url;
    this.customPlayers = customPlayers;
    this.externalImageFetcher = externalImageFetcher;
  }

  get = async (
    { username, password }: Credentials,
    path: string,
    q: {} = {},
    config: AxiosRequestConfig | undefined = {}
  ) =>
    axios
      .get(this.url.append({ pathname: path }).href(), {
        params: asURLSearchParams({
          u: username,
          v: "1.16.1",
          c: DEFAULT_CLIENT_APPLICATION,
          ...t_and_s(password),
          ...q,
        }),
        headers: {
          "User-Agent": USER_AGENT,
        },
        ...config,
      })
      .catch((e) => {
        throw `Subsonic failed with: ${e}`;
      })
      .then((response) => {
        if (response.status != 200 && response.status != 206) {
          throw `Subsonic failed with a ${response.status || "no!"} status`;
        } else return response;
      });

  getJSON = async <T>(
    { username, password }: Credentials,
    path: string,
    q: {} = {}
  ): Promise<T> =>
    this.get({ username, password }, path, { f: "json", ...q })
      .then((response) => response.data as SubsonicEnvelope)
      .then((json) => json["subsonic-response"])
      .then((json) => {
        if (isError(json)) throw `Subsonic error:${json.error.message}`;
        else return json as unknown as T;
      });

  generateToken = (credentials: Credentials) =>
    pipe(
      TE.tryCatch(
        () =>
          this.getJSON<PingResponse>(
            _.pick(credentials, "username", "password"),
            "/rest/ping.view"
          ),
        (e) => new AuthFailure(e as string)
      ),
      TE.chain(({ type }) =>
        pipe(
          TE.tryCatch(
            () => this.libraryFor({ ...credentials, type }),
            () => new AuthFailure("Failed to get library")
          ),
          TE.map((library) => ({ type, library }))
        )
      ),
      TE.chain(({ library, type }) =>
        pipe(
          library.bearerToken(credentials),
          TE.map((bearer) => ({ bearer, type }))
        )
      ),
      TE.map(({ bearer, type }) => ({
        serviceToken: asToken({ ...credentials, bearer, type }),
        userId: credentials.username,
        nickname: credentials.username,
      }))
    );

  refreshToken = (serviceToken: string) =>
    this.generateToken(parseToken(serviceToken));

  getArtists = (
    credentials: Credentials
  ): Promise<(IdName & { albumCount: number; image: BUrn | undefined })[]> =>
    this.getJSON<GetArtistsResponse>(credentials, "/rest/getArtists")
      .then((it) => (it.artists.index || []).flatMap((it) => it.artist || []))
      .then((artists) =>
        artists.map((artist) => ({
          id: `${artist.id}`,
          name: artist.name,
          albumCount: artist.albumCount,
          image: artistImageURN({
            artistId: artist.id,
            artistImageURL: artist.artistImageUrl,
          }),
        }))
      );

  getArtistInfo = (
    credentials: Credentials,
    id: string
  ): Promise<{
    similarArtist: (ArtistSummary & { inLibrary: boolean })[];
    images: {
      s: string | undefined;
      m: string | undefined;
      l: string | undefined;
    };
  }> =>
    this.getJSON<GetArtistInfoResponse>(credentials, "/rest/getArtistInfo2", {
      id,
      count: 50,
      includeNotPresent: true,
    })
      .then((it) => it.artistInfo2)
      .then((it) => ({
        images: {
          s: it.smallImageUrl,
          m: it.mediumImageUrl,
          l: it.largeImageUrl,
        },
        similarArtist: (it.similarArtist || []).map((artist) => ({
          id: `${artist.id}`,
          name: artist.name,
          inLibrary: artistIsInLibrary(artist.id),
          image: artistImageURN({
            artistId: artist.id,
            artistImageURL: artist.artistImageUrl,
          }),
        })),
      }));

  getAlbum = (credentials: Credentials, id: string): Promise<Album> =>
    this.getJSON<GetAlbumResponse>(credentials, "/rest/getAlbum", { id })
      .then((it) => it.album)
      .then((album) => ({
        id: album.id,
        name: album.name,
        year: album.year,
        genre: maybeAsGenre(album.genre),
        artistId: album.artistId,
        artistName: album.artist,
        coverArt: coverArtURN(album.coverArt),
      }));

  getArtist = (
    credentials: Credentials,
    id: string
  ): Promise<
    IdName & { artistImageUrl: string | undefined; albums: AlbumSummary[] }
  > =>
    this.getJSON<GetArtistResponse>(credentials, "/rest/getArtist", {
      id,
    })
      .then((it) => it.artist)
      .then((it) => ({
        id: it.id,
        name: it.name,
        artistImageUrl: it.artistImageUrl,
        albums: this.toAlbumSummary(it.album || []),
      }));

  getArtistWithInfo = (credentials: Credentials, id: string) =>
    Promise.all([
      this.getArtist(credentials, id),
      this.getArtistInfo(credentials, id),
    ]).then(([artist, artistInfo]) => ({
      id: artist.id,
      name: artist.name,
      image: artistImageURN({
        artistId: artist.id,
        artistImageURL: [
          artist.artistImageUrl,
          artistInfo.images.l,
          artistInfo.images.m,
          artistInfo.images.s,
        ].find(isValidImage),
      }),
      albums: artist.albums,
      similarArtists: artistInfo.similarArtist,
    }));

  getCoverArt = (credentials: Credentials, id: string, size?: number) =>
    this.get(credentials, "/rest/getCoverArt", size ? { id, size } : { id }, {
      headers: { "User-Agent": "bonob" },
      responseType: "arraybuffer",
    });

  getTrack = (credentials: Credentials, id: string) =>
    this.getJSON<GetSongResponse>(credentials, "/rest/getSong", {
      id,
    })
      .then((it) => it.song)
      .then((song) =>
        this.getAlbum(credentials, song.albumId!).then((album) =>
          asTrack(album, song, this.customPlayers)
        )
      );

  getStarred = (credentials: Credentials) =>
    this.getJSON<GetStarredResponse>(credentials, "/rest/getStarred2").then(
      (it) => new Set(it.starred2.song.map((it) => it.id))
    );

  toAlbumSummary = (albumList: album[]): AlbumSummary[] =>
    albumList.map((album) => ({
      id: album.id,
      name: album.name,
      year: album.year,
      genre: maybeAsGenre(album.genre),
      artistId: album.artistId,
      artistName: album.artist,
      coverArt: coverArtURN(album.coverArt),
    }));

  search3 = (credentials: Credentials, q: any) =>
    this.getJSON<Search3Response>(credentials, "/rest/search3", {
      artistCount: 0,
      albumCount: 0,
      songCount: 0,
      ...q,
    }).then((it) => ({
      artists: it.searchResult3.artist || [],
      albums: it.searchResult3.album || [],
      songs: it.searchResult3.song || [],
    }));

  getAlbumList2 = (credentials: Credentials, q: AlbumQuery) =>
    this.getJSON<GetAlbumListResponse>(credentials, "/rest/getAlbumList2", {
      type: AlbumQueryTypeToSubsonicType[q.type],
      ...(q.genre ? { genre: b64Decode(q.genre) } : {}),
      ...(q.fromYear ? { fromYear: q.fromYear} : {}),
      ...(q.toYear ? { toYear: q.toYear} : {}),
      size: q._count,
      offset: q._index,
    })
      .then((response) => ({
        // before general release we should support no totalCount by following the old method
        total: response.albumList2.totalCount,
        results: this.toAlbumSummary(response.albumList2.album)
      }));

  login = async (token: string) => this.libraryFor(parseToken(token));

  private libraryFor = (
    credentials: Credentials & { type: string }
  ): Promise<SubsonicMusicLibrary> => {
    const subsonic = this;

    const genericSubsonic: SubsonicMusicLibrary = {
      flavour: () => "subsonic",
      bearerToken: (_: Credentials) => TE.right(undefined),
      artists: (q: ArtistQuery): Promise<Result<ArtistSummary>> =>
        subsonic
          .getArtists(credentials)
          .then(slice2(q))
          .then(([page, total]) => ({
            total,
            results: page.map((it) => ({
              id: it.id,
              name: it.name,
              image: it.image,
            })),
          })),
      artist: async (id: string): Promise<Artist> =>
        subsonic.getArtistWithInfo(credentials, id),
      albums: async (q: AlbumQuery): Promise<Result<AlbumSummary>> =>
        subsonic.getAlbumList2(credentials, q),
      album: (id: string): Promise<Album> => subsonic.getAlbum(credentials, id),
      genres: () =>
        subsonic
          .getJSON<GetGenresResponse>(credentials, "/rest/getGenres")
          .then((it) =>
            pipe(
              it.genres.genre || [],
              A.filter((it) => it.albumCount > 0),
              A.map((it) => it.value),
              A.sort(ordString),
              A.map((it) => ({ id: b64Encode(it), name: it }))
            )
          ),
      tracks: (albumId: string) =>
        subsonic
          .getJSON<GetAlbumResponse>(credentials, "/rest/getAlbum", {
            id: albumId,
          })
          .then((it) => it.album)
          .then((album) =>
            (album.song || []).map((song) => asTrack(asAlbum(album), song, this.customPlayers))
          ),
      track: (trackId: string) => subsonic.getTrack(credentials, trackId),
      rate: (trackId: string, rating: Rating) =>
        Promise.resolve(true)
          .then(() => {
            if (rating.stars >= 0 && rating.stars <= 5) {
              return subsonic.getTrack(credentials, trackId);
            } else {
              throw `Invalid rating.stars value of ${rating.stars}`;
            }
          })
          .then((track) => {
            const thingsToUpdate = [];
            if (track.rating.love != rating.love) {
              thingsToUpdate.push(
                subsonic.getJSON(
                  credentials,
                  `/rest/${rating.love ? "star" : "unstar"}`,
                  {
                    id: trackId,
                  }
                )
              );
            }
            if (track.rating.stars != rating.stars) {
              thingsToUpdate.push(
                subsonic.getJSON(credentials, `/rest/setRating`, {
                  id: trackId,
                  rating: rating.stars,
                })
              );
            }
            return Promise.all(thingsToUpdate);
          })
          .then(() => true)
          .catch(() => false),
      stream: async ({
        trackId,
        range,
      }: {
        trackId: string;
        range: string | undefined;
      }) =>
        subsonic.getTrack(credentials, trackId).then((track) =>
          subsonic
            .get(
              credentials,
              `/rest/stream`,
              {
                id: trackId,
                c: track.encoding.player,
              },
              {
                headers: pipe(
                  range,
                  O.fromNullable,
                  O.map((range) => ({
                    "User-Agent": USER_AGENT,
                    Range: range,
                  })),
                  O.getOrElse(() => ({
                    "User-Agent": USER_AGENT,
                  }))
                ),
                responseType: "stream",
              }
            )
            .then((stream) => ({
              status: stream.status,
              headers: {
                "content-type": stream.headers["content-type"],
                "content-length": stream.headers["content-length"],
                "content-range": stream.headers["content-range"],
                "accept-ranges": stream.headers["accept-ranges"],
              },
              stream: stream.data,
            }))
        ),
      coverArt: async (coverArtURN: BUrn, size?: number) =>
        Promise.resolve(coverArtURN)
          .then((it) => assertSystem(it, "subsonic"))
          .then((it) => it.resource.split(":")[1]!)
          .then((it) => subsonic.getCoverArt(credentials, it, size))
          .then((res) => ({
            contentType: res.headers["content-type"],
            data: Buffer.from(res.data, "binary"),
          }))
          .catch((e) => {
            logger.error(
              `Failed getting coverArt for urn:'${coverArtURN}': ${e}`
            );
            return undefined;
          }),
      scrobble: async (id: string) =>
        subsonic
          .getJSON(credentials, `/rest/scrobble`, {
            id,
            submission: true,
          })
          .then((_) => true)
          .catch(() => false),
      nowPlaying: async (id: string) =>
        subsonic
          .getJSON(credentials, `/rest/scrobble`, {
            id,
            submission: false,
          })
          .then((_) => true)
          .catch(() => false),
      searchArtists: async (query: string) =>
        subsonic
          .search3(credentials, { query, artistCount: 20 })
          .then(({ artists }) =>
            artists.map((artist) => ({
              id: artist.id,
              name: artist.name,
              image: artistImageURN({
                artistId: artist.id,
                artistImageURL: artist.artistImageUrl,
              }),
            }))
          ),
      searchAlbums: async (query: string) =>
        subsonic
          .search3(credentials, { query, albumCount: 20 })
          .then(({ albums }) => subsonic.toAlbumSummary(albums)),
      searchTracks: async (query: string) =>
        subsonic
          .search3(credentials, { query, songCount: 20 })
          .then(({ songs }) =>
            Promise.all(
              songs.map((it) => subsonic.getTrack(credentials, it.id))
            )
          ),
      playlists: async () =>
        subsonic
          .getJSON<GetPlaylistsResponse>(credentials, "/rest/getPlaylists")
          .then((it) => it.playlists.playlist || [])
          .then((playlists) => playlists.map(asPlayListSummary)),
      playlist: async (id: string) =>
        subsonic
          .getJSON<GetPlaylistResponse>(credentials, "/rest/getPlaylist", {
            id,
          })
          .then((it) => it.playlist)
          .then((playlist) => {
            let trackNumber = 1;
            return {
              id: playlist.id,
              name: playlist.name,
              coverArt: coverArtURN(playlist.coverArt),
              entries: (playlist.entry || []).map((entry) => ({
                ...asTrack(
                  {
                    id: entry.albumId!,
                    name: entry.album!,
                    year: entry.year,
                    genre: maybeAsGenre(entry.genre),
                    artistName: entry.artist,
                    artistId: entry.artistId,
                    coverArt: coverArtURN(entry.coverArt),
                  },
                  entry,
                  this.customPlayers
                ),
                number: trackNumber++,
              })),
            };
          }),
      createPlaylist: async (name: string) =>
        subsonic
          .getJSON<GetPlaylistResponse>(credentials, "/rest/createPlaylist", {
            name,
          })
          .then((it) => it.playlist)
          // todo: why is this line so similar to other playlist lines??
          .then((it) => ({
            id: it.id,
            name: it.name,
            coverArt: coverArtURN(it.coverArt),
          })),
      deletePlaylist: async (id: string) =>
        subsonic
          .getJSON<GetPlaylistResponse>(credentials, "/rest/deletePlaylist", {
            id,
          })
          .then((_) => true),
      addToPlaylist: async (playlistId: string, trackId: string) =>
        subsonic
          .getJSON<GetPlaylistResponse>(credentials, "/rest/updatePlaylist", {
            playlistId,
            songIdToAdd: trackId,
          })
          .then((_) => true),
      removeFromPlaylist: async (playlistId: string, indicies: number[]) =>
        subsonic
          .getJSON<GetPlaylistResponse>(credentials, "/rest/updatePlaylist", {
            playlistId,
            songIndexToRemove: indicies,
          })
          .then((_) => true),
      similarSongs: async (id: string) =>
        subsonic
          .getJSON<GetSimilarSongsResponse>(
            credentials,
            "/rest/getSimilarSongs2",
            { id, count: 50 }
          )
          .then((it) => it.similarSongs2.song || [])
          .then((songs) =>
            Promise.all(
              songs.map((song) =>
                subsonic
                  .getAlbum(credentials, song.albumId!)
                  .then((album) => asTrack(album, song, this.customPlayers))
              )
            )
          ),
      topSongs: async (artistId: string) =>
        subsonic.getArtist(credentials, artistId).then(({ name }) =>
          subsonic
            .getJSON<GetTopSongsResponse>(credentials, "/rest/getTopSongs", {
              artist: name,
              count: 50,
            })
            .then((it) => it.topSongs.song || [])
            .then((songs) =>
              Promise.all(
                songs.map((song) =>
                  subsonic
                    .getAlbum(credentials, song.albumId!)
                    .then((album) => asTrack(album, song, this.customPlayers))
                )
              )
            )
        ),
      radioStations: async () => subsonic
        .getJSON<GetInternetRadioStationsResponse>(
          credentials,
          "/rest/getInternetRadioStations"
        )
        .then((it) => it.internetRadioStations.internetRadioStation || [])
        .then((stations) => stations.map((it) => ({
          id: it.id,
          name: it.name,
          url: it.streamUrl,
          homePage: it.homePageUrl
        }))),
      radioStation: async (id: string) => genericSubsonic
        .radioStations()
        .then(it => 
          it.find(station => station.id === id)!
        ),
      years: async () => {
        const q: AlbumQuery = {
          _index: 0,
          _count: 100000,  // FIXME: better than this ?
          type: "alphabeticalByArtist",
        };
        const years = subsonic.getAlbumList2(credentials, q)
            .then(({ results }) =>
              results.map((album) => album.year || "?")
                .filter((item, i, ar) => ar.indexOf(item) === i)
                .sort()
                .map((year) => ({
                  ...asYear(year)
                }))
                .reverse()
            );
        return years;
      }
    };

    if (credentials.type == "navidrome") {
      // todo: there does not seem to be a test for this??
      return Promise.resolve({
        ...genericSubsonic,
        flavour: () => "navidrome",
        bearerToken: (credentials: Credentials) =>
          pipe(
            TE.tryCatch(
              () =>
                axios.post(
                  this.url.append({ pathname: "/auth/login" }).href(),
                  _.pick(credentials, "username", "password")
                ),
              () => new AuthFailure("Failed to get bearerToken")
            ),
            TE.map((it) => it.data.token as string | undefined)
          ),
      });
    } else {
      return Promise.resolve(genericSubsonic);
    }
  };
}
