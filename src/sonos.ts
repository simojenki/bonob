import { SonosManager, SonosDevice } from "@svrooij/sonos";
import axios from "axios";
import { parse } from "node-html-parser";
import { MusicService } from "@svrooij/sonos/lib/services";
import { head } from "underscore";
import logger from "./logger";
import { SOAP_PATH, STRINGS_ROUTE, PRESENTATION_MAP_ROUTE } from "./smapi";
import qs from "querystring";
import { URLBuilder } from "./url_builder";

export const PRESENTATION_AND_STRINGS_VERSION = "18";

// NOTE: manifest requires https for the URL,
// otherwise you will get an error trying to register
export type Capability =
  | "search"
  | "trFavorites"
  | "alFavorites"
  | "ucPlaylists"
  | "extendedMD"
  | "contextHeaders"
  | "authorizationHeader"
  | "logging"
  | "manifest";

export const BONOB_CAPABILITIES: Capability[] = [
  "search",
  // "trFavorites",
  // "alFavorites",
  "ucPlaylists",
  "extendedMD",
  "logging",
];

export type Device = {
  name: string;
  group: string;
  ip: string;
  port: number;
};

export type Service = {
  name: string;
  sid: number;
  uri: string;
  secureUri: string;
  strings?: { uri?: string; version?: string };
  presentation?: { uri?: string; version?: string };
  pollInterval?: number;
  authType: "Anonymous" | "AppLink" | "DeviceLink" | "UserId";
};

export const stripTrailingSlash = (url: string) =>
  url.endsWith("/") ? url.substring(0, url.length - 1) : url;

export const bonobService = (
  name: string,
  sid: number,
  bonobUrl: URLBuilder,
  authType: "Anonymous" | "AppLink" | "DeviceLink" | "UserId" = "AppLink"
): Service => ({
  name,
  sid,
  uri: bonobUrl.append({pathname: SOAP_PATH }).href(),
  secureUri: bonobUrl.append({pathname: SOAP_PATH }).href(),
  strings: {
    uri: bonobUrl.append({pathname: STRINGS_ROUTE }).href(),
    version: PRESENTATION_AND_STRINGS_VERSION,
  },
  presentation: {
    uri: bonobUrl.append({pathname: PRESENTATION_MAP_ROUTE }).href(),
    version: PRESENTATION_AND_STRINGS_VERSION,
  },
  pollInterval: 1200,
  authType,
});

export interface Sonos {
  devices: () => Promise<Device[]>;
  services: () => Promise<Service[]>;
  register: (service: Service) => Promise<boolean>;
}

export const SONOS_DISABLED: Sonos = {
  devices: () => Promise.resolve([]),
  services: () => Promise.resolve([]),
  register: (_: Service) => Promise.resolve(true),
};

export const asService = (musicService: MusicService): Service => ({
  name: musicService.Name,
  sid: musicService.Id,
  uri: musicService.Uri,
  secureUri: musicService.SecureUri,
  strings: {
    uri: musicService.Presentation?.Strings?.Uri,
    version: musicService.Presentation?.Strings?.Version,
  },
  presentation: {
    uri: musicService.Presentation?.PresentationMap?.Uri,
    version: musicService.Presentation?.PresentationMap?.Version,
  },
  pollInterval: musicService.Policy.PollInterval,
  authType: musicService.Policy.Auth,
});

export const asDevice = (sonosDevice: SonosDevice): Device => ({
  name: sonosDevice.Name,
  group: sonosDevice.GroupName || "",
  ip: sonosDevice.Host,
  port: sonosDevice.Port,
});

export const asCustomdForm = (csrfToken: string, service: Service) => ({
  csrfToken,
  sid: `${service.sid}`,
  name: service.name,
  uri: service.uri,
  secureUri: service.secureUri,
  pollInterval: `${service.pollInterval || 1200}`,
  authType: service.authType,
  stringsVersion: service.strings?.version || "0",
  stringsUri: service.strings?.uri || "",
  presentationMapVersion: service.presentation?.version || "0",
  presentationMapUri: service.presentation?.uri || "",
  containerType: "MService",
  caps: BONOB_CAPABILITIES,
});

const setupDiscovery = (
  manager: SonosManager,
  sonosSeedHost?: string
): Promise<boolean> => {
  if (sonosSeedHost == undefined || sonosSeedHost == "") {
    logger.info("Trying to auto discover sonos devices");
    return manager.InitializeWithDiscovery(10);
  } else {
    logger.info(`Trying to discover sonos devices using seed ${sonosSeedHost}`);
    return manager.InitializeFromDevice(sonosSeedHost);
  }
};

export function autoDiscoverySonos(sonosSeedHost?: string): Sonos {
  const sonosDevices = async (): Promise<SonosDevice[]> => {
    const manager = new SonosManager();
    return setupDiscovery(manager, sonosSeedHost)
      .then((success) => {
        if (success) {
          return manager.Devices;
        } else {
          logger.warn("Didn't find any sonos devices!");
          return [];
        }
      })
      .catch((e) => {
        logger.error(`Failed looking for sonos devices ${e}`);
        return [];
      });
  };

  return {
    devices: async () => sonosDevices().then((it) => it.map(asDevice)),

    services: async () =>
      sonosDevices()
        .then((it) => head(it))
        .then(
          (device) =>
            device?.MusicServicesService?.ListAndParseAvailableServices() || []
        )
        .then((it) => it.map(asService)),

    register: async (service: Service) => {
      const anyDevice = await sonosDevices().then((devices) => head(devices));

      if (!anyDevice) {
        logger.warn("Failed to find a device to register with...");
        return false;
      }

      logger.info(
        `Registering ${service.name}(SID:${service.sid}) with sonos device ${anyDevice.Name} @ ${anyDevice.Host}`
      );

      const customd = `http://${anyDevice.Host}:${anyDevice.Port}/customsd`;

      const csrfToken = await axios.get(customd).then((response) =>
        parse(response.data)
          .querySelectorAll("input")
          .find((it) => it.getAttribute("name") == "csrfToken")
          ?.getAttribute("value")
      );

      if (!csrfToken) {
        logger.warn(
          `Failed to find csrfToken at GET -> ${customd}, cannot register service`
        );
        return false;
      }
      const customdForm = asCustomdForm(csrfToken, service);
      logger.info(`Registering with sonos @ ${customd}`, { customdForm });
      return axios
        .post(customd, new URLSearchParams(qs.stringify(customdForm)), {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        })
        .then((response) => response.status == 200);
    },
  };
}

const sonos = (
  discoveryEnabled: boolean = true,
  sonosSeedHost: string | undefined = undefined
): Sonos =>
  discoveryEnabled ? autoDiscoverySonos(sonosSeedHost) : SONOS_DISABLED;

export default sonos;
