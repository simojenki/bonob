import { SonosManager, SonosDevice } from "@svrooij/sonos";
// import { MusicService } from "@svrooij/sonos/lib/services";
import { sortBy, uniq } from "underscore";
import logger from "./logger";

export type Device = {
  name: string;
  group: string;
  ip: string;
  port: number;
  services: Service[];
};

export type Service = {
  name: string;
  id: number;
};

export interface Sonos {
  devices: () => Promise<Device[]>;
}

export const SONOS_DISABLED: Sonos = {
  devices: () => Promise.resolve([]),
};

export const servicesFrom = (devices: Device[]) =>
  sortBy(
    uniq(
      devices.flatMap((d) => d.services),
      false,
      (s) => s.id
    ),
    "name"
  );

export const asDevice = (sonosDevice: SonosDevice): Promise<Device> =>
  sonosDevice.MusicServicesService.ListAndParseAvailableServices().then(
    (services) => ({
      name: sonosDevice.Name,
      group: sonosDevice.GroupName || "",
      ip: sonosDevice.Host,
      port: sonosDevice.Port,
      services: services.map((s) => ({
        name: s.Name,
        id: s.Id,
      })),
    })
  );

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
  return {
    devices: async () => {
      const manager = new SonosManager();
      return setupDiscovery(manager, sonosSeedHost)
        .then((success) => {
          if (success) {
            const devices = Promise.all(manager.Devices.map(asDevice));
            logger.info({ devices });
            return devices;
          } else {
            logger.warn("Didn't find any sonos devices!");
            return [];
          }
        })
        .catch((e) => {
          logger.error(`Failed looking for sonos devices ${e}`);
          return [];
        });
    },
  };
}

export default function sonos(sonosSeedHost?: string): Sonos {
  switch (sonosSeedHost) {
    case "disabled":
      logger.info("Sonos device discovery disabled");
      return SONOS_DISABLED;
    default:
      return autoDiscoverySonos(sonosSeedHost);
  }
}
