import { Md5 } from "ts-md5/dist/md5";
import {
  Credentials,
  MusicService,
  Album,
  Artist,
  ArtistSummary,
  Result,
  slice2,
  asResult,
  AlbumQuery,
  ArtistQuery,
  MusicLibrary,
  Images,
} from "./music_service";
import X2JS from "x2js";

import axios from "axios";
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
  _coverArt: string;
};

export type artist = {
  _id: string;
  _name: string;
  _albumCount: string;
  _artistImageUrl: string | undefined;
  album: album[];
};

export type GetArtistsResponse = SubsonicResponse & {
  artists: {
    index: {
      artist: artist[];
      _name: string;
    }[];
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

export type GetArtistInfoResponse = {
  artistInfo: artistInfo;
};

export type GetArtistResponse = {
  artist: artist;
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

export class Navidrome implements MusicService {
  url: string;
  encryption: Encryption;

  constructor(url: string, encryption: Encryption) {
    this.url = url;
    this.encryption = encryption;
  }

  get = async <T>(
    { username, password }: Credentials,
    path: string,
    q: {} = {}
  ): Promise<T> =>
    axios
      .get(`${this.url}${path}`, {
        params: {
          ...q,
          u: username,
          ...t_and_s(password),
          v: "1.16.1",
          c: "bonob",
        },
      })
      .then((response) => new X2JS().xml2js(response.data) as SubconicEnvelope)
      .then((json) => json["subsonic-response"])
      .then((json) => {
        if (isError(json)) throw json.error._message;
        else return (json as unknown) as T;
      });

  generateToken = async (credentials: Credentials) =>
    this.get(credentials, "/rest/ping.view")
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
    this.get<GetArtistsResponse>(credentials, "/rest/getArtists")
      .then((it) => it.artists.index.flatMap((it) => it.artist || []))
      .then((artists) =>
        artists.map((artist) => ({
          id: artist._id,
          name: artist._name,
        }))
      );

  getArtistInfo = (credentials: Credentials, id: string): Promise<ArtistInfo> =>
    this.get<GetArtistInfoResponse>(credentials, "/rest/getArtistInfo", {
      id,
    }).then((it) => ({
      image: {
        small: it.artistInfo.smallImageUrl,
        medium: it.artistInfo.mediumImageUrl,
        large: it.artistInfo.largeImageUrl,
      },
    }));

  getArtist = (
    credentials: Credentials,
    id: string
  ): Promise<IdName & { albums: Album[] }> =>
    this.get<GetArtistResponse>(credentials, "/rest/getArtist", {
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
          .then(asResult)
          .then((result) =>
            Promise.all(
              result.results.map((idName: IdName) =>
                navidrome
                  .getArtistInfo(credentials, idName.id)
                  .then((artistInfo) => ({
                    total: result.total,
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
      albums: (_: AlbumQuery): Promise<Result<Album>> => {
        return Promise.resolve({ results: [], total: 0 });
      },
    };

    return Promise.resolve(musicLibrary);
  }
}
