import getPort from "get-port";
import { createClientAsync } from "soap";

import sonos, { bonobService } from "../src/sonos";
import server from "../src/server";

import logger from "../src/logger";
import { InMemoryMusicService } from "./in_memory_music_service";

const WEB_ADDRESS = "http://localhost:1234"

const bonob = bonobService("bonob-test", 247, WEB_ADDRESS, 'Anonymous');
const app = server(sonos(false), bonob, WEB_ADDRESS, new InMemoryMusicService());

getPort().then((port) => {
  logger.debug(`Starting on port ${port}`);
  app.listen(port);

  createClientAsync(`${bonob.uri}?wsdl`, {
    endpoint: bonob.uri,
  }).then((client) => {
    client
      .getSessionIdAsync(
        { username: "bob", password: "foo" }
      )
      .then(
        ([{ username, sessionId }]: [
          { username: string; sessionId: string }
        ]) => {
          console.log(`${username} has sessionId=${sessionId}`);
        }
      );

    console.log(`done`);
  });
});
