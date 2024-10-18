import { hostname } from "os";
import logger from "./logger";
import url from "./url_builder";

export const WORD = /^\w+$/;
export const COLOR = /^#?\w+$/;

type EnvVarOpts<T> = {
  default: T | undefined;
  legacy: string[] | undefined;
  validationPattern: RegExp | undefined;
  parser: ((value: string) => T) | undefined
};

export function envVar<T>(
  name: string,
  opts: Partial<EnvVarOpts<T>> = {
    default: undefined,
    legacy: undefined,
    validationPattern: undefined,
    parser: undefined
  }
): T {
  const result = [name, ...(opts.legacy || [])]
    .map((it) => ({ key: it, value: process.env[it] }))
    .find((it) => it.value);

  if (
    result &&
    result.value && 
    opts.validationPattern &&
    !result.value.match(opts.validationPattern)
  ) {
    throw `Invalid value specified for '${name}', must match ${opts.validationPattern}`;
  }

  if(result && result.value && result.key != name) {
    logger.warn(`Configuration key '${result.key}' is deprecated, replace with '${name}'`)
  }

  let value: T | undefined = undefined;

  if(result?.value && opts.parser) {
    value = opts.parser(result?.value)
  } else if(result?.value)
    value = result?.value as any as T

  return value == undefined ? opts.default as T : value;
}

export const bnbEnvVar = <T>(key: string, opts: Partial<EnvVarOpts<T>> = {}) =>
  envVar(`BNB_${key}`, {
    ...opts,
    legacy: [`BONOB_${key}`, ...(opts.legacy || [])],
  });

const asBoolean = (value: string) => value == "true";

const asInt = (value: string) => Number.parseInt(value);

export default function () {
  const port = bnbEnvVar<number>("PORT", { default: 4534, parser: asInt })!;
  const bonobUrl = bnbEnvVar("URL", {
    legacy: ["BONOB_WEB_ADDRESS"],
    default: `http://${hostname()}:${port}`,
  })!;

  if (bonobUrl.match("localhost")) {
    logger.error(
      "BNB_URL containing localhost is almost certainly incorrect, sonos devices will not be able to communicate with bonob using localhost, please specify either public IP or DNS entry"
    );
    process.exit(1);
  }

  return {
    port,
    bonobUrl: url(bonobUrl),
    secret: bnbEnvVar<string>("SECRET", { default: "bonob" })!,
    authTimeout: bnbEnvVar<string>("AUTH_TIMEOUT", { default: "1h" })!,
    icons: {
      foregroundColor: bnbEnvVar<string>("ICON_FOREGROUND_COLOR", {
        validationPattern: COLOR,
      }),
      backgroundColor: bnbEnvVar<string>("ICON_BACKGROUND_COLOR", {
        validationPattern: COLOR,
      }),
    },
    logRequests: bnbEnvVar<boolean>("SERVER_LOG_REQUESTS", { default: false, parser: asBoolean }),
    sonos: {
      serviceName: bnbEnvVar<string>("SONOS_SERVICE_NAME", { default: "bonob" })!,
      discovery: {
        enabled:
          bnbEnvVar<boolean>("SONOS_DEVICE_DISCOVERY", { default: true, parser: asBoolean }),
        seedHost: bnbEnvVar<string>("SONOS_SEED_HOST"),
      },
      autoRegister:
        bnbEnvVar<boolean>("SONOS_AUTO_REGISTER", { default: false, parser: asBoolean }),
      sid: bnbEnvVar<number>("SONOS_SERVICE_ID", { default: 246, parser: asInt }),
    },
    subsonic: {
      url: url(bnbEnvVar("SUBSONIC_URL", { legacy: ["BONOB_NAVIDROME_URL"], default: `http://${hostname()}:4533` })!),
      customClientsFor: bnbEnvVar<string>("SUBSONIC_CUSTOM_CLIENTS", { legacy: ["BONOB_NAVIDROME_CUSTOM_CLIENTS"] }),
      artistImageCache: bnbEnvVar<string>("SUBSONIC_ARTIST_IMAGE_CACHE"),
    },
    scrobbleTracks: bnbEnvVar<boolean>("SCROBBLE_TRACKS", { default: true, parser: asBoolean }),
    reportNowPlaying:
      bnbEnvVar<boolean>("REPORT_NOW_PLAYING", { default: true, parser: asBoolean }),
    tokenStore: {
      s3Endpoint: bnbEnvVar<string>("TOKEN_STORE_S3_ENDPOINT"),
      s3Region: bnbEnvVar<string>("TOKEN_STORE_S3_REGION"),
      s3AccessKey: bnbEnvVar<string>("TOKEN_STORE_S3_ACCESS_KEY"),
      s3SecretKey: bnbEnvVar<string>("TOKEN_STORE_S3_SECRET_KEY"),
      s3PathStyle: bnbEnvVar<boolean>("TOKEN_STORE_S3_USE_PATH_STYLE", { default: false })
    }
  };
}
