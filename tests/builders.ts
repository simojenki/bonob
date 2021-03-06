import { SonosDevice } from "@svrooij/sonos/lib";
import { v4 as uuid } from "uuid";
import { Credentials } from "../src/smapi";

import { Service, Device } from "../src/sonos";
import { Album, Artist } from "../src/music_service";

const randomInt = (max: number) => Math.floor(Math.random() * Math.floor(max));
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
      householdId: "hh1",
    },
    deviceId: "d1",
    deviceProvider: "dp1",
  };
}

export function anArtist(fields: Partial<Artist> = {}): Artist {
  const id = uuid();
  return {
    id,
    name: `Artist ${id}`,
    albums: [anAlbum(), anAlbum(), anAlbum()],
    image: {
      small: `/artist/art/${id}/small`,
      medium: `/artist/art/${id}/small`,
      large: `/artist/art/${id}/large`,
    },
    ...fields,
  };
}

export function anAlbum(fields: Partial<Album> = {}): Album {
  const genres = ["Metal", "Pop", "Rock", "Hip-Hop"];
  const id = uuid();
  return {
    id,
    name: `Album ${id}`,
    genre: genres[randomInt(genres.length)],
    year: `19${randomInt(99)}`,
    ...fields,
  };
}

export const BLONDIE: Artist = {
  id: uuid(),
  name: "Blondie",
  albums: [
    {
      id: uuid(),
      name: "Blondie",
      year: "1976",
      genre: "New Wave",
    },
    {
      id: uuid(),
      name: "Parallel Lines",
      year: "1978",
      genre: "Pop Rock",
    },
  ],
  image: {
    small: undefined,
    medium: undefined,
    large: undefined,
  },
};

export const BOB_MARLEY: Artist = {
  id: uuid(),
  name: "Bob Marley",
  albums: [
    { id: uuid(), name: "Burin'", year: "1973", genre: "Reggae" },
    { id: uuid(), name: "Exodus", year: "1977", genre: "Reggae" },
    { id: uuid(), name: "Kaya", year: "1978", genre: "Ska" },
  ],
  image: {
    small: "http://localhost/BOB_MARLEY/sml",
    medium: "http://localhost/BOB_MARLEY/med",
    large: "http://localhost/BOB_MARLEY/lge",
  },
};

export const MADONNA: Artist = {
  id: uuid(),
  name: "Madonna",
  albums: [],
  image: {
    small: "http://localhost/MADONNA/sml",
    medium: undefined,
    large: "http://localhost/MADONNA/lge",
  },
};

export const METALLICA: Artist = {
  id: uuid(),
  name: "Metallica",
  albums: [
    {
      id: uuid(),
      name: "Ride the Lightening",
      year: "1984",
      genre: "Heavy Metal",
    },
    {
      id: uuid(),
      name: "Master of Puppets",
      year: "1986",
      genre: "Heavy Metal",
    },
  ],
  image: {
    small: "http://localhost/METALLICA/sml",
    medium: "http://localhost/METALLICA/med",
    large: "http://localhost/METALLICA/lge",
  },
};

export const ALL_ARTISTS = [BOB_MARLEY, BLONDIE, MADONNA, METALLICA];

export const ALL_ALBUMS = ALL_ARTISTS.flatMap((it) => it.albums || []);
