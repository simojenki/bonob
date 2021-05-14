import server from "./server";
import logger from "./logger";
import { appendMimeTypeToClientFor, DEFAULT, Navidrome } from "./navidrome";
import encryption from "./encryption";
import { InMemoryAccessTokens, sha256 } from "./access_tokens";
import { InMemoryLinkCodes } from "./link_codes";
import config from "./config";
import sonos, { bonobService } from "./sonos";

logger.info(
  `Starting bonob with config ${JSON.stringify(config)}`
);

const bonob = bonobService(
  config.sonos.serviceName,
  config.sonos.sid,
  config.webAddress,
  "AppLink"
);

const sonosSystem = sonos(config.sonos.deviceDiscovery, config.sonos.seedHost);

const streamUserAgent = config.navidrome.customClientsFor ? appendMimeTypeToClientFor(config.navidrome.customClientsFor.split(",")) : DEFAULT;

const app = server(
  sonosSystem,
  bonob,
  config.webAddress,
  new Navidrome(
    config.navidrome.url,
    encryption(config.secret),
    streamUserAgent
  ),
  new InMemoryLinkCodes(),
  new InMemoryAccessTokens(sha256(config.secret))
);

if (config.sonos.autoRegister) {
  sonosSystem.register(bonob).then((success) => {
    if (success) {
      logger.info(
        `Successfully registered ${bonob.name}(SID:${bonob.sid}) with sonos`
      );
    }
  });
}

app.listen(config.port, () => {
  logger.info(`Listening on ${config.port} available @ ${config.webAddress}`);
});

export default app;
