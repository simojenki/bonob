import {
  AxiosPromise,
  AxiosRequestConfig,
  Method,
  ResponseType,
} from "axios";

export interface Http {
  (config: AxiosRequestConfig): AxiosPromise<any>;
}
export interface Http2 extends Http {
  with: (defaults: Partial<RequestParams>) => Http2;
}

export type RequestParams = {
  baseURL: string;
  url: string;
  params: any;
  headers: any;
  responseType: ResponseType;
  method: Method;
};

const wrap = (http2: Http2, defaults: Partial<RequestParams>): Http2 => {
  const f = ((config: AxiosRequestConfig) => http2(merge(defaults, config))) as Http2;
  f.with = (defaults: Partial<RequestParams>) => wrap(f, defaults);
  return f;
};

export const http2From = (http: Http): Http2 => {
  const f = ((config: AxiosRequestConfig) => http(config)) as Http2;
  f.with = (defaults: Partial<RequestParams>) => wrap(f, defaults);
  return f;
}

const merge = (
  defaults: Partial<RequestParams>,
  config: AxiosRequestConfig
) => {
  let toApply = {
    ...defaults,
    ...config,
  };
  if (defaults.params) {
    toApply = {
      ...toApply,
      params: {
        ...defaults.params,
        ...config.params,
      },
    };
  }
  if (defaults.headers) {
    toApply = {
      ...toApply,
      headers: {
        ...defaults.headers,
        ...config.headers,
      },
    };
  }
  return toApply;
};

export const http =
  (base: Http, defaults: Partial<RequestParams>): Http => (config: AxiosRequestConfig) => base(merge(defaults, config));
