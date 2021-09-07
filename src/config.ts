import { hostname } from "os";
import logger from "./logger";
import url from "./url_builder";

export const WORD = /^\w+$/;

type EnvVarOpts = {
  default: string | undefined;
  legacy: string[] | undefined;
  validationPattern: RegExp | undefined;
};

export function envVar(
  name: string,
  opts: Partial<EnvVarOpts> = {
    default: undefined,
    legacy: undefined,
    validationPattern: undefined,
  }
) {
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

  return result?.value || opts.default;
}

export const bnbEnvVar = (key: string, opts: Partial<EnvVarOpts> = {}) =>
  envVar(`BNB_${key}`, {
    ...opts,
    legacy: [`BONOB_${key}`, ...(opts.legacy || [])],
  });

export default function () {
  const port = +bnbEnvVar("PORT", { default: "4534" })!;
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
    secret: bnbEnvVar("SECRET", { default: "bonob" })!,
    icons: {
      foregroundColor: bnbEnvVar("ICON_FOREGROUND_COLOR", {
        validationPattern: WORD,
      }),
      backgroundColor: bnbEnvVar("ICON_BACKGROUND_COLOR", {
        validationPattern: WORD,
      }),
    },
    sonos: {
      serviceName: bnbEnvVar("SONOS_SERVICE_NAME", { default: "bonob" })!,
      discovery: {
        enabled:
          bnbEnvVar("SONOS_DEVICE_DISCOVERY", { default: "true" }) == "true",
        seedHost: bnbEnvVar("SONOS_SEED_HOST"),
      },
      autoRegister:
        bnbEnvVar("SONOS_AUTO_REGISTER", { default: "false" }) == "true",
      sid: Number(bnbEnvVar("SONOS_SERVICE_ID", { default: "246" })),
    },
    subsonic: {
      url: bnbEnvVar("SUBSONIC_URL", { legacy: ["BONOB_NAVIDROME_URL"], default: `http://${hostname()}:4533` })!,
      customClientsFor: bnbEnvVar("SUBSONIC_CUSTOM_CLIENTS", { legacy: ["BONOB_NAVIDROME_CUSTOM_CLIENTS"] }),
    },
    scrobbleTracks: bnbEnvVar("SCROBBLE_TRACKS", { default: "true" }) == "true",
    reportNowPlaying:
      bnbEnvVar("REPORT_NOW_PLAYING", { default: "true" }) == "true",
  };
}
