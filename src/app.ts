import path from "path";
import fs from "fs";
import server from "./server";
import logger from "./logger";

import {
  axiosImageFetcher,
  cachingImageFetcher,
  Subsonic,
  TranscodingCustomPlayers,
  NO_CUSTOM_PLAYERS
} from "./subsonic";
import { InMemoryAPITokens, sha256 } from "./api_tokens";
import { InMemoryLinkCodes } from "./link_codes";
import readConfig from "./config";
import sonos, { bonobService } from "./sonos";
import { MusicService } from "./music_service";
import { SystemClock } from "./clock";
import { JWTSmapiLoginTokens } from "./smapi_auth";
import * as Minio from 'minio'
import { PersistentTokenStore, NoopPersistentTokenStore } from "./api_tokens";

const config = readConfig();
const clock = SystemClock;

logger.info(`Starting bonob with config ${JSON.stringify({ ...config, secret: "*******" })}`);

const bonob = bonobService(
  config.sonos.serviceName,
  config.sonos.sid,
  config.bonobUrl,
  "AppLink"
);

const sonosSystem = sonos(config.sonos.discovery);

const customPlayers = config.subsonic.customClientsFor
  ? TranscodingCustomPlayers.from(config.subsonic.customClientsFor)
  : NO_CUSTOM_PLAYERS;

const artistImageFetcher = config.subsonic.artistImageCache
  ? cachingImageFetcher(config.subsonic.artistImageCache, axiosImageFetcher)
  : axiosImageFetcher;

const subsonic = new Subsonic(
  config.subsonic.url,
  customPlayers,
  artistImageFetcher
);

const featureFlagAwareMusicService: MusicService = {
  generateToken: subsonic.generateToken,
  refreshToken: subsonic.refreshToken,
  login: (serviceToken: string) =>
    subsonic.login(serviceToken).then((library) => {
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

const version = fs.existsSync(GIT_INFO)
  ? fs.readFileSync(GIT_INFO).toString().trim()
  : "v??";


const S3_BUCKET="astiga-sonos-tokens";

class MinioPersistentTokenStore implements PersistentTokenStore {
  client: Minio.Client;
  constructor() {
    this.client = new Minio.Client({
      endPoint: config.tokenStore.s3Endpoint,
      port: config.tokenStore.s3Port,
      useSSL: config.tokenStore.s3UseSsl,
      region: config.tokenStore.s3Region,
      accessKey: config.tokenStore.s3AccessKey,
      secretKey: config.tokenStore.s3SecretKey,
      pathStyle: config.tokenStore.s3PathStyle,
    });
  }
  get(key: string) : Promise<string | undefined> {
    var buff: Uint8Array[] | Buffer[] = [];
    return new Promise(async (resolve, reject) => {
    
      const dataStream = await this.client.getObject(S3_BUCKET, key)
      dataStream.on('data', chunk => {
        //logger.debug("data: " + chunk);
        buff.push(Buffer.from(chunk));
      });
      dataStream.on('error', function (err) {
        logger.error("error");
        reject(err);
    });
      dataStream.on('end', () => {
        const value = Buffer.concat(buff).toString('utf8');
        resolve(value);
      });
    });
  }
  put(key:string, value:string) {
    this.client.putObject(S3_BUCKET, key, value);
  }
  delete(key:string) {
    this.client.removeObject(S3_BUCKET, key);
  }
}

const app = server(
  sonosSystem,
  bonob,
  config.bonobUrl,
  featureFlagAwareMusicService,
  {
    linkCodes: () => new InMemoryLinkCodes(),
    apiTokens: () => new InMemoryAPITokens(sha256(config.secret)),
    clock,
    iconColors: config.icons,
    applyContextPath: true,
    logRequests: config.logRequests,
    version,
    smapiAuthTokens: new JWTSmapiLoginTokens(clock, config.secret, config.authTimeout),
    externalImageResolver: artistImageFetcher
  }, config.tokenStore.s3Endpoint ? new MinioPersistentTokenStore() : new NoopPersistentTokenStore()
);

const expressServer = app.listen(config.port, () => {
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
} else if (config.sonos.discovery.enabled) {
  sonosSystem.devices().then((devices) => {
    devices.forEach((d) => {
      logger.info(`Found device ${d.name}(${d.group}) @ ${d.ip}:${d.port}`);
    });
  });
};

process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  expressServer.close(() => {
    logger.info('HTTP server closed');
  });
  process.exit(0);
});


export default app;
