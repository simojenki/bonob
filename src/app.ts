import sonos, { bonobService } from "./sonos";
import server from "./server";
import logger from "./logger";
import { DEFAULT, Navidrome, appendMimeTypeToClientFor } from "./navidrome";
import encryption from "./encryption";
import { InMemoryAccessTokens, sha256 } from "./access_tokens";
import { InMemoryLinkCodes } from "./link_codes";

const PORT = +(process.env["BONOB_PORT"] || 4534);
const WEB_ADDRESS =
  process.env["BONOB_WEB_ADDRESS"] || `http://localhost:${PORT}`;

const SONOS_DEVICE_DISCOVERY =
  (process.env["BONOB_SONOS_DEVICE_DISCOVERY"] || "true") == "true";
const SONOS_SEED_HOST = process.env["BONOB_SONOS_SEED_HOST"];

const bonob = bonobService(
  process.env["BONOB_SONOS_SERVICE_NAME"] || "bonob",
  Number(process.env["BONOS_SONOS_SERVICE_ID"] || "246"),
  WEB_ADDRESS,
  "AppLink"
);
const secret = process.env["BONOB_SECRET"] || "bonob";

const sonosSystem = sonos(SONOS_DEVICE_DISCOVERY, SONOS_SEED_HOST);
if (process.env["BONOB_SONOS_AUTO_REGISTER"] == "true") {
  sonosSystem.register(bonob).then((success) => {
    if (success) {
      logger.info(
        `Successfully registered ${bonob.name}(SID:${bonob.sid}) with sonos`
      );
    }
  });
}

const customClientsFor = process.env["BONOB_NAVIDROME_CUSTOM_CLIENTS"] || "none";
const streamUserAgent =
customClientsFor == "none" ? DEFAULT : appendMimeTypeToClientFor(customClientsFor.split(","));

const app = server(
  sonosSystem,
  bonob,
  WEB_ADDRESS,
  new Navidrome(
    process.env["BONOB_NAVIDROME_URL"] || "http://localhost:4533",
    encryption(secret),
    streamUserAgent
  ),
  new InMemoryLinkCodes(),
  new InMemoryAccessTokens(sha256(secret))
);

app.listen(PORT, () => {
  logger.info(`Listening on ${PORT} available @ ${WEB_ADDRESS}`);
});

export default app;
