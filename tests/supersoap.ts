import { Express } from "express";
import request from "supertest";

function supersoap(server: Express, rootUrl: string) {
  return {
    request: (
      rurl: string,
      data: any,
      callback: (error: any, res?: any, body?: any) => any,
      exheaders?: any
    ) => {
      const withoutHost = rurl.replace(rootUrl, "");
      const req =
        data == null
          ? request(server).get(withoutHost).send()
          : request(server).post(withoutHost).send(data);
      req
        .set(exheaders || {})
        .then((response) => callback(null, response, response.text))
        .catch(callback);
    },
  }
}

export default supersoap