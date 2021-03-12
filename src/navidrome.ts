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
  NO_IMAGES,
} from "./music_service";
import X2JS from "x2js";

import axios, { AxiosRequestConfig } from "axios";
import { Encryption } from "./encryption";
import randomString from "./random_string";

export const t = (password: string, s: string) =>
  Md5.hashStr(`${password}${s}`);

export const t_and_s = (password: string) => {
  const s = randomString();
  return {
    t: t(password, s),
    s,
  };
};

export const isDodgyImage = (url: string) =>
  url.endsWith("2a96cbd8b46e442fc41c2b86b821562f.png");

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
  albumList: {
    album: album[];
  };
};

export type genre = {
  _songCount: string;
  _albumCount: string;
  __text: string;
};

export type GenGenresResponse = SubsonicResponse & {
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
};

export type ArtistInfo = {
  image: Images;
};

export type GetArtistInfoResponse = SubsonicResponse & {
  artistInfo: artistInfo;
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
  _coverArt: string;
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

export type GetSongResponse = {
  song: song;
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

export type getAlbumListParams = {
  type: string;
  size?: number;
  offet?: number;
  fromYear?: string;
  toYear?: string;
  genre?: string;
};

const MAX_ALBUM_LIST = 500;

const asTrack = (album: Album, song: song) => ({
  id: song._id,
  name: song._title,
  mimeType: song._contentType,
  duration: parseInt(song._duration || "0"),
  number: parseInt(song._track || "0"),
  genre: song._genre,
  album,
  artist: {
    id: song._artistId,
    name: song._artist,
    image: NO_IMAGES,
  },
});

const asAlbum = (album: album) => ({
  id: album._id,
  name: album._name,
  year: album._year,
  genre: album._genre,
});

export class Navidrome implements MusicService {
  url: string;
  encryption: Encryption;

  constructor(url: string, encryption: Encryption) {
    this.url = url;
    this.encryption = encryption;
  }

  get = async (
    { username, password }: Credentials,
    path: string,
    q: {} = {},
    config: AxiosRequestConfig | undefined = {}
  ) =>
    axios
      .get(`${this.url}${path}`, {
        params: {
          ...q,
          u: username,
          ...t_and_s(password),
          v: "1.16.1",
          c: "bonob",
        },
        headers: {
          "User-Agent": "bonob",
        },
        ...config,
      })
      .then((response) => {
        if (response.status != 200 && response.status != 206)
          throw `Navidrome failed with a ${response.status}`;
        else return response;
      });

  getJSON = async <T>(
    { username, password }: Credentials,
    path: string,
    q: {} = {}
  ): Promise<T> =>
    this.get({ username, password }, path, q)
      .then((response) => new X2JS().xml2js(response.data) as SubconicEnvelope)
      .then((json) => json["subsonic-response"])
      .then((json) => {
        if (isError(json)) throw json.error._message;
        else return (json as unknown) as T;
      });

  generateToken = async (credentials: Credentials) =>
    this.getJSON(credentials, "/rest/ping.view")
      .then(() => ({
        authToken: Buffer.from(
          JSON.stringify(this.encryption.encrypt(JSON.stringify(credentials)))
        ).toString("base64"),
        userId: credentials.username,
        nickname: credentials.username,
      }))
      .catch((e) => ({ message: `${e}` }));

  parseToken = (token: string): Credentials =>
    JSON.parse(
      this.encryption.decrypt(
        JSON.parse(Buffer.from(token, "base64").toString("ascii"))
      )
    );

  getArtists = (credentials: Credentials): Promise<IdName[]> =>
    this.getJSON<GetArtistsResponse>(credentials, "/rest/getArtists")
      .then((it) => it.artists.index.flatMap((it) => it.artist || []))
      .then((artists) =>
        artists.map((artist) => ({
          id: artist._id,
          name: artist._name,
        }))
      );

  getArtistInfo = (credentials: Credentials, id: string): Promise<ArtistInfo> =>
    this.getJSON<GetArtistInfoResponse>(credentials, "/rest/getArtistInfo", {
      id,
    }).then((it) => ({
      image: {
        small: it.artistInfo.smallImageUrl,
        medium: it.artistInfo.mediumImageUrl,
        large: it.artistInfo.largeImageUrl,
      },
    }));

  getAlbum = (credentials: Credentials, id: string): Promise<Album> =>
    this.getJSON<GetAlbumResponse>(credentials, "/rest/getAlbum", { id })
      .then((it) => it.album)
      .then((album) => ({
        id: album._id,
        name: album._name,
        year: album._year,
        genre: album._genre,
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
        albums: it.album.map((album) => ({
          id: album._id,
          name: album._name,
          year: album._year,
          genre: album._genre,
        })),
      }));

  async login(token: string) {
    const navidrome = this;
    const credentials: Credentials = this.parseToken(token);

    const musicLibrary: MusicLibrary = {
      artists: (q: ArtistQuery): Promise<Result<ArtistSummary>> =>
        navidrome
          .getArtists(credentials)
          .then(slice2(q))
          .then(([page, total]) =>
            Promise.all(
              page.map((idName: IdName) =>
                navidrome
                  .getArtistInfo(credentials, idName.id)
                  .then((artistInfo) => ({
                    total,
                    result: {
                      id: idName.id,
                      name: idName.name,
                      image: artistInfo.image,
                    },
                  }))
              )
            )
          )
          .then((resultWithInfo) => {
            return {
              total: resultWithInfo[0]?.total || 0,
              results: resultWithInfo.map((it) => it.result),
            };
          }),
      artist: async (id: string): Promise<Artist> =>
        Promise.all([
          navidrome.getArtist(credentials, id),
          navidrome.getArtistInfo(credentials, id),
        ]).then(([artist, artistInfo]) => ({
          id: artist.id,
          name: artist.name,
          image: artistInfo.image,
          albums: artist.albums,
        })),
      albums: (q: AlbumQuery): Promise<Result<AlbumSummary>> => {
        const p = pipe(
          O.fromNullable(q.genre),
          O.map<string, getAlbumListParams>((genre) => ({
            type: "byGenre",
            genre,
          })),
          O.getOrElse<getAlbumListParams>(() => ({
            type: "alphabeticalByArtist",
          }))
        );

        return navidrome
          .getJSON<GetAlbumListResponse>(credentials, "/rest/getAlbumList", {
            ...p,
            size: MAX_ALBUM_LIST,
            offset: 0,
          })
          .then((response) => response.albumList.album)
          .then((albumList) =>
            albumList.map((album) => ({
              id: album._id,
              name: album._name,
              year: album._year,
              genre: album._genre,
            }))
          )
          .then(slice2(q))
          .then(([page, total]) => ({
            results: page,
            total: Math.min(MAX_ALBUM_LIST, total),
          }));
      },
      album: (id: string): Promise<Album> =>
        navidrome.getAlbum(credentials, id),
      genres: () =>
        navidrome
          .getJSON<GenGenresResponse>(credentials, "/rest/getGenres")
          .then((it) =>
            pipe(
              it.genres.genre,
              A.map((it) => it.__text),
              A.sort(ordString)
            )
          ),
      tracks: (albumId: string) =>
        navidrome
          .getJSON<GetAlbumResponse>(credentials, "/rest/getAlbum", {
            id: albumId,
          })
          .then((it) => it.album)
          .then((album) =>
            album.song.map((song) => asTrack(asAlbum(album), song))
          ),
      track: (trackId: string) =>
        navidrome
          .getJSON<GetSongResponse>(credentials, "/rest/getSong", {
            id: trackId,
          })
          .then((it) => it.song)
          .then((song) =>
            navidrome
              .getAlbum(credentials, song._albumId)
              .then((album) => asTrack(album, song))
          ),
      stream: async ({
        trackId,
        range,
      }: {
        trackId: string;
        range: string | undefined;
      }) =>
        navidrome
          .get(
            credentials,
            `/rest/stream`,
            { id: trackId },
            {
              headers: pipe(
                range,
                O.fromNullable,
                O.map((range) => ({
                  "User-Agent": "bonob",
                  Range: range,
                })),
                O.getOrElse(() => ({
                  "User-Agent": "bonob",
                }))
              ),
              responseType: "arraybuffer",
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
            data: Buffer.from(res.data, "binary"),
          })),
      coverArt: async (id: string, size?: number) =>
        navidrome
          .get(
            credentials,
            "/rest/getCoverArt",
            { id, size },
            {
              headers: { "User-Agent": "bonob" },
              responseType: "arraybuffer",
            }
          )
          .then((res) => ({
            contentType: res.headers["content-type"],
            data: Buffer.from(res.data, "binary"),
          })),
    };

    return Promise.resolve(musicLibrary);
  }
}
