import makeServer from "../src/server";
import { SONOS_DISABLED, SOAP_PATH } from "../src/sonos";

import { aService, InMemoryMusicService } from "./builders";
import supersoap from './supersoap';

import { createClientAsync } from "soap";

describe("ws", () => {
  describe("can call getSessionId", () => {
    it("should do something", async () => {
      const WEB_ADDRESS = 'http://localhost:7653'
      const server = makeServer(SONOS_DISABLED, aService(), WEB_ADDRESS, new InMemoryMusicService());

      const { username, sessionId } = await createClientAsync(
        `${WEB_ADDRESS}${SOAP_PATH}?wsdl`,
        {
          endpoint: `${WEB_ADDRESS}${SOAP_PATH}`,
          httpClient: supersoap(server, WEB_ADDRESS),
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
