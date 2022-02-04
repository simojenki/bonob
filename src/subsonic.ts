import { taskEither as TE } from "fp-ts";
import { pipe } from "fp-ts/lib/function";
import { Md5 } from "ts-md5/dist/md5";
import {
  Credentials,
  MusicService,
  MusicLibrary,
  Track,
  AuthFailure,
  Sortable,
  ArtistSummary,
} from "./music_service";
import _ from "underscore";

import axios, { AxiosRequestConfig } from "axios";
import randomstring from "randomstring";
import { b64Encode, b64Decode } from "./b64";
import { axiosImageFetcher, ImageFetcher } from "./images";
import { asURLSearchParams } from "./utils";
import { artistImageURN, NaivdromeMusicLibrary, SubsonicGenericMusicLibrary } from "./subsonic/generic";

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



type SubsonicEnvelope = {
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

export type NDArtist = {
  id: string;
  name: string;
  orderArtistName: string | undefined;
  largeImageUrl: string | undefined;
};



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

export const artistSummaryFromNDArtist = (
  artist: NDArtist
): ArtistSummary & Sortable => ({
  id: artist.id,
  name: artist.name,
  sortName: artist.orderArtistName || artist.name,
  image: artistImageURN({
    artistId: artist.id,
    artistImageURL: artist.largeImageUrl,
  }),
});

export class Subsonic implements MusicService {
  url: string;
  streamClientApplication: StreamClientApplication;
  // todo: why is this in here?
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
    if (credentials.type == "navidrome") {
      return Promise.resolve(new NaivdromeMusicLibrary(this, credentials));
    } else {
      return Promise.resolve(new SubsonicGenericMusicLibrary(this, credentials));
    }
  };
}

export default Subsonic;
