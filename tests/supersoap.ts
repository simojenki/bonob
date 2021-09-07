import { Express } from "express";
import { ReadStream } from "fs";
import { IHttpClient } from "soap";
import request from "supertest";
import * as req from "axios";

function supersoap(server: Express): IHttpClient {
  return {
    request: (
      rurl: string,
      data: any,
      callback: (error: any, res?: any, body?: any) => any,
      exheaders?: any
    ) => {
      const url = new URL(rurl);
      const withoutHost = `${url.pathname}${url.search}`;
      const req =
        data == null
          ? request(server).get(withoutHost).send()
          : request(server).post(withoutHost).send(data);
      return req
        .set(exheaders || {})
        .then((response) => callback(null, response, response.text))
        .catch(callback);
    },

    requestStream: (
      _: string,
      _2: any
    ): req.AxiosPromise<ReadStream> => {
      throw "Not Implemented!!";
    },
  };
}

export default supersoap;
