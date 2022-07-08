import { AxiosResponse } from "axios";
import { isError, SubsonicEnvelope } from ".";
// todo: rename http2 to http
import { Http2, RequestParams } from "../http";

export type HttpResponse = {
  data: any;
  status: number;
  headers: any;
};

const asJSON = <T>(response: HttpResponse): T => {
  const subsonicResponse = (response.data as SubsonicEnvelope)[
    "subsonic-response"
  ];
  if (isError(subsonicResponse))
    throw `Subsonic error:${subsonicResponse.error.message}`;
  else return subsonicResponse as unknown as T;
};
const throwUp = (error: any) => {
  throw `Subsonic failed with: ${error}`;
};
const verifyResponse = (response: AxiosResponse<any>) => {
  if (response.status != 200 && response.status != 206) {
    throw `Subsonic failed with a ${response.status || "no!"} status`;
  } else return response;
};

export interface SubsonicHttpResponse {
  asRaw(): Promise<AxiosResponse<any>>;
  asJSON<T>(): Promise<T>;
}

export interface SubsonicHttp {
  (query: Partial<RequestParams>): SubsonicHttpResponse;
}

export const client = (http: Http2): SubsonicHttp => {
  return (query: Partial<RequestParams>): SubsonicHttpResponse => {
    return {
      asRaw: () => http(query).catch(throwUp).then(verifyResponse),

      asJSON: <T>() =>
        http
          .with({ params: { f: "json" } })(query)
          .catch(throwUp)
          .then(verifyResponse)
          .then(asJSON) as Promise<T>,
    };
  };
};
