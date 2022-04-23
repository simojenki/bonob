import { taskEither as TE } from "fp-ts";
import { pipe } from "fp-ts/lib/function";
import { Md5 } from "ts-md5/dist/md5";
import axios from "axios";
import randomstring from "randomstring";
import _ from "underscore";
// todo: rename http2 to http
import { Http, http as http2 } from "../http";

import {
  Credentials,
  MusicService,
  MusicLibrary,
  Track,
  AuthFailure,
} from "../music_service";
import { b64Encode, b64Decode } from "../b64";
import { axiosImageFetcher, ImageFetcher } from "../images";
import { navidromeMusicLibrary, SubsonicGenericMusicLibrary } from "./library";
import { getJSON  as getJSON2 } from "./subsonic_http";

export const t = (password: string, s: string) =>
  Md5.hashStr(`${password}${s}`);

export const t_and_s = (password: string) => {
  const s = randomstring.generate();
  return {
    t: t(password, s),
    s,
  };
};

// todo: this is an ND thing
export const DODGY_IMAGE_NAME = "2a96cbd8b46e442fc41c2b86b821562f.png";

export type SubsonicEnvelope = {
  "subsonic-response": SubsonicResponse;
};

export type SubsonicResponse = {
  status: string;
};

export type SubsonicError = SubsonicResponse & {
  error: {
    code: string;
    message: string;
  };
};

export type PingResponse = {
  status: string;
  version: string;
  type: string;
  serverVersion: string;
};

export function isError(
  subsonicResponse: SubsonicResponse
): subsonicResponse is SubsonicError {
  return (subsonicResponse as SubsonicError).error !== undefined;
}

// todo: is this a good name?
export type StreamClientApplication = (track: Track) => string;

export const DEFAULT_CLIENT_APPLICATION = "bonob";
export const USER_AGENT = "bonob";

export const DEFAULT: StreamClientApplication = (_: Track) =>
  DEFAULT_CLIENT_APPLICATION;

export function appendMimeTypeToClientFor(mimeTypes: string[]) {
  return (track: Track) =>
    mimeTypes.includes(track.mimeType) ? `bonob+${track.mimeType}` : "bonob";
}

export type SubsonicCredentials = Credentials & {
  type: string;
  bearer: string | undefined;
};

export const asToken = (credentials: SubsonicCredentials) =>
  b64Encode(JSON.stringify(credentials));

export const parseToken = (token: string): SubsonicCredentials =>
  JSON.parse(b64Decode(token));

export interface SubsonicMusicLibrary extends MusicLibrary {
  flavour(): string;
  bearerToken(
    credentials: Credentials
  ): TE.TaskEither<Error, string | undefined>;
}

export class Subsonic implements MusicService {
  url: string;

  // todo: does this need to be in here now?
  streamClientApplication: StreamClientApplication;
  // todo: why is this in here?
  externalImageFetcher: ImageFetcher;

  base: Http;

  constructor(
    url: string,
    streamClientApplication: StreamClientApplication = DEFAULT,
    externalImageFetcher: ImageFetcher = axiosImageFetcher
  ) {
    this.url = url;
    this.streamClientApplication = streamClientApplication;
    this.externalImageFetcher = externalImageFetcher;
    this.base = http2(axios, {
      baseURL: this.url,
      params: { v: "1.16.1", c: DEFAULT_CLIENT_APPLICATION },
      headers: { "User-Agent": "bonob" },
    });
  }

  authenticated = (credentials: Credentials, wrap: Http = this.base) =>
    http2(wrap, {
      params: {
        u: credentials.username,
        ...t_and_s(credentials.password),
      },
    });

  getJSON = async <T>(
    credentials: Credentials,
    url: string,
    params: {} = {}
  ): Promise<T> => getJSON2(http2(this.authenticated(credentials), { url, params }));

  generateToken = (credentials: Credentials) =>
    pipe(
      TE.tryCatch(
        () => getJSON2<PingResponse>(http2(this.authenticated(credentials), { url: "/rest/ping.view" })),
        (e) => new AuthFailure(e as string)
      ),
      TE.chain(({ type }) =>
        pipe(
          TE.tryCatch(
            () => this.libraryFor({ ...credentials, type, bearer: undefined }),
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

  login = async (token: string) => this.libraryFor(parseToken(token));

  private libraryFor = (
    credentials: SubsonicCredentials
  ): Promise<SubsonicMusicLibrary> => {
    const subsonicGenericLibrary = new SubsonicGenericMusicLibrary(
      this.streamClientApplication,
      this.authenticated(credentials, this.base)
    );
    if (credentials.type == "navidrome") {
      return Promise.resolve(
        navidromeMusicLibrary(this.url, subsonicGenericLibrary, credentials)
      );
    } else {
      return Promise.resolve(subsonicGenericLibrary);
    }
  };
}

export default Subsonic;
