import { SonosDevice } from "@svrooij/sonos/lib";
import { v4 as uuid } from 'uuid';

import { Service, Device } from "../src/sonos";

const randomInt = (max: number) => Math.floor(Math.random() * max)
const randomIpAddress = () => `127.0.${randomInt(255)}.${randomInt(255)}`

export const aService = (fields: Partial<Service> = {}): Service => ({
  name: `Test Music Service ${uuid()}`,
  sid: randomInt(500),
  uri: "https://sonos.testmusic.com/",
  secureUri: "https://sonos.testmusic.com/",
  strings: {
    uri: "https://sonos.testmusic.com/strings.xml",
    version: "22",
  },
  presentation: {
    uri: "https://sonos.testmusic.com/presentation.xml",
    version: "33",
  },
  pollInterval: 1200,
  authType: "DeviceLink",

  ...fields,
});

export function aDevice(fields: Partial<Device> = {}): Device {
  return {
    name: `device-${uuid()}`,
    group: `group-${uuid()}`,
    ip: randomIpAddress(),
    port: randomInt(10_000),
    ...fields,
  };
}

export function aSonosDevice(
  fields: Partial<SonosDevice> = {}
): SonosDevice {
  return {
    Name: `device-${uuid()}`,
    GroupName: `group-${uuid()}`,
    Host: randomIpAddress(),
    Port: randomInt(10_000),
    ...fields,
  } as SonosDevice;
}
