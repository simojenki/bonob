import { SonosManager } from "@svrooij/sonos";

import logger from "./logger";

type Device = {
  name: string;
  group: string;
  ip: string;
  port: number;
};

interface Sonos
 {
  devices: () => Device[];
}

class RealSonos implements Sonos {
  manager: SonosManager;

  constructor(manager: SonosManager) {
    this.manager = manager;
  }

  devices = (): Device[] => {
    const devices = this.manager.Devices.map((d) => ({
      name: d.Name,
      group: d.GroupName || "",
      ip: d.Host,
      port: d.Port,
    }));
    logger.debug({ devices })
    return devices;
  }
}

const SonosDisabled: Sonos = {
  devices: () => [],
};

export default function (): Promise<Sonos> {
  const manager = new SonosManager();
  return manager
    .InitializeWithDiscovery(10)
    .then((it) => (it ? new RealSonos(manager) : SonosDisabled))
    .catch((_) => {
      return SonosDisabled;
    });
}
