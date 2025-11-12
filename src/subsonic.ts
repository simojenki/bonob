import { option as O, taskEither as TE } from "fp-ts";
import * as A from "fp-ts/Array";
import { ordString } from "fp-ts/lib/Ord";
import { pipe } from "fp-ts/lib/function";
import { Md5 } from "ts-md5";
import {
  Credentials,
  Album,
  AlbumQuery,
  AlbumSummary,
  Genre,
  Track,
  CoverArt,
  AlbumQueryType,
  Encoding,
  albumToAlbumSummary,
  TrackSummary,
  AuthFailure
} from "./music_library";
import sharp from "sharp";
import _ from "underscore";
import fse from "fs-extra";
import path from "path";

import axios, { AxiosRequestConfig } from "axios";
import randomstring from "randomstring";
import { b64Encode, b64Decode } from "./b64";
import { BUrn } from "./burn";
import { album, artist } from "./smapi";
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
    album: album[];
  };
};

type genre = {
  songCount: number;
  albumCount: number;
  value: string;
};

export type GetGenresResponse = SubsonicResponse & {
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
  // todo: this field shouldnt be on song?
  starred: string | undefined;
};

export type GetAlbumResponse = {
  album: album & {
    song: song[];
  };
};

export type GetPlaylistResponse = {
  // todo: isnt the type here a composite? playlistSummary && { entry: song[]; }
  playlist: {
    id: string;
    name: string;
    entry: song[];

    // todo: this is an ND specific field?
    coverArt: string | undefined;
  };
};

export type GetPlaylistsResponse = {
  playlists: { 
    playlist: {
      id: string;
      name: string;
      //owner: string,
      //public: boolean,
      //created: string,
      //changed: string,
      //songCount: int,
      //duration: int,

      // todo: this is an ND specific field.
      coverArt: string | undefined;
    }[] 
  };
};

export type GetSimilarSongsResponse = {
  similarSongs2: { song: song[] };
};

export type GetTopSongsResponse = {
  topSongs: { song: song[] };
};

export type GetInternetRadioStationsResponse = {
  internetRadioStations: {
    internetRadioStation: {
      id: string;
      name: string;
      streamUrl: string;
      homePageUrl?: string;
    }[];
  };
};

export type GetSongResponse = {
  song: song;
};

export type GetStarredResponse = {
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

export type Search3Response = SubsonicResponse & {
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

export type IdName = {
  id: string;
  name: string;
};

export const coverArtURN = (coverArt: string | undefined): BUrn | undefined =>
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

export const asTrackSummary = (
  song: song,
  customPlayers: CustomPlayers
): TrackSummary => ({
  id: song.id,
  name: song.title,
  encoding: pipe(
    customPlayers.encodingFor({ mimeType: song.contentType }),
    O.getOrElse(() => ({
      player: DEFAULT_CLIENT_APPLICATION,
      mimeType: song.transcodedContentType
        ? song.transcodedContentType
        : song.contentType,
    }))
  ),
  duration: song.duration || 0,
  number: song.track || 0,
  genre: maybeAsGenre(song.genre),
  coverArt: coverArtURN(song.coverArt),
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

export const asTrack = (
  album: AlbumSummary,
  song: song,
  customPlayers: CustomPlayers
): Track => ({
  ...asTrackSummary(song, customPlayers),
  album: album,
});

export const asAlbumSummary = (album: album): AlbumSummary => ({
  id: album.id,
  name: album.name,
  year: album.year,
  genre: maybeAsGenre(album.genre),
  artistId: album.artistId,
  artistName: album.artist,
  coverArt: coverArtURN(album.coverArt),
});

export const asGenre = (genreName: string) => ({
  id: b64Encode(genreName),
  name: genreName,
});

export const maybeAsGenre = (
  genreName: string | undefined
): Genre | undefined =>
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
  encodingFor({ mimeType }: { mimeType: string }): O.Option<Encoding>;
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

  encodingFor = ({ mimeType }: { mimeType: string }): O.Option<Encoding> =>
    pipe(
      this.transcodings.get(mimeType),
      O.fromNullable,
      O.map((transcodedMimeType) => ({
        player: `${DEFAULT_CLIENT_APPLICATION}+${mimeType}`,
        mimeType: transcodedMimeType,
      }))
    );
}

export const NO_CUSTOM_PLAYERS: CustomPlayers = {
  encodingFor(_) {
    return O.none;
  },
};

export const DEFAULT_CLIENT_APPLICATION = "bonob";
export const USER_AGENT = "bonob";

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
  (cacheDir: string, delegate: ImageFetcher, makeSharp = sharp) =>
  async (url: string): Promise<CoverArt | undefined> => {
    const filename = path.join(cacheDir, `${Md5.hashStr(url)}.png`);
    return fse
      .readFile(filename)
      .then((data) => ({ contentType: "image/png", data }))
      .catch(() =>
        delegate(url).then((image) => {
          if (image) {
            return makeSharp(image.data)
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

export class Subsonic {
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

  private get = async (
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

  // todo: should I put a catch in here and force a subsonic fail status?
  // or there is a catch above, that then throws, perhaps can go in there?
  private getJSON = async <T>(
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

  ping = (credentials: Credentials): TE.TaskEither<AuthFailure, { authenticated: Boolean, type: string}> => 
    TE.tryCatch(
      () => this.getJSON<PingResponse>(credentials, "/rest/ping.view")
      .then(it => ({
        authenticated: it.status == "ok",
        type: it.type
      })),
      (e) => new AuthFailure(e as string)
    )
    

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

      // todo: should be getArtistInfo2?
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
        //todo: this does seem to be in OpenSubsonic?? it is also singular
        similarArtist: (it.similarArtist || []).map((artist) => ({
          id: `${artist.id}`,
          name: artist.name,
          // todo: whats this inLibrary used for? it probably should be filtered on??
          inLibrary: artistIsInLibrary(artist.id),
          image: artistImageURN({
            artistId: artist.id,
            artistImageURL: artist.artistImageUrl,
          }),
        })),
        })
      );

  getAlbum = (credentials: Credentials, id: string): Promise<Album>  =>
    this.getJSON<GetAlbumResponse>(credentials, "/rest/getAlbum", { id })
      .then((it) => it.album)
      .then((album) => {
        const x: AlbumSummary = {
          id: album.id,
          name: album.name,
          year: album.year,
          genre: maybeAsGenre(album.genre),
          artistId: album.artistId,
          artistName: album.artist,
          coverArt: coverArtURN(album.coverArt)
        }
        return { summary: x, songs: album.song }
      }).then(({ summary, songs }) => {
        const x: AlbumSummary = summary
        const y: Track[] = songs.map((it) => asTrack(summary, it, this.customPlayers))
        return {
          ...x,
          tracks: y
        };
      });
   
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
          asTrack(albumToAlbumSummary(album), song, this.customPlayers)
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
    Promise.all([
      this.getArtists(credentials).then((it) =>
        _.inject(it, (total, artist) => total + artist.albumCount, 0)
      ),
      this.getJSON<GetAlbumListResponse>(credentials, "/rest/getAlbumList2", {
        type: AlbumQueryTypeToSubsonicType[q.type],
        ...(q.genre ? { genre: b64Decode(q.genre) } : {}),
        ...(q.fromYear ? { fromYear: q.fromYear } : {}),
        ...(q.toYear ? { toYear: q.toYear } : {}),
        size: 500,
        offset: q._index,
      })
        .then((response) => response.albumList2.album || [])
        .then(this.toAlbumSummary),
    ]).then(([total, albums]) => ({
      results: albums.slice(0, q._count),
      total: albums.length == 500 ? total : q._index + albums.length,
    }));

  getGenres = (credentials: Credentials) =>
    this.getJSON<GetGenresResponse>(credentials, "/rest/getGenres").then((it) =>
      pipe(
        it.genres.genre || [],
        A.filter((it) => it.albumCount > 0),
        A.map((it) => it.value),
        A.sort(ordString),
        A.map(maybeAsGenre),
        A.filter((it) => it != undefined)
      )
    );

  private st4r = (credentials: Credentials, action: string,  { id } : { id: string }) => 
    this.getJSON<SubsonicResponse>(credentials, `/rest/${action}`, { id }).then(it => 
      it.status == "ok"
    );

  star = (credentials: Credentials, ids : { id: string }) => 
    this.st4r(credentials, "star", ids)

  unstar = (credentials: Credentials, ids : { id: string }) => 
    this.st4r(credentials, "unstar", ids)

  setRating = (credentials: Credentials, id: string, rating: number) => 
    this.getJSON<SubsonicResponse>(credentials, `/rest/setRating`, {
      id,
      rating,
    })
    .then(it => it.status == "ok");

  scrobble = (credentials: Credentials, id: string, submission: boolean) =>
    this.getJSON<SubsonicResponse>(credentials, `/rest/scrobble`, {
        id,
        submission,
      })
      .then(it => it.status == "ok")

  stream = (credentials: Credentials, id: string, c: string, range: string | undefined) =>
    this.get(
      credentials,
      `/rest/stream`,
      {
        id,
        c,
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
    }));

  playlists = (credentials: Credentials) =>
    this.getJSON<GetPlaylistsResponse>(credentials, "/rest/getPlaylists")
    .then(({ playlists }) => (playlists.playlist || []).map( it => ({
        id: it.id,
        name: it.name,
        coverArt: coverArtURN(it.coverArt),
      }))
    );

  playlist = (credentials: Credentials, id: string) =>
    this.getJSON<GetPlaylistResponse>(credentials, "/rest/getPlaylist", {
      id,
    })
    .then(({ playlist }) => {
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
    });

    createPlayList = (credentials: Credentials, name: string) =>
      this.getJSON<GetPlaylistResponse>(credentials, "/rest/createPlaylist", {
        name,
      })
      .then(({ playlist }) => ({
        id: playlist.id,
        name: playlist.name,
        coverArt: coverArtURN(playlist.coverArt),
      }));

    deletePlayList = (credentials: Credentials, id: string) => 
      this.getJSON<SubsonicResponse>(credentials, "/rest/deletePlaylist", {
        id,
      })
      .then(it => it.status == "ok");

    updatePlaylist = (
      credentials: Credentials, 
      playlistId: string, 
      changes : Partial<{ songIdToAdd: string | undefined, songIndexToRemove: number[] | undefined }> = {}
    ) => 
      this.getJSON<SubsonicResponse>(credentials, "/rest/updatePlaylist", {
        playlistId,
        ...changes
      })
      .then(it => it.status == "ok");

    getSimilarSongs2 = (credentials: Credentials, id: string) =>
      this.getJSON<GetSimilarSongsResponse>(
        credentials,
        "/rest/getSimilarSongs2",
        //todo: remove this hard coded 50?
        { id, count: 50 }
      )
      .then((it) => 
        (it.similarSongs2.song || []).map(it => asTrackSummary(it, this.customPlayers))
      );

    getTopSongs = (credentials: Credentials, artist: string) =>
      this.getJSON<GetTopSongsResponse>(
        credentials,
        "/rest/getTopSongs",
        //todo: remove this hard coded 50?
        { artist, count: 50 }
      )
      .then((it) => 
        (it.topSongs.song || []).map(it => asTrackSummary(it, this.customPlayers))
      );

  getInternetRadioStations = (credentials: Credentials) =>
    this.getJSON<GetInternetRadioStationsResponse>(
      credentials,
      "/rest/getInternetRadioStations"
    )
    .then((it) => it.internetRadioStations.internetRadioStation || [])
    .then((stations) =>
      stations.map((it) => ({
        id: it.id,
        name: it.name,
        url: it.streamUrl,
        homePage: it.homePageUrl,
      }))
    ); 
};
