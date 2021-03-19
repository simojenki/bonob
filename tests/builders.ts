import { SonosDevice } from "@svrooij/sonos/lib";
import { v4 as uuid } from "uuid";
import { Credentials } from "../src/smapi";

import { Service, Device } from "../src/sonos";
import { Album, Artist, Track } from "../src/music_service";

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
    similarArtists: [
      { id: uuid(), name: "Similar artist1" },
      { id: uuid(), name: "Similar artist2" },
    ],
    ...fields,
  };
}

export const HIP_HOP = { id: "genre_hip_hop", name: "Hip-Hop" };
export const METAL = { id: "genre_metal", name: "Metal" };
export const NEW_WAVE = { id: "genre_new_wave", name: "New Wave" };
export const POP = { id: "genre_pop", name: "Pop" };
export const POP_ROCK = { id: "genre_pop_rock", name: "Pop Rock" };
export const REGGAE = { id: "genre_reggae", name: "Reggae" };
export const ROCK = { id: "genre_rock", name: "Rock" };
export const SKA = { id: "genre_ska", name: "Ska" };
export const PUNK = { id: "genre_punk", name: "Punk" };
export const TRIP_HOP = { id: "genre_trip_hop", name: "Trip Hop" };

export const SAMPLE_GENRES = [HIP_HOP, METAL, NEW_WAVE, POP, POP_ROCK, REGGAE, ROCK, SKA];
export const randomGenre = () => SAMPLE_GENRES[randomInt(SAMPLE_GENRES.length)];

export function aTrack(fields: Partial<Track> = {}): Track {
  const id = uuid();
  return {
    id,
    name: `Track ${id}`,
    mimeType: `audio/mp3-${id}`,
    duration: randomInt(500),
    number: randomInt(100),
    genre: randomGenre(),
    artist: anArtist(),
    album: anAlbum(),
    ...fields,
  };
}

export function anAlbum(fields: Partial<Album> = {}): Album {
  const id = uuid();
  return {
    id,
    name: `Album ${id}`,
    genre: randomGenre(),
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
      genre: NEW_WAVE,
    },
    {
      id: uuid(),
      name: "Parallel Lines",
      year: "1978",
      genre: POP_ROCK,
    },
  ],
  image: {
    small: undefined,
    medium: undefined,
    large: undefined,
  },
  similarArtists: [],
};

export const BOB_MARLEY: Artist = {
  id: uuid(),
  name: "Bob Marley",
  albums: [
    { id: uuid(), name: "Burin'", year: "1973", genre: REGGAE },
    { id: uuid(), name: "Exodus", year: "1977", genre: REGGAE },
    { id: uuid(), name: "Kaya", year: "1978", genre: SKA },
  ],
  image: {
    small: "http://localhost/BOB_MARLEY/sml",
    medium: "http://localhost/BOB_MARLEY/med",
    large: "http://localhost/BOB_MARLEY/lge",
  },
  similarArtists: [],
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
  similarArtists: [],
};

export const METALLICA: Artist = {
  id: uuid(),
  name: "Metallica",
  albums: [
    {
      id: uuid(),
      name: "Ride the Lightening",
      year: "1984",
      genre: METAL,
    },
    {
      id: uuid(),
      name: "Master of Puppets",
      year: "1986",
      genre: METAL,
    },
  ],
  image: {
    small: "http://localhost/METALLICA/sml",
    medium: "http://localhost/METALLICA/med",
    large: "http://localhost/METALLICA/lge",
  },
  similarArtists: [],
};

export const ALL_ARTISTS = [BOB_MARLEY, BLONDIE, MADONNA, METALLICA];

export const ALL_ALBUMS = ALL_ARTISTS.flatMap((it) => it.albums || []);
