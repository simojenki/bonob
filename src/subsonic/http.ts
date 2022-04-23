import axios, { AxiosPromise, AxiosRequestConfig } from "axios";
import {
  DEFAULT_CLIENT_APPLICATION,
  isError,
  SubsonicEnvelope,
  t_and_s,
  USER_AGENT,
} from ".";
import { Http, http2 } from "../http";
import { Credentials } from "../music_service";
import { asURLSearchParams } from "../utils";

export const http = (base: string, credentials: Credentials): HTTP => ({
  get: async (
    path: string,
    params: Partial<{ q: {}; config: AxiosRequestConfig | undefined }>
  ) =>
    axios
      .get(`${base}${path}`, {
        params: asURLSearchParams({
          u: credentials.username,
          v: "1.16.1",
          c: DEFAULT_CLIENT_APPLICATION,
          ...t_and_s(credentials.password),
          f: "json",
          ...(params.q || {}),
        }),
        headers: {
          "User-Agent": USER_AGENT,
        },
        ...(params.config || {}),
      })
      .catch((e) => {
        throw `Subsonic failed with: ${e}`;
      })
      .then((response) => {
        if (response.status != 200 && response.status != 206) {
          throw `Subsonic failed with a ${response.status || "no!"} status`;
        } else return response;
      }),
});

export type HttpResponse = {
  data: any;
  status: number;
  headers: any;
};

export interface HTTP {
  get(
    path: string,
    params: Partial<{ q: {}; config: AxiosRequestConfig | undefined }>
  ): Promise<HttpResponse>;
}

// export const basic = (opts : AxiosRequestConfig) => axios(opts);

// function whatDoesItLookLike() {
//   const basic = axios;

//   const authenticatedClient = httpee(axios, chain(
//     baseUrl("http://foobar"),
//     subsonicAuth({username: 'bob', password: 'foo'})
//   ));
//   const jsonClient = httpee(authenticatedClient, formatJson())

//   jsonClient({ })

// }

// .then((response) => response.data as SubsonicEnvelope)
//       .then((json) => json["subsonic-response"])
//       .then((json) => {
//         if (isError(json)) throw `Subsonic error:${json.error.message}`;
//         else return json as unknown as T;
//       });

export const raw = (response: AxiosPromise<any>) =>
  response
    .catch((e) => {
      throw `Subsonic failed with: ${e}`;
    })
    .then((response) => {
      if (response.status != 200 && response.status != 206) {
        throw `Subsonic failed with a ${response.status || "no!"} status`;
      } else return response;
    });

    // todo: delete
export const getRaw2 = (http: Http) => 
  http({ method: "get" })
    .catch((e) => {
      throw `Subsonic failed with: ${e}`;
    })
    .then((response) => {
      if (response.status != 200 && response.status != 206) {
        throw `Subsonic failed with a ${response.status || "no!"} status`;
      } else return response;
    });

export const getJSON = async <T>(http: Http): Promise<T> =>
  getRaw2(http2(http, { params: { f: "json" } })).then(asJSON) as Promise<T>;

export const asJSON = <T>(response: HttpResponse): T => {
  const subsonicResponse = (response.data as SubsonicEnvelope)[
    "subsonic-response"
  ];
  if (isError(subsonicResponse))
    throw `Subsonic error:${subsonicResponse.error.message}`;
  else return subsonicResponse as unknown as T;
};

export default http;
