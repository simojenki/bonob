import { SonosDevice } from "@svrooij/sonos/lib";
import { v4 as uuid } from "uuid";
import randomstring from "randomstring";

import { Credentials } from "../src/smapi";
import { Service, Device } from "../src/sonos";
import {
  Album,
  Artist,
  Track,
  albumToAlbumSummary,
  artistToArtistSummary,
  PlaylistSummary,
  Playlist,
  SimilarArtist,
  AlbumSummary,
  RadioStation,
} from "../src/music_service";

import { b64Encode } from "../src/b64";
import { artistImageURN } from "../src/subsonic";

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

export function aPlaylistSummary(
  fields: Partial<PlaylistSummary> = {}
): PlaylistSummary {
  return {
    id: `playlist-${uuid()}`,
    name: `playlistname-${randomstring.generate()}`,
    ...fields,
  };
}

export function aPlaylist(fields: Partial<Playlist> = {}): Playlist {
  return {
    id: `playlist-${uuid()}`,
    name: `playlist-${randomstring.generate()}`,
    entries: [aTrack(), aTrack()],
    ...fields,
  };
}

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

export function someCredentials({ token, key } : { token: string, key: string }): Credentials {
  return {
    loginToken: {
      token,
      key,
      householdId: "hh1",
    },
    deviceId: "d1",
    deviceProvider: "dp1",
  };
}

export function aSimilarArtist(
  fields: Partial<SimilarArtist> = {}
): SimilarArtist {
  const id = fields.id || uuid();
  return {
    id,
    name: `Similar Artist ${id}`,
    image: artistImageURN({ artistId: id }),
    inLibrary: true,
    ...fields,
  };
}

export function anArtist(fields: Partial<Artist> = {}): Artist {
  const id = fields.id || uuid();
  const artist = {
    id,
    name: `Artist ${id}`,
    albums: [anAlbum(), anAlbum(), anAlbum()],
    image: { system: "subsonic", resource: `art:${id}` },
    similarArtists: [
      aSimilarArtist({ id: uuid(), name: "Similar artist1", inLibrary: true }),
      aSimilarArtist({ id: uuid(), name: "Similar artist2", inLibrary: true }),
      aSimilarArtist({
        id: "-1",
        name: "Artist not in library",
        inLibrary: false,
      }),
    ],
    ...fields,
  };
  artist.albums.forEach((album) => {
    album.artistId = artist.id;
    album.artistName = artist.name;
  });
  return artist;
}

export const aGenre = (name: string) => ({ id: b64Encode(name), name });

export const HIP_HOP = aGenre("Hip-Hop");
export const METAL = aGenre("Metal");
export const NEW_WAVE = aGenre("New Wave");
export const POP = aGenre("Pop");
export const POP_ROCK = aGenre("Pop Rock");
export const REGGAE = aGenre("Reggae");
export const ROCK = aGenre("Rock");
export const SKA = aGenre("Ska");
export const PUNK = aGenre("Punk");
export const TRIP_HOP = aGenre("Trip Hop");

export const SAMPLE_GENRES = [
  HIP_HOP,
  METAL,
  NEW_WAVE,
  POP,
  POP_ROCK,
  REGGAE,
  ROCK,
  SKA,
];
export const randomGenre = () => SAMPLE_GENRES[randomInt(SAMPLE_GENRES.length)];

export const aYear = (year: string) => ({ id: year, year });

export const Y2024 = aYear("2024");
export const Y2023 = aYear("2023");
export const Y1969 = aYear("1969");

export function aTrack(fields: Partial<Track> = {}): Track {
  const id = uuid();
  const artist = anArtist();
  const genre = fields.genre || randomGenre();
  const rating = { love: false, stars: Math.floor(Math.random() * 5) };
  return {
    id,
    name: `Track ${id}`,
    encoding: {
      player: "bonob",
      mimeType: `audio/mp3-${id}`
    },
    duration: randomInt(500),
    number: randomInt(100),
    genre,
    artist: artistToArtistSummary(artist),
    album: albumToAlbumSummary(
      anAlbum({ artistId: artist.id, artistName: artist.name, genre })
    ),
    coverArt: { system: "subsonic", resource: `art:${uuid()}`},
    rating,
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
    artistId: `Artist ${uuid()}`,
    artistName: `Artist ${randomstring.generate()}`,
    coverArt: { system: "subsonic", resource: `art:${uuid()}` },
    ...fields,
  };
};

export function aRadioStation(fields: Partial<RadioStation> = {}): RadioStation {
  const id = uuid()
  const name = `Station-${id}`;
  return {
    id,
    name,
    url: `http://example.com/${name}`,
    ...fields
  }
}

export function anAlbumSummary(fields: Partial<AlbumSummary> = {}): AlbumSummary {
  const id = uuid();
  return {
    id,
    name: `Album ${id}`,
    year: `19${randomInt(99)}`,
    genre: randomGenre(),
    coverArt: { system: "subsonic", resource: `art:${uuid()}` },
    artistId: `Artist ${uuid()}`,
    artistName: `Artist ${randomstring.generate()}`,
    ...fields
  }
};

export const BLONDIE_ID = uuid();
export const BLONDIE_NAME = "Blondie";
export const BLONDIE: Artist = {
  id: BLONDIE_ID,
  name: BLONDIE_NAME,
  albums: [
    {
      id: uuid(),
      name: "Blondie",
      year: "1976",
      genre: NEW_WAVE,
      artistId: BLONDIE_ID,
      artistName: BLONDIE_NAME,
      coverArt: { system: "subsonic", resource: `art:${uuid()}`},
    },
    {
      id: uuid(),
      name: "Parallel Lines",
      year: "1978",
      genre: POP_ROCK,
      artistId: BLONDIE_ID,
      artistName: BLONDIE_NAME,
      coverArt: { system: "subsonic", resource: `art:${uuid()}`},
    },
  ],
  image: { system: "external", resource: "http://localhost:1234/images/blondie.jpg" },
  similarArtists: [],
};

export const BOB_MARLEY_ID = uuid();
export const BOB_MARLEY_NAME = "Bob Marley";
export const BOB_MARLEY: Artist = {
  id: BOB_MARLEY_ID,
  name: BOB_MARLEY_NAME,
  albums: [
    {
      id: uuid(),
      name: "Burin'",
      year: "1973",
      genre: REGGAE,
      artistId: BOB_MARLEY_ID,
      artistName: BOB_MARLEY_NAME,
      coverArt: { system: "subsonic", resource: `art:${uuid()}`},
    },
    {
      id: uuid(),
      name: "Exodus",
      year: "1977",
      genre: REGGAE,
      artistId: BOB_MARLEY_ID,
      artistName: BOB_MARLEY_NAME,
      coverArt: { system: "subsonic", resource: `art:${uuid()}`},
    },
    {
      id: uuid(),
      name: "Kaya",
      year: "1978",
      genre: SKA,
      artistId: BOB_MARLEY_ID,
      artistName: BOB_MARLEY_NAME,
      coverArt: { system: "subsonic", resource: `art:${uuid()}`},
    },
  ],
  image: { system: "subsonic", resource: BOB_MARLEY_ID },
  similarArtists: [],
};

export const MADONNA_ID = uuid();
export const MADONNA_NAME = "Madonna";
export const MADONNA: Artist = {
  id: MADONNA_ID,
  name: MADONNA_NAME,
  albums: [],
  image: {
    system: "external",
    resource: "http://localhost:1234/images/madonna.jpg",
  },
  similarArtists: [],
};

export const METALLICA_ID = uuid();
export const METALLICA_NAME = "Metallica";
export const METALLICA: Artist = {
  id: METALLICA_ID,
  name: METALLICA_NAME,
  albums: [
    {
      id: uuid(),
      name: "Ride the Lightening",
      year: "1984",
      genre: METAL,
      artistId: METALLICA_ID,
      artistName: METALLICA_NAME,
      coverArt: { system: "subsonic", resource: `art:${uuid()}`},
    },
    {
      id: uuid(),
      name: "Master of Puppets",
      year: "1986",
      genre: METAL,
      artistId: METALLICA_ID,
      artistName: METALLICA_NAME,
      coverArt: { system: "subsonic", resource: `art:${uuid()}`},
    },
  ],
  image: { system: "subsonic", resource: METALLICA_ID },
  similarArtists: [],
};

export const ALL_ARTISTS = [BOB_MARLEY, BLONDIE, MADONNA, METALLICA];

export const ALL_ALBUMS = ALL_ARTISTS.flatMap((it) => it.albums || []);
