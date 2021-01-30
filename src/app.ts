import sonos, { bonobService } from "./sonos";
import server from "./server";
import logger from "./logger"

const PORT = process.env["PORT"] || 4534;

const bonob = bonobService(
  process.env["BONOB_SONOS_SERVICE_NAME"] || "bonob",
  Number(process.env["BONOS_SONOS_SERVICE_ID"] || "246")
)
const app = server(
  sonos(process.env["BONOB_SONOS_SEED_HOST"]),
  bonob
);

app.listen(PORT, () => {
  logger.info(`Listening on ${PORT}`);
});

export default app;
