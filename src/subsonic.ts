import { option as O } from "fp-ts";
import * as A from "fp-ts/Array";
import { ordString } from "fp-ts/lib/Ord";
import { pipe } from "fp-ts/lib/function";
import { Md5 } from "ts-md5/dist/md5";
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
  contentType: string | undefined;
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
};

type GetPlaylistResponse = {
  playlist: {
    id: string;
    name: string;
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

type GetSongResponse = {
  song: song;
};

type GetStarredResponse = {
  starred2: {
    song: song[];
    album: album[];
  };
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

const coverArtURN = (coverArt: string | undefined): BUrn | undefined => pipe(
  coverArt,
  O.fromNullable,
  O.map((it: string) => ({ system: "subsonic", resource: `art:${it}` })),
  O.getOrElseW(() => undefined)
)

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
      resource: deets.artistImageURL
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

export const asTrack = (album: Album, song: song): Track => ({
  id: song.id,
  name: song.title,
  mimeType: song.contentType!,
  duration: song.duration || 0,
  number: song.track || 0,
  genre: maybeAsGenre(song.genre),
  coverArt: coverArtURN(song.coverArt),
  album,
  artist: {
    id: song.artistId,
    name: song.artist ? song.artist : "?",
    image: song.artistId ? artistImageURN({ artistId: song.artistId }) : undefined,
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

export type StreamClientApplication = (track: Track) => string;

const DEFAULT_CLIENT_APPLICATION = "bonob";
const USER_AGENT = "bonob";

export const DEFAULT: StreamClientApplication = (_: Track) =>
  DEFAULT_CLIENT_APPLICATION;

export function appendMimeTypeToClientFor(mimeTypes: string[]) {
  return (track: Track) =>
    mimeTypes.includes(track.mimeType) ? `bonob+${track.mimeType}` : "bonob";
}

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
  random: "random",
  recentlyPlayed: "recent",
  mostPlayed: "frequent",
  recentlyAdded: "newest",
  favourited: "starred",
  starred: "highest",
};

const artistIsInLibrary = (artistId: string | undefined) =>
  artistId != undefined && artistId != "-1";

export class Subsonic implements MusicService {
  url: string;
  streamClientApplication: StreamClientApplication;
  externalImageFetcher: ImageFetcher;

  constructor(
    url: string,
    streamClientApplication: StreamClientApplication = DEFAULT,
    externalImageFetcher: ImageFetcher = axiosImageFetcher
  ) {
    this.url = url;
    this.streamClientApplication = streamClientApplication;
    this.externalImageFetcher = externalImageFetcher;
  }

  get = async (
    { username, password }: Credentials,
    path: string,
    q: {} = {},
    config: AxiosRequestConfig | undefined = {}
  ) =>
    axios
      .get(`${this.url}${path}`, {
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

  generateToken = async (credentials: Credentials) =>
    this.getJSON(credentials, "/rest/ping.view")
      .then(() => ({
        serviceToken: b64Encode(JSON.stringify(credentials)),
        userId: credentials.username,
        nickname: credentials.username,
      }))
      .catch((e) => ({ message: `${e}` }));

  parseToken = (token: string): Credentials => JSON.parse(b64Decode(token));

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
          asTrack(album, song)
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
        size: 500,
        offset: q._index,
      })
        .then((response) => response.albumList2.album || [])
        .then(this.toAlbumSummary),
    ]).then(([total, albums]) => ({
      results: albums.slice(0, q._count),
      total: albums.length == 500 ? total : q._index + albums.length,
    }));

  // getStarred2 = (credentials: Credentials): Promise<{ albums: Album[] }> =>
  //   this.getJSON<GetStarredResponse>(credentials, "/rest/getStarred2")
  //     .then((it) => it.starred2)
  //     .then((it) => ({
  //       albums: it.album.map(asAlbum),
  //     }));

  async login(token: string) {
    const subsonic = this;
    const credentials: Credentials = this.parseToken(token);

    const musicLibrary: MusicLibrary = {
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
            (album.song || []).map((song) => asTrack(asAlbum(album), song))
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
                c: this.streamClientApplication(track),
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
            .then((res) => ({
              status: res.status,
              headers: {
                "content-type": res.headers["content-type"],
                "content-length": res.headers["content-length"],
                "content-range": res.headers["content-range"],
                "accept-ranges": res.headers["accept-ranges"],
              },
              stream: res.data,
            }))
        ),
      coverArt: async (coverArtURN: BUrn, size?: number) =>
        Promise.resolve(coverArtURN)
          .then((it) => assertSystem(it, "subsonic"))
          .then((it) => it.resource.split(":")[1]!)
          .then((it) =>
            subsonic.getCoverArt(
              credentials,
              it,
              size
            )
          )
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
          .then((playlists) =>
            playlists.map((it) => ({ id: it.id, name: it.name }))
          ),
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
                  entry
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
          .then((it) => ({ id: it.id, name: it.name })),
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
                  .then((album) => asTrack(album, song))
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
                    .then((album) => asTrack(album, song))
                )
              )
            )
        ),
    };

    return Promise.resolve(musicLibrary);
  }
}
