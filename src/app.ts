import path from "path";
import fs from "fs";
import server from "./server";
import logger from "./logger";
import { appendMimeTypeToClientFor, DEFAULT, Navidrome } from "./navidrome";
import encryption from "./encryption";
import { InMemoryAccessTokens, sha256 } from "./access_tokens";
import { InMemoryLinkCodes } from "./link_codes";
import readConfig from "./config";
import sonos, { bonobService } from "./sonos";
import { MusicService } from "./music_service";
import { SystemClock } from "./clock";

const config = readConfig();

logger.info(`Starting bonob with config ${JSON.stringify(config)}`);

const bonob = bonobService(
  config.sonos.serviceName,
  config.sonos.sid,
  config.bonobUrl,
  "AppLink"
);

const sonosSystem = sonos(config.sonos.discovery);

const streamUserAgent = config.navidrome.customClientsFor
  ? appendMimeTypeToClientFor(config.navidrome.customClientsFor.split(","))
  : DEFAULT;

const navidrome = new Navidrome(
  config.navidrome.url,
  encryption(config.secret),
  streamUserAgent
);

const featureFlagAwareMusicService: MusicService = {
  generateToken: navidrome.generateToken,
  login: (authToken: string) =>
    navidrome.login(authToken).then((library) => {
      return {
        ...library,
        scrobble: (id: string) => {
          if (config.scrobbleTracks) return library.scrobble(id);
          else {
            logger.info("Track Scrobbling not enabled");
            return Promise.resolve(true);
          }
        },
        nowPlaying: (id: string) => {
          if (config.reportNowPlaying) return library.nowPlaying(id);
          else {
            logger.info("Reporting track now playing not enabled");
            return Promise.resolve(true);
          }
        },
      };
    }),
};

export const GIT_INFO = path.join(__dirname, "..", ".gitinfo");

const version = fs.existsSync(GIT_INFO) ? fs.readFileSync(GIT_INFO).toString().trim() : "v??"

const app = server(
  sonosSystem,
  bonob,
  config.bonobUrl,
  featureFlagAwareMusicService,
  {
    linkCodes: () => new InMemoryLinkCodes(),
    accessTokens: () =>  new InMemoryAccessTokens(sha256(config.secret)),
    clock: SystemClock,
    iconColors: config.icons,
    applyContextPath: true,
    logRequests: true,
    version
  }
);

app.listen(config.port, () => {
  logger.info(`Listening on ${config.port} available @ ${config.bonobUrl}`);
});

if (config.sonos.autoRegister) {
  sonosSystem.register(bonob).then((success) => {
    if (success) {
      logger.info(
        `Successfully registered ${bonob.name}(SID:${bonob.sid}) with sonos`
      );
    }
  });
} else if(config.sonos.discovery.enabled) {
  sonosSystem.devices().then(devices => {
    devices.forEach(d => {
      logger.info(`Found device ${d.name}(${d.group}) @ ${d.ip}:${d.port}`)
    })
  })
}

export default app;
