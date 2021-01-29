import { MusicService } from "@svrooij/sonos/lib/services";

export const AMAZON_MUSIC: MusicService = {
  Name: "Amazon Music",
  Version: "1.1",
  Uri: "https://sonos.amazonmusic.com/",
  SecureUri: "https://sonos.amazonmusic.com/",
  ContainerType: "MService",
  Capabilities: "2208321",
  Presentation: {
    Strings: {
      Version: "23",
      Uri: "https://sonos.amazonmusic.com/strings.xml",
    },
    PresentationMap: {
      Version: "17",
      Uri: "https://sonos.amazonmusic.com/PresentationMap.xml",
    },
  },
  Id: 201,
  Policy: { Auth: "DeviceLink", PollInterval: 60 },
  Manifest: {
    Uri: "",
    Version: "",
  },
};

export const APPLE_MUSIC: MusicService = {
  Name: "Apple Music",
  Version: "1.1",
  Uri: "https://sonos-music.apple.com/ws/SonosSoap",
  SecureUri: "https://sonos-music.apple.com/ws/SonosSoap",
  ContainerType: "MService",
  Capabilities: "3117633",
  Presentation: {
    Strings: {
      Version: "24",
      Uri: "https://sonos-music.apple.com/xml/strings.xml",
    },
    PresentationMap: {
      Version: "22",
      Uri: "http://sonos-pmap.ws.sonos.com/applemusicbrand_pmap3.xml",
    },
  },
  Id: 204,
  Policy: { Auth: "AppLink", PollInterval: 60 },
  Manifest: {
    Uri: "",
    Version: "",
  },
};

export const AUDIBLE: MusicService  = {
  Name: "Audible",
  Version: "1.1",
  Uri: "https://sonos.audible.com/smapi",
  SecureUri: "https://sonos.audible.com/smapi",
  ContainerType: "MService",
  Capabilities: "1095249",
  Presentation: {
    Strings: {
      Version: "5",
      Uri: "https://sonos.audible.com/smapi/strings.xml",
    },
    PresentationMap: {
      Version: "5",
      Uri: "https://sonos.audible.com/smapi/PresentationMap.xml",
    },
  },
  Id: 239,
  Policy: { Auth: "AppLink", PollInterval: 30 },
  Manifest: {
    Uri: "",
    Version: "",
  },
};
