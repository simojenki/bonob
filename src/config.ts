import { hostname } from "os";
import logger from "./logger";
import url from "./url_builder";

export default function () {
  const port = +(process.env["BONOB_PORT"] || 4534);
  const bonobUrl =
    process.env["BONOB_URL"] ||
    process.env["BONOB_WEB_ADDRESS"] ||
    `http://${hostname()}:${port}`;

  if (bonobUrl.match("localhost")) {
    logger.error(
      "BONOB_URL containing localhost is almost certainly incorrect, sonos devices will not be able to communicate with bonob using localhost, please specify either public IP or DNS entry"
    );
    process.exit(1);
  }

  const wordFrom = (envVar: string) => {
    const value = process.env[envVar];
    if (value && value != "") {
      if (value.match(/^\w+$/)) return value;
      else throw `Invalid color specified for ${envVar}`;
    } else {
      return undefined;
    }
  };

  return {
    port,
    bonobUrl: url(bonobUrl),
    secret: process.env["BONOB_SECRET"] || "bonob",
    icons: {
      foregroundColor: wordFrom("BONOB_ICON_FOREGROUND_COLOR"),
      backgroundColor: wordFrom("BONOB_ICON_BACKGROUND_COLOR"),
    },
    sonos: {
      serviceName: process.env["BONOB_SONOS_SERVICE_NAME"] || "bonob",
      discovery: {
        enabled:
          (process.env["BONOB_SONOS_DEVICE_DISCOVERY"] || "true") == "true",
        seedHost: process.env["BONOB_SONOS_SEED_HOST"],
      },
      autoRegister:
        (process.env["BONOB_SONOS_AUTO_REGISTER"] || "false") == "true",
      sid: Number(process.env["BONOB_SONOS_SERVICE_ID"] || "246"),
    },
    navidrome: {
      url: process.env["BONOB_NAVIDROME_URL"] || `http://${hostname()}:4533`,
      customClientsFor:
        process.env["BONOB_NAVIDROME_CUSTOM_CLIENTS"] || undefined,
    },
    scrobbleTracks: (process.env["BONOB_SCROBBLE_TRACKS"] || "true") == "true",
    reportNowPlaying:
      (process.env["BONOB_REPORT_NOW_PLAYING"] || "true") == "true",
  };
}
