import sonos, { bonobService } from "./sonos";
import server from "./server";
import logger from "./logger";
import { Navidrome } from "./navidrome";
import encryption from "./encryption";

const PORT = +(process.env["BONOB_PORT"] || 4534);
const WEB_ADDRESS =
  process.env["BONOB_WEB_ADDRESS"] || `http://localhost:${PORT}`;

const bonob = bonobService(
  process.env["BONOB_SONOS_SERVICE_NAME"] || "bonob",
  Number(process.env["BONOS_SONOS_SERVICE_ID"] || "246"),
  WEB_ADDRESS,
  "AppLink"
);
const app = server(
  sonos(process.env["BONOB_SONOS_SEED_HOST"]),
  bonob,
  WEB_ADDRESS,
  new Navidrome(process.env["BONOB_NAVIDROME_URL"] || "http://localhost:4533", encryption(process.env["BONOB_SECRET"] || "bonob"))
);

app.listen(PORT, () => {
  logger.info(`Listening on ${PORT} available @ ${WEB_ADDRESS}`);
});

export default app;
