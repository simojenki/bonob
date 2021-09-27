import { option as O } from "fp-ts";
import * as A from "fp-ts/Array";
import { ordString } from "fp-ts/lib/Ord";
import { pipe } from "fp-ts/lib/function";
import { Md5 } from "ts-md5/dist/md5";
import {
  Credentials,
  MusicService,
  Album,
  Artist,
  ArtistSummary,
  Result,
  slice2,
  AlbumQuery,
  ArtistQuery,
  MusicLibrary,
  Images,
  AlbumSummary,
  Genre,
  Track,
} from "./music_service";
import X2JS from "x2js";
import sharp from "sharp";
import _ from "underscore";

import axios, { AxiosRequestConfig } from "axios";
import { Encryption } from "./encryption";
import randomString from "./random_string";
import { b64Encode, b64Decode } from "./b64";

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
  const s = randomString();
  return {
    t: t(password, s),
    s,
  };
};

export const DODGY_IMAGE_NAME = "2a96cbd8b46e442fc41c2b86b821562f.png";

export const isDodgyImage = (url: string) => url.endsWith(DODGY_IMAGE_NAME);

export const validate = (url: string | undefined) =>
  url && !isDodgyImage(url) ? url : undefined;

export type SubconicEnvelope = {
  "subsonic-response": SubsonicResponse;
};

export type SubsonicResponse = {
  _status: string;
};

export type album = {
  _id: string;
  _name: string;
  _genre: string | undefined;
  _year: string | undefined;
  _coverArt: string | undefined;
  _artist: string;
  _artistId: string;
};

export type artistSummary = {
  _id: string;
  _name: string;
  _albumCount: string;
  _artistImageUrl: string | undefined;
};

export type GetArtistsResponse = SubsonicResponse & {
  artists: {
    index: {
      artist: artistSummary[];
      _name: string;
    }[];
  };
};

export type GetAlbumListResponse = SubsonicResponse & {
  albumList2: {
    album: album[];
  };
};

export type genre = {
  _songCount: string;
  _albumCount: string;
  __text: string;
};

export type GetGenresResponse = SubsonicResponse & {
  genres: {
    genre: genre[];
  };
};

export type SubsonicError = SubsonicResponse & {
  error: {
    _code: string;
    _message: string;
  };
};

export type artistInfo = {
  biography: string | undefined;
  musicBrainzId: string | undefined;
  lastFmUrl: string | undefined;
  smallImageUrl: string | undefined;
  mediumImageUrl: string | undefined;
  largeImageUrl: string | undefined;
  similarArtist: artistSummary[];
};

export type ArtistInfo = {
  image: Images;
  similarArtist: (ArtistSummary & { inLibrary: boolean })[];
};

export type GetArtistInfoResponse = SubsonicResponse & {
  artistInfo2: artistInfo;
};

export type GetArtistResponse = SubsonicResponse & {
  artist: artistSummary & {
    album: album[];
  };
};

export type song = {
  _id: string;
  _parent: string;
  _title: string;
  _album: string;
  _artist: string;
  _track: string | undefined;
  _genre: string;
  _coverArt: string | undefined;
  _created: "2004-11-08T23:36:11";
  _duration: string | undefined;
  _bitRate: "128";
  _suffix: "mp3";
  _contentType: string;
  _albumId: string;
  _artistId: string;
  _type: "music";
};

export type GetAlbumResponse = {
  album: album & {
    song: song[];
  };
};

export type playlist = {
  _id: string;
  _name: string;
};

export type entry = {
  _id: string;
  _parent: string;
  _title: string;
  _album: string;
  _artist: string;
  _track: string;
  _year: string;
  _genre: string;
  _coverArt: string;
  _contentType: string;
  _duration: string;
  _albumId: string;
  _artistId: string;
};

export type GetPlaylistResponse = {
  playlist: {
    _id: string;
    _name: string;
    entry: entry[];
  };
};

export type GetPlaylistsResponse = {
  playlists: { playlist: playlist[] };
};

export type GetSimilarSongsResponse = {
  similarSongs2: { song: song[] };
};

export type GetTopSongsResponse = {
  topSongs: { song: song[] };
};

export type GetSongResponse = {
  song: song;
};

export type Search3Response = SubsonicResponse & {
  searchResult3: {
    artist: artistSummary[];
    album: album[];
    song: song[];
  };
};

export function isError(
  subsonicResponse: SubsonicResponse
): subsonicResponse is SubsonicError {
  return (subsonicResponse as SubsonicError).error !== undefined;
}

export const splitCoverArtId = (coverArt: string): [string, string] => {
  const parts = coverArt.split(":").filter(it => it.length > 0);
  if(parts.length < 2) throw `'${coverArt}' is an invalid coverArt id'`
  return [parts[0]!, parts.slice(1).join(":")];
};

export type IdName = {
  id: string;
  name: string;
};

export type getAlbumListParams = {
  type: string;
  size?: number;
  offet?: number;
  fromYear?: string;
  toYear?: string;
  genre?: string;
};

export const MAX_ALBUM_LIST = 500;

const maybeAsCoverArt = (coverArt: string | undefined) => coverArt ? `coverArt:${coverArt}` : undefined

const asTrack = (album: Album, song: song) => ({
  id: song._id,
  name: song._title,
  mimeType: song._contentType,
  duration: parseInt(song._duration || "0"),
  number: parseInt(song._track || "0"),
  genre: maybeAsGenre(song._genre),
  coverArt: maybeAsCoverArt(song._coverArt),
  album,
  artist: {
    id: song._artistId,
    name: song._artist,
  },
});

const asAlbum = (album: album) => ({
  id: album._id,
  name: album._name,
  year: album._year,
  genre: maybeAsGenre(album._genre),
  artistId: album._artistId,
  artistName: album._artist,
  coverArt: maybeAsCoverArt(album._coverArt)
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

export const DEFAULT_CLIENT_APPLICATION = "bonob";
export const USER_AGENT = "bonob";

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

export class Subsonic implements MusicService {
  url: string;
  encryption: Encryption;
  streamClientApplication: StreamClientApplication;

  constructor(
    url: string,
    encryption: Encryption,
    streamClientApplication: StreamClientApplication = DEFAULT
  ) {
    this.url = url;
    this.encryption = encryption;
    this.streamClientApplication = streamClientApplication;
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
    this.get({ username, password }, path, q)
      .then(
        (response) =>
          new X2JS({
            arrayAccessFormPaths: [
              "subsonic-response.album.song",
              "subsonic-response.albumList2.album",
              "subsonic-response.artist.album",
              "subsonic-response.artists.index",
              "subsonic-response.artists.index.artist",
              "subsonic-response.artistInfo2.similarArtist",
              "subsonic-response.genres.genre",
              "subsonic-response.playlist.entry",
              "subsonic-response.playlists.playlist",
              "subsonic-response.searchResult3.album",
              "subsonic-response.searchResult3.artist",
              "subsonic-response.searchResult3.song",
              "subsonic-response.similarSongs2.song",
              "subsonic-response.topSongs.song",
            ],
          }).xml2js(response.data) as SubconicEnvelope
      )
      .then((json) => json["subsonic-response"])
      .then((json) => {
        if (isError(json)) throw `Subsonic error:${json.error._message}`;
        else return json as unknown as T;
      });

  generateToken = async (credentials: Credentials) =>
    this.getJSON(credentials, "/rest/ping.view")
      .then(() => ({
        authToken: b64Encode(
          JSON.stringify(this.encryption.encrypt(JSON.stringify(credentials)))
        ),
        userId: credentials.username,
        nickname: credentials.username,
      }))
      .catch((e) => ({ message: `${e}` }));

  parseToken = (token: string): Credentials =>
    JSON.parse(this.encryption.decrypt(JSON.parse(b64Decode(token))));

  getArtists = (
    credentials: Credentials
  ): Promise<(IdName & { albumCount: number })[]> =>
    this.getJSON<GetArtistsResponse>(credentials, "/rest/getArtists")
      .then((it) => (it.artists.index || []).flatMap((it) => it.artist || []))
      .then((artists) =>
        artists.map((artist) => ({
          id: artist._id,
          name: artist._name,
          albumCount: Number.parseInt(artist._albumCount),
        }))
      );

  getArtistInfo = (credentials: Credentials, id: string): Promise<ArtistInfo> =>
    this.getJSON<GetArtistInfoResponse>(credentials, "/rest/getArtistInfo2", {
      id,
      count: 50,
      includeNotPresent: true,
    }).then((it) => ({
      image: {
        small: validate(it.artistInfo2.smallImageUrl),
        medium: validate(it.artistInfo2.mediumImageUrl),
        large: validate(it.artistInfo2.largeImageUrl),
      },
      similarArtist: (it.artistInfo2.similarArtist || []).map((artist) => ({
        id: artist._id,
        name: artist._name,
        inLibrary: artist._id != "-1",
      })),
    }));

  getAlbum = (credentials: Credentials, id: string): Promise<Album> =>
    this.getJSON<GetAlbumResponse>(credentials, "/rest/getAlbum", { id })
      .then((it) => it.album)
      .then((album) => ({
        id: album._id,
        name: album._name,
        year: album._year,
        genre: maybeAsGenre(album._genre),
        artistId: album._artistId,
        artistName: album._artist,
        coverArt: maybeAsCoverArt(album._coverArt)
      }));

  getArtist = (
    credentials: Credentials,
    id: string
  ): Promise<IdName & { albums: AlbumSummary[] }> =>
    this.getJSON<GetArtistResponse>(credentials, "/rest/getArtist", {
      id,
    })
      .then((it) => it.artist)
      .then((it) => ({
        id: it._id,
        name: it._name,
        albums: this.toAlbumSummary(it.album || []),
      }));

  getArtistWithInfo = (credentials: Credentials, id: string) =>
    Promise.all([
      this.getArtist(credentials, id),
      this.getArtistInfo(credentials, id),
    ]).then(([artist, artistInfo]) => ({
      id: artist.id,
      name: artist.name,
      image: artistInfo.image,
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
        this.getAlbum(credentials, song._albumId).then((album) =>
          asTrack(album, song)
        )
      );

  toAlbumSummary = (albumList: album[]): AlbumSummary[] =>
    albumList.map((album) => ({
      id: album._id,
      name: album._name,
      year: album._year,
      genre: maybeAsGenre(album._genre),
      artistId: album._artistId,
      artistName: album._artist,
      coverArt: maybeAsCoverArt(album._coverArt)
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

  async login(token: string) {
    const navidrome = this;
    const credentials: Credentials = this.parseToken(token);

    const musicLibrary: MusicLibrary = {
      artists: (q: ArtistQuery): Promise<Result<ArtistSummary>> =>
        navidrome
          .getArtists(credentials)
          .then(slice2(q))
          .then(([page, total]) => ({
            total,
            results: page.map((it) => ({ id: it.id, name: it.name })),
          })),
      artist: async (id: string): Promise<Artist> =>
        navidrome.getArtistWithInfo(credentials, id),
      albums: async (q: AlbumQuery): Promise<Result<AlbumSummary>> =>
        Promise.all([
          navidrome
            .getArtists(credentials)
            .then((it) =>
              _.inject(it, (total, artist) => total + artist.albumCount, 0)
            ),
          navidrome
            .getJSON<GetAlbumListResponse>(credentials, "/rest/getAlbumList2", {
              type: q.type,
              ...(q.genre ? { genre: b64Decode(q.genre) } : {}),
              size: 500,
              offset: q._index,
            })
            .then((response) => response.albumList2.album || [])
            .then(navidrome.toAlbumSummary),
        ]).then(([total, albums]) => ({
          results: albums.slice(0, q._count),
          total: albums.length == 500 ? total : q._index + albums.length,
        })),
      album: (id: string): Promise<Album> =>
        navidrome.getAlbum(credentials, id),
      genres: () =>
        navidrome
          .getJSON<GetGenresResponse>(credentials, "/rest/getGenres")
          .then((it) =>
            pipe(
              it.genres.genre || [],
              A.filter((it) => Number.parseInt(it._albumCount) > 0),
              A.map((it) => it.__text),
              A.sort(ordString),
              A.map((it) => ({ id: b64Encode(it), name: it }))
            )
          ),
      tracks: (albumId: string) =>
        navidrome
          .getJSON<GetAlbumResponse>(credentials, "/rest/getAlbum", {
            id: albumId,
          })
          .then((it) => it.album)
          .then((album) =>
            (album.song || []).map((song) => asTrack(asAlbum(album), song))
          ),
      track: (trackId: string) => navidrome.getTrack(credentials, trackId),
      stream: async ({
        trackId,
        range,
      }: {
        trackId: string;
        range: string | undefined;
      }) =>
        navidrome.getTrack(credentials, trackId).then((track) =>
          navidrome
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
      coverArt: async (coverArt: string, size?: number) => {
        const [type, id] = splitCoverArtId(coverArt);
        if (type == "coverArt") {
          return navidrome.getCoverArt(credentials, id, size).then((res) => ({
            contentType: res.headers["content-type"],
            data: Buffer.from(res.data, "binary"),
          }));
        } else {
          return navidrome.getArtistWithInfo(credentials, id).then((artist) => {
            const albumsWithCoverArt = artist.albums.filter(it => it.coverArt);
            if (artist.image.large) {
              return axios
                .get(artist.image.large!, {
                  headers: BROWSER_HEADERS,
                  responseType: "arraybuffer",
                })
                .then((res) => {
                  const image = Buffer.from(res.data, "binary");
                  if (size) {
                    return sharp(image)
                      .resize(size)
                      .toBuffer()
                      .then((resized) => ({
                        contentType: res.headers["content-type"],
                        data: resized,
                      }));
                  } else {
                    return {
                      contentType: res.headers["content-type"],
                      data: image,
                    };
                  }
                });
            } else if (albumsWithCoverArt.length > 0) {
              return navidrome
                .getCoverArt(credentials, splitCoverArtId(albumsWithCoverArt[0]!.coverArt!)[1], size)
                .then((res) => ({
                  contentType: res.headers["content-type"],
                  data: Buffer.from(res.data, "binary"),
                }));
            } else {
              return undefined;
            }
          });
        }
      },
      scrobble: async (id: string) =>
        navidrome
          .get(credentials, `/rest/scrobble`, {
            id,
            submission: true,
          })
          .then((_) => true)
          .catch(() => false),
      nowPlaying: async (id: string) =>
        navidrome
          .get(credentials, `/rest/scrobble`, {
            id,
            submission: false,
          })
          .then((_) => true)
          .catch(() => false),
      searchArtists: async (query: string) =>
        navidrome
          .search3(credentials, { query, artistCount: 20 })
          .then(({ artists }) =>
            artists.map((artist) => ({
              id: artist._id,
              name: artist._name,
            }))
          ),
      searchAlbums: async (query: string) =>
        navidrome
          .search3(credentials, { query, albumCount: 20 })
          .then(({ albums }) => navidrome.toAlbumSummary(albums)),
      searchTracks: async (query: string) =>
        navidrome
          .search3(credentials, { query, songCount: 20 })
          .then(({ songs }) =>
            Promise.all(
              songs.map((it) => navidrome.getTrack(credentials, it._id))
            )
          ),
      playlists: async () =>
        navidrome
          .getJSON<GetPlaylistsResponse>(credentials, "/rest/getPlaylists")
          .then((it) => it.playlists.playlist || [])
          .then((playlists) =>
            playlists.map((it) => ({ id: it._id, name: it._name }))
          ),
      playlist: async (id: string) =>
        navidrome
          .getJSON<GetPlaylistResponse>(credentials, "/rest/getPlaylist", {
            id,
          })
          .then((it) => it.playlist)
          .then((playlist) => {
            let trackNumber = 1;
            return {
              id: playlist._id,
              name: playlist._name,
              entries: (playlist.entry || []).map((entry) => ({
                id: entry._id,
                name: entry._title,
                mimeType: entry._contentType,
                duration: parseInt(entry._duration || "0"),
                number: trackNumber++,
                genre: maybeAsGenre(entry._genre),
                coverArt: maybeAsCoverArt(entry._coverArt),
                album: {
                  id: entry._albumId,
                  name: entry._album,
                  year: entry._year,
                  genre: maybeAsGenre(entry._genre),
                  artistName: entry._artist,
                  artistId: entry._artistId,
                  coverArt: maybeAsCoverArt(entry._coverArt)
                },
                artist: {
                  id: entry._artistId,
                  name: entry._artist,
                },
              })),
            };
          }),
      createPlaylist: async (name: string) =>
        navidrome
          .getJSON<GetPlaylistResponse>(credentials, "/rest/createPlaylist", {
            name,
          })
          .then((it) => it.playlist)
          .then((it) => ({ id: it._id, name: it._name })),
      deletePlaylist: async (id: string) =>
        navidrome
          .getJSON<GetPlaylistResponse>(credentials, "/rest/deletePlaylist", {
            id,
          })
          .then((_) => true),
      addToPlaylist: async (playlistId: string, trackId: string) =>
        navidrome
          .getJSON<GetPlaylistResponse>(credentials, "/rest/updatePlaylist", {
            playlistId,
            songIdToAdd: trackId,
          })
          .then((_) => true),
      removeFromPlaylist: async (playlistId: string, indicies: number[]) =>
        navidrome
          .getJSON<GetPlaylistResponse>(credentials, "/rest/updatePlaylist", {
            playlistId,
            songIndexToRemove: indicies,
          })
          .then((_) => true),
      similarSongs: async (id: string) =>
        navidrome
          .getJSON<GetSimilarSongsResponse>(
            credentials,
            "/rest/getSimilarSongs2",
            { id, count: 50 }
          )
          .then((it) => it.similarSongs2.song || [])
          .then((songs) =>
            Promise.all(
              songs.map((song) =>
                navidrome
                  .getAlbum(credentials, song._albumId)
                  .then((album) => asTrack(album, song))
              )
            )
          ),
      topSongs: async (artistId: string) =>
        navidrome.getArtist(credentials, artistId).then(({ name }) =>
          navidrome
            .getJSON<GetTopSongsResponse>(credentials, "/rest/getTopSongs", {
              artist: name,
              count: 50,
            })
            .then((it) => it.topSongs.song || [])
            .then((songs) =>
              Promise.all(
                songs.map((song) =>
                  navidrome
                    .getAlbum(credentials, song._albumId)
                    .then((album) => asTrack(album, song))
                )
              )
            )
        ),
    };

    return Promise.resolve(musicLibrary);
  }
}
