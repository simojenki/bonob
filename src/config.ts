import { hostname } from "os";
import logger from "./logger";

const port = +(process.env["BONOB_PORT"] || 4534);
const webAddress =
    process.env["BONOB_WEB_ADDRESS"] || `http://${hostname()}:${port}`;

if (webAddress.match("localhost")) {
    logger.error("BONOB_WEB_ADDRESS containing localhost is almost certainly incorrect, sonos devices will not be able to communicate with bonob using localhost, please specify either public IP or DNS entry");
    process.exit(1);
}

export default {
    port,
    webAddress,
    secret: process.env["BONOB_SECRET"] || "bonob",
    sonos: {
        serviceName: process.env["BONOB_SONOS_SERVICE_NAME"] || "bonob",
        deviceDiscovery: (process.env["BONOB_SONOS_DEVICE_DISCOVERY"] || "true") == "true",
        seedHost: process.env["BONOB_SONOS_SEED_HOST"],
        autoRegister: process.env["BONOB_SONOS_AUTO_REGISTER"] == "true",
        sid: Number(process.env["BONOS_SONOS_SERVICE_ID"] || "246")
    },
    navidrome: {
        url: process.env["BONOB_NAVIDROME_URL"] || `http://${hostname()}:4533`,
        customClientsFor: process.env["BONOB_NAVIDROME_CUSTOM_CLIENTS"] || undefined,
    }
}


