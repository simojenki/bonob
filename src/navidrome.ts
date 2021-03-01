import { Md5 } from "ts-md5/dist/md5";
import { Credentials, MusicService, Paging, Album, Artist } from "./music_service";
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

export type SubconicEnvelope = {
  "subsonic-response": SubsonicResponse;
};

export type SubsonicResponse = {
  _status: string;
};

export type GetArtistsResponse = SubsonicResponse & {
  artists: {
    index: {
      artist: { _id: string; _name: string; _albumCount: string }[];
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

export function isError(
  subsonicResponse: SubsonicResponse
): subsonicResponse is SubsonicError {
  return (subsonicResponse as SubsonicError).error !== undefined;
}

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
    this.get(credentials, "/rest/ping.view").then(() => ({
      authToken: Buffer.from(
        JSON.stringify(this.encryption.encrypt(JSON.stringify(credentials)))
      ).toString("base64"),
      userId: credentials.username,
      nickname: credentials.username,
    }));

  parseToken = (token: string): Credentials =>
    JSON.parse(
      this.encryption.decrypt(
        JSON.parse(Buffer.from(token, "base64").toString("ascii"))
      )
    );

  async login(token: string) {
    const navidrome = this;
    const credentials: Credentials = this.parseToken(token);
    return Promise.resolve({
      artists: ({ _index, _count }: Paging): Promise<[Artist[], number]> =>
        navidrome
          .get<GetArtistsResponse>(credentials, "/rest/getArtists")
          .then((it) => it.artists.index.flatMap((it) => it.artist))
          .then((artists) =>
            artists.map((it) => ({ id: it._id, name: it._name }))
          )
          .then((artists) => {
            const i0 = _index || 0;
            const i1 = _count ? i0 + _count : undefined;
            return [artists.slice(i0, i1), artists.length];
          }),
      artist: (id: string) => ({
        id,
        name: id,
      }),
      albums: ({
        artistId,
      }: {
        artistId?: string;
      } & Paging): Promise<[Album[], number]> => {
        console.log(artistId);
        return Promise.resolve([[], 0]);
      },
    });
  }
}
