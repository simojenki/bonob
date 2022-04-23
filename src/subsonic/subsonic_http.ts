import {
  isError,
  SubsonicEnvelope,
} from ".";
// todo: rename http2 to http
import { Http, http as http2 } from "../http";

export type HttpResponse = {
  data: any;
  status: number;
  headers: any;
};

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


