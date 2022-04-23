import { AxiosPromise, AxiosRequestConfig, ResponseType } from "axios";
import _ from "underscore";

export interface RequestModifier {
  (config: AxiosRequestConfig): AxiosRequestConfig;
}

export const no_op = (config: AxiosRequestConfig) => config;

export interface Http {
  (config: AxiosRequestConfig): AxiosPromise<any>;
}

// export const http =
//   (base: Http = axios, modifier: RequestModifier = no_op): Http =>
//   (config: AxiosRequestConfig) => {
//     console.log(
//       `applying ${JSON.stringify(config)} onto ${JSON.stringify(modifier)}`
//     );
//     const result = modifier(config);
//     console.log(`result is ${JSON.stringify(result)}`);
//     return base(result);
//   };

// export const chain =
//   (...modifiers: RequestModifier[]): RequestModifier =>
//   (config: AxiosRequestConfig) =>
//     modifiers.reduce(
//       (config: AxiosRequestConfig, next: RequestModifier) => next(config),
//       config
//     );

// export const baseUrl = (baseURL: string) => (config: AxiosRequestConfig) => ({
//   ...config,
//   baseURL,
// });

// export const axiosConfig =
//   (additionalConfig: Partial<AxiosRequestConfig>) =>
//   (config: AxiosRequestConfig) => ({ ...config, ...additionalConfig });

// export const params = (params: any) => (config: AxiosRequestConfig) => {
//   console.log(
//     `params on config ${JSON.stringify(
//       config.params
//     )}, params applying ${JSON.stringify(params)}`
//   );
//   const after = { ...config, params: { ...config.params, ...params } };
//   console.log(`params after ${JSON.stringify(after.params)}`);
//   return after;
// };

// export const headers = (headers: any) => (config: AxiosRequestConfig) => ({
//   ...config,
//   headers: { ...config.headers, ...headers },
// });
// export const formatJson = (): RequestModifier => (config: AxiosRequestConfig) => ({...config, params: { ...config.params, f: 'json' } });
// export const subsonicAuth = (credentials: { username: string, password: string}) => (config: AxiosRequestConfig) => ({...config, params: { ...config.params, u: credentials.username, ...t_and_s(credentials.password) } });

export type RequestParams = { baseURL: string; url: string, params: any, headers: any, responseType: ResponseType }

// todo: rename to http
export const http2 =
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
