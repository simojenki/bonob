import { Md5 } from "ts-md5/dist/md5";
import { Credentials, MusicService } from "./music_service";
import X2JS from "x2js";

import axios from "axios";
import { Encryption } from "./encryption";
import randomString from "./random_string";

export const t = (password: string, s: string) =>
  Md5.hashStr(`${password}${s}`);

export type SubconicEnvelope = {
  "subsonic-response": SubsonicResponse;
};

export type SubsonicResponse = {
  _status: string;
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

  get = async (
    { username, password }: Credentials,
    path: string,
    q: {} = {}
  ): Promise<SubsonicResponse> => {
    const s = randomString();
    return axios
      .get(`${this.url}${path}`, {
        params: {
          ...q,
          u: username,
          t: t(password, s),
          s: s,
          v: "1.16.1",
          c: "bonob",
        },
      })
      .then((response) => new X2JS().xml2js(response.data) as SubconicEnvelope)
      .then((json) => json["subsonic-response"]);
  };

  generateToken = async (credentials: Credentials) => {
    return this.get(credentials, "/rest/ping.view")
      .then((json) => {
        if (isError(json)) throw json.error._message;
        else return json;
      })
      .then((_) => {
        return {
          authToken: Buffer.from(
            JSON.stringify(this.encryption.encrypt(JSON.stringify(credentials)))
          ).toString("base64"),
          userId: credentials.username,
          nickname: credentials.username,
        };
      });
  };

  parseToken = (token: string): Credentials =>
    JSON.parse(
      this.encryption.decrypt(
        JSON.parse(Buffer.from(token, "base64").toString("ascii"))
      )
    );

  async login(_: string) {
    // const credentials: Credentials = this.parseToken(token);
    return Promise.resolve({
      artists: () => [],
      artist: (id: string) => ({
        id,
        name: id,
      }),
      albums: ({ artistId }: { artistId?: string }) => {
        console.log(artistId);
        return [];
      },
    });
  }
}
