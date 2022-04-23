import { AxiosPromise, AxiosRequestConfig, ResponseType } from "axios";
import _ from "underscore";

export interface RequestModifier {
  (config: AxiosRequestConfig): AxiosRequestConfig;
}

export const no_op = (config: AxiosRequestConfig) => config;

export interface Http {
  (config: AxiosRequestConfig): AxiosPromise<any>;
}

export type RequestParams = { baseURL: string; url: string, params: any, headers: any, responseType: ResponseType }

// todo: rename to http
export const http =
  (base: Http, defaults: Partial<RequestParams>): Http =>
  (config: AxiosRequestConfig) => {
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
    return base(toApply);
  };
