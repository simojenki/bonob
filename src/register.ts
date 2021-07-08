import readConfig from "./config";
import logger from "./logger";
import sonos, { bonobService } from "./sonos";

const config = readConfig();

const bonob = bonobService(
    config.sonos.serviceName,
    config.sonos.sid,
    config.webAddress,
    "AppLink"
);

const sonosSystem = sonos(config.sonos.deviceDiscovery, config.sonos.seedHost);

sonosSystem.register(bonob).then((success) => {
    if (success) {
        logger.info(
            `Successfully registered ${bonob.name}(SID:${bonob.sid}) with sonos`
        );
        process.exit(0);
    } else {
        logger.error(`Failed to register ${bonob.name}(SID:${bonob.sid}) with sonos!!`)
        process.exit(1);
    }
});