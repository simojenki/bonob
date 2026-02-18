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
import { PersistentTokenStore, NoopPersistentTokenStore, FilesystemPersistentTokenStore } from "./api_tokens";

const config = readConfig();
process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled Promise Rejection", { reason, promise });
});
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

// Retry configuration for S3 operations
const S3_RETRY_ATTEMPTS = 3;
const S3_RETRY_INITIAL_DELAY_MS = 500;
const S3_RETRY_MAX_DELAY_MS = 5000;
const S3_RETRY_BACKOFF_MULTIPLIER = 2;

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

  /**
   * Retry a Minio operation with exponential backoff
   * @param operation - The async operation to retry
   * @param operationName - Name for logging
   * @returns Promise that resolves/rejects after all retries
   */
  private async retryWithBackoff<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<T> {
    let lastError: any;
    let delay = S3_RETRY_INITIAL_DELAY_MS;

    for (let attempt = 1; attempt <= S3_RETRY_ATTEMPTS; attempt++) {
      try {
        return await operation();
      } catch (err) {
        lastError = err;

        if (attempt < S3_RETRY_ATTEMPTS) {
          logger.warn(
            `S3 ${operationName} failed (attempt ${attempt}/${S3_RETRY_ATTEMPTS}), retrying in ${delay}ms`,
            { error: err }
          );

          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, delay));

          // Calculate next delay with exponential backoff (capped at max)
          delay = Math.min(delay * S3_RETRY_BACKOFF_MULTIPLIER, S3_RETRY_MAX_DELAY_MS);
        }
      }
    }

    // All retries exhausted, throw the last error
    throw lastError;
  }

  async get(key: string): Promise<string | undefined> {
    try {
      return await this.retryWithBackoff(async () => {
        const buff: Uint8Array[] = [];

        const dataStream = await this.client.getObject(S3_BUCKET, key);

        return new Promise<string>((resolve, reject) => {
          dataStream.on('data', (chunk: Uint8Array) => {
            buff.push(chunk);
          });
          dataStream.on('error', (err) => {
            reject(err);
          });
          dataStream.on('end', () => {
            const value = Buffer.concat(buff).toString('utf8');
            resolve(value);
          });
        });
      }, `get(${key})`);
    } catch (err: any) {
      if (err.code === 'NoSuchKey') {
        // Gracefully handle missing key — return undefined
        return undefined;
      }

      // Log error and return undefined (graceful degradation)
      logger.error(`S3 get failed after all retries for key: ${key}`, {
        error: err,
        code: err.code,
        endpoint: config.tokenStore.s3Endpoint,
        port: config.tokenStore.s3Port
      });
      return undefined;
    }
  }
  async put(key: string, value: string): Promise<void> {
    try {
      await this.retryWithBackoff(async () => {
        await this.client.putObject(S3_BUCKET, key, value);
      }, `put(${key})`);
    } catch (err: any) {
      // Log error but don't throw - token is already in memory before this is called
      // S3 is just backup storage, so we use graceful degradation
      logger.error(`S3 put failed after all retries for key: ${key}`, {
        error: err,
        code: err.code,
        endpoint: config.tokenStore.s3Endpoint,
        port: config.tokenStore.s3Port
      });
      // Don't throw - graceful degradation (token works from memory even if S3 fails)
    }
  }
  async delete(key: string): Promise<void> {
    try {
      await this.retryWithBackoff(async () => {
        await this.client.removeObject(S3_BUCKET, key);
      }, `delete(${key})`);
    } catch (err: any) {
      // Log error but don't throw (idempotent operation, non-critical)
      // Token is already removed from memory, S3 is just backup
      logger.error(`S3 delete failed after all retries for key: ${key}`, {
        error: err,
        code: err.code,
        endpoint: config.tokenStore.s3Endpoint,
        port: config.tokenStore.s3Port
      });
      // Explicitly don't throw - delete failures are non-critical
    }
  }
}

function selectTokenStore(): PersistentTokenStore {
  if (config.tokenStore.filesystemDirectory !== undefined) {
    const directory = config.tokenStore.filesystemDirectory;
    const store = new FilesystemPersistentTokenStore(directory);
    logger.info(`Using filesystem token store at ${store['directory']}`);
    return store;
  } else if (config.tokenStore.s3Endpoint) {
    logger.info(`Using S3 token store at ${config.tokenStore.s3Endpoint}`);
    return new MinioPersistentTokenStore();
  } else {
    logger.info("Using no-op token store (tokens will not be persisted)");
    return new NoopPersistentTokenStore();
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
  }, selectTokenStore()
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
