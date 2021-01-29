import { SonosManager, SonosDevice } from "@svrooij/sonos";
import logger from "./logger";

type Device = {
  name: string;
  group: string;
  ip: string;
  port: number;
};

export interface Sonos {
  devices: () => Device[];
}

export const SONOS_DISABLED: Sonos = {
  devices: () => [],
};

const asDevice = (sonosDevice: SonosDevice) => ({
  name: sonosDevice.Name,
  group: sonosDevice.GroupName || "",
  ip: sonosDevice.Host,
  port: sonosDevice.Port,
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
  const manager = new SonosManager();

  setupDiscovery(manager, sonosSeedHost)
    .then((r) => {
      if (r) logger.info({ devices: manager.Devices.map(asDevice) });
      else logger.warn("Failed to auto discover hosts!");
    })
    .catch((e) => {
      logger.warn(`Failed to find sonos devices ${e}`);
    });

  return {
    devices: () => {
      try {
        return manager.Devices.map(asDevice)
      }catch(e) {
        return []
      }
    },
  };
}

export default function sonos(sonosSeedHost?: string): Sonos {
  switch (sonosSeedHost) {
    case "disabled":
      return SONOS_DISABLED;
    default:
      return autoDiscoverySonos(sonosSeedHost);
  }
}
