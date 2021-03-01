import { SonosDevice } from "@svrooij/sonos/lib";
import { v4 as uuid } from "uuid";
import { Credentials } from "../src/smapi";

import { Service, Device } from "../src/sonos";
import { Album, Artist } from "../src/music_service";

const randomInt = (max: number) => Math.floor(Math.random() * max);
const randomIpAddress = () => `127.0.${randomInt(255)}.${randomInt(255)}`;

export const aService = (fields: Partial<Service> = {}): Service => ({
  sid: randomInt(500),
  name: `Test Music Service ${uuid()}`,
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

export function someCredentials(token: string): Credentials {
  return {
    loginToken: {
      token,
      householdId: "hh1"
    },
    deviceId: "d1",
    deviceProvider: "dp1"
  }
}

export type ArtistWithAlbums = Artist & {
  albums: Album[];
};

export const BOB_MARLEY: ArtistWithAlbums = {
  id: uuid(),
  name: "Bob Marley",
  albums: [
    { id: uuid(), name: "Burin'" },
    { id: uuid(), name: "Exodus" },
    { id: uuid(), name: "Kaya" },
  ],
};

export const BLONDIE: ArtistWithAlbums = {
  id: uuid(),
  name: "Blondie",
  albums: [
    { id: uuid(), name: "Blondie" },
    { id: uuid(), name: "Parallel Lines" },
  ],
};

export const MADONNA: ArtistWithAlbums = {
  id: uuid(),
  name: "Madonna",
  albums: [],
};
