import getPort from "get-port";
import { createClientAsync } from "soap";

import sonos, { bonobService } from "../src/sonos";
import server from "../src/server";

import logger from "../src/logger";

const bonob = bonobService("bonob-test", 247, "http://localhost:1234");
const app = server(sonos("disabled"), bonob);

getPort().then((port) => {
  logger.debug(`Starting on port ${port}`);
  app.listen(port);

  createClientAsync(`http://localhost:${port}/ws?wsdl`, {
    endpoint: `http://localhost:${port}/ws`,
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
