import request from "supertest";
import makeServer from "../src/server";
import { SONOS_DISABLED } from "../src/sonos";

import { aService } from "./builders";

import { createClientAsync } from "soap";

describe("ws", () => {
  describe("can call getSessionId", () => {
    it("should do something", async () => {
      const server = makeServer(SONOS_DISABLED, aService());

      const { username, sessionId } = await createClientAsync(
        `http://localhost/ws?wsdl`,
        {
          endpoint: `http://localhost/ws`,
          httpClient: {
            request: (
              rurl: string,
              data: any,
              callback: (error: any, res?: any, body?: any) => any,
              exheaders?: any
            ) => {
              const withoutHost = rurl.replace("http://localhost", "");
              const req =
                data == null
                  ? request(server).get(withoutHost).send()
                  : request(server).post(withoutHost).send(data);
              req
                .set(exheaders || {})
                .then((response) => callback(null, response, response.text))
                .catch(callback);
            },
          },
        }
      ).then((client) =>
        client
          .getSessionIdAsync({ username: "bob", password: "foo" })
          .then(
            ([{ username, sessionId }]: [
              { username: string; sessionId: string }
            ]) => ({
              username,
              sessionId,
            })
          )
      );

      expect(username).toEqual("bob");
      expect(sessionId).toEqual("123");
    });
  });
});
