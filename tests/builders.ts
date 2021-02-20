import { SonosDevice } from "@svrooij/sonos/lib";
import { v4 as uuid } from "uuid";
import { MusicService, Credentials } from "../src/music_service";

import { Service, Device } from "../src/sonos";

const randomInt = (max: number) => Math.floor(Math.random() * max);
const randomIpAddress = () => `127.0.${randomInt(255)}.${randomInt(255)}`;

export const aService = (fields: Partial<Service> = {}): Service => ({
  name: `Test Music Service ${uuid()}`,
  sid: randomInt(500),
  uri: "https://sonos-test.example.com/",
  secureUri: "https://sonos-test.example.com/",
  strings: {
    uri: "https://sonos-test.example.com/strings.xml",
    version: "22",
  },
  presentation: {
    uri: "https://sonos-test.example.com/presentation.xml",
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

export function aSonosDevice(fields: Partial<SonosDevice> = {}): SonosDevice {
  return {
    Name: `device-${uuid()}`,
    GroupName: `group-${uuid()}`,
    Host: randomIpAddress(),
    Port: randomInt(10_000),
    ...fields,
  } as SonosDevice;
}

export function getAppLinkMessage() {
  return {
    householdId: "",
    hardware: "",
    osVersion: "",
    sonosAppName: "",
    callbackPath: "",
  };
}

export class InMemoryMusicService implements MusicService {
  users: Record<string, string> = {};

  login({ username, password }: Credentials) {
    return username != undefined && password != undefined && this.users[username] == password;
  }

  hasUser(credentials: Credentials) {
    this.users[credentials.username] = credentials.password;
  }

  hasNoUsers() {
    this.users = {};
  }

  clear() {
    this.users = {};
  }
}
