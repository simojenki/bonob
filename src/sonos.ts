import { SonosManager, SonosDevice } from "@svrooij/sonos";
import axios from "axios";
import { parse } from "node-html-parser";
import { MusicService } from "@svrooij/sonos/lib/services";
import { head } from "underscore";
import logger from "./logger";
import STRINGS from './strings';
import { SOAP_PATH, STRINGS_ROUTE, PRESENTATION_MAP_ROUTE } from './smapi';

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
  strings: { uri?: string; version?: string };
  presentation: { uri?: string; version?: string };
  pollInterval?: number;
  authType: 'Anonymous' | 'AppLink' | 'DeviceLink' | 'UserId';
};

const stripTailingSlash = (url: string) =>
  url.endsWith("/") ? url.substring(0, url.length - 1) : url;

export const bonobService = (
  name: string,
  sid: number,
  bonobRoot: string,
  authType: 'Anonymous' | 'AppLink' | 'DeviceLink' | 'UserId' = 'AppLink'
): Service => ({
  name,
  sid,
  uri: `${stripTailingSlash(bonobRoot)}${SOAP_PATH}`,
  secureUri: `${stripTailingSlash(bonobRoot)}${SOAP_PATH}`,
  strings: {
    uri: `${stripTailingSlash(bonobRoot)}${STRINGS_ROUTE}`,
    version: STRINGS.version,
  },
  presentation: {
    uri: `${stripTailingSlash(bonobRoot)}${PRESENTATION_MAP_ROUTE}`,
    version: "1",
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
  register: (_: Service) => Promise.resolve(false),
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
  stringsVersion: service.strings.version || "",
  stringsUri: service.strings.uri || "",
  presentationMapVersion: service.presentation.version || "",
  presentationMapUri: service.presentation.uri || "",
  manifestVersion: "0",
  manifestUri: "",
  containerType: "MService",
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
        console.log("booom");
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
        logger.warn("Failed to find a device to register with...")
        return false
      };

      const customd = `http://${anyDevice.Host}:${anyDevice.Port}/customsd`;

      const csrfToken = await axios.get(customd).then((response) =>
        parse(response.data)
          .querySelectorAll("input")
          .find((it) => it.getAttribute("name") == "csrfToken")
          ?.getAttribute("value")
      );

      if (!csrfToken) {
        logger.warn(`Failed to find csrfToken at GET -> ${customd}, cannot register service`)
        return false
      };

      return axios
        .post(customd, new URLSearchParams(asCustomdForm(csrfToken, service)), {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        })
        .then((response) => response.status == 200);
    },
  };
}

export default function sonos(
  sonosSeedHost: string | undefined = undefined
): Sonos {
  switch (sonosSeedHost) {
    case "disabled":
      logger.info("Sonos device discovery disabled");
      return SONOS_DISABLED;
    default:
      return autoDiscoverySonos(sonosSeedHost);
  }
}
