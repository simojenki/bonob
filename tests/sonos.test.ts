import qs from "querystring"
import { SonosManager, SonosDevice } from "@svrooij/sonos";
import {
  MusicServicesService,
  MusicService,
} from "@svrooij/sonos/lib/services";
jest.mock("@svrooij/sonos");

import axios from "axios";
jest.mock("axios");

import { v4 as uuid } from 'uuid';

import { AMAZON_MUSIC, APPLE_MUSIC, AUDIBLE } from "./music_services";

import sonos, {
  SONOS_DISABLED,
  asDevice,
  asService,
  asCustomdForm,
  bonobService,
  Service,
  STRINGS_VERSION,
  PRESENTATION_MAP_VERSION,
  BONOB_CAPABILITIES,
} from "../src/sonos";

import { aSonosDevice, aService } from "./builders";

const mockSonosManagerConstructor = <jest.Mock<SonosManager>>SonosManager;

describe("sonos", () => {
  beforeEach(() => {
    mockSonosManagerConstructor.mockClear();
  });

  describe("asService", () => {
    it("should convert", () => {
      const musicService: MusicService = {
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

      expect(asService(musicService)).toEqual({
        name: "Amazon Music",
        sid: 201,
        uri: "https://sonos.amazonmusic.com/",
        secureUri: "https://sonos.amazonmusic.com/",
        strings: {
          uri: "https://sonos.amazonmusic.com/strings.xml",
          version: "23",
        },
        presentation: {
          uri: "https://sonos.amazonmusic.com/PresentationMap.xml",
          version: "17",
        },
        pollInterval: 60,
        authType: "DeviceLink",
      });
    });
  });

  describe("asDevice", () => {
    it("should convert", () => {
      const musicServicesService = {
        ListAndParseAvailableServices: jest.fn(),
      };
      const device = {
        Name: "d1",
        GroupName: "g1",
        Host: "127.0.0.222",
        Port: 123,
        MusicServicesService: (musicServicesService as unknown) as MusicServicesService,
      } as SonosDevice;

      musicServicesService.ListAndParseAvailableServices.mockResolvedValue([
        AMAZON_MUSIC,
        APPLE_MUSIC,
      ]);

      expect(asDevice(device)).toEqual({
        name: "d1",
        group: "g1",
        ip: "127.0.0.222",
        port: 123,
      });
    });
  });

  describe("bonobService", () => {
    describe("when the bonob root does not have a trailing /", () => {
      it("should return a valid bonob service", () => {
        expect(
          bonobService("some-bonob", 876, "http://bonob.example.com")
        ).toEqual({
          name: "some-bonob",
          sid: 876,
          uri: `http://bonob.example.com/ws/sonos`,
          secureUri: `http://bonob.example.com/ws/sonos`,
          strings: {
            uri: `http://bonob.example.com/sonos/strings.xml`,
            version: STRINGS_VERSION,
          },
          presentation: {
            uri: `http://bonob.example.com/sonos/presentationMap.xml`,
            version: PRESENTATION_MAP_VERSION,
          },
          pollInterval: 1200,
          authType: "AppLink",
        });
      });
    });

    describe("when the bonob root does have a trailing /", () => {
      it("should return a valid bonob service", () => {
        expect(
          bonobService("some-bonob", 876, "http://bonob.example.com/")
        ).toEqual({
          name: "some-bonob",
          sid: 876,
          uri: `http://bonob.example.com/ws/sonos`,
          secureUri: `http://bonob.example.com/ws/sonos`,
          strings: {
            uri: `http://bonob.example.com/sonos/strings.xml`,
            version: STRINGS_VERSION,
          },
          presentation: {
            uri: `http://bonob.example.com/sonos/presentationMap.xml`,
            version: PRESENTATION_MAP_VERSION,
          },
          pollInterval: 1200,
          authType: "AppLink",
        });
      });
    });

    describe("when authType is specified", () => {
      it("should return a valid bonob service", () => {
        expect(
          bonobService("some-bonob", 876, "http://bonob.example.com", 'DeviceLink')
        ).toEqual({
          name: "some-bonob",
          sid: 876,
          uri: `http://bonob.example.com/ws/sonos`,
          secureUri: `http://bonob.example.com/ws/sonos`,
          strings: {
            uri: `http://bonob.example.com/sonos/strings.xml`,
            version: STRINGS_VERSION,
          },
          presentation: {
            uri: `http://bonob.example.com/sonos/presentationMap.xml`,
            version: PRESENTATION_MAP_VERSION,
          },
          pollInterval: 1200,
          authType: "DeviceLink",
        });
      });
    });
  });

  describe("asCustomdForm", () => {
    describe("when all values specified", () => {
      it("should return a form", () => {
        const csrfToken = uuid();
        const service: Service = {
          name: "the new service",
          sid: 888,
          uri: "http://aa.example.com",
          secureUri: "https://aa.example.com",
          strings: { uri: "http://strings.example.com", version: "26" },
          presentation: {
            uri: "http://presentation.example.com",
            version: "27",
          },
          pollInterval: 5600,
          authType: "UserId",
        };

        expect(asCustomdForm(csrfToken, service)).toEqual({
          csrfToken,
          sid: "888",
          name: "the new service",
          uri: "http://aa.example.com",
          secureUri: "https://aa.example.com",
          pollInterval: "5600",
          authType: "UserId",
          stringsVersion: "26",
          stringsUri: "http://strings.example.com",
          presentationMapVersion: "27",
          presentationMapUri: "http://presentation.example.com",
          manifestVersion: "0",
          manifestUri: "",
          containerType: "MService",
          caps: BONOB_CAPABILITIES
        });
      });
    });

    describe("when pollInterval undefined", () => {
      it("should default to 1200", () => {
        const service: Service = aService({ pollInterval: undefined });
        expect(asCustomdForm(uuid(), service).pollInterval).toEqual("1200");
      });
    });

    describe("when strings and presentation are undefined", () => {
      it("should default to 1200", () => {
        const service: Service = aService({
          strings: { uri: undefined, version: undefined },
          presentation: { uri: undefined, version: undefined },
        });
        const form = asCustomdForm(uuid(), service)
        expect(form.stringsUri).toEqual("");
        expect(form.stringsVersion).toEqual("");
        expect(form.presentationMapUri).toEqual("");
        expect(form.presentationMapVersion).toEqual("");
      });
    });
  });

  describe("when is disabled", () => {
    it("should return a disabled client", async () => {
      const disabled = sonos(false);

      expect(disabled).toEqual(SONOS_DISABLED);
      expect(await disabled.devices()).toEqual([]);
      expect(await disabled.services()).toEqual([]);
      expect(await disabled.register(aService())).toEqual(false);
    });
  });

  describe("sonos device discovery", () => {
    const device1 = {
      Name: "device1",
      GroupName: "group1",
      Host: "127.0.0.11",
      Port: 111,
    } as SonosDevice;

    const device2 = {
      Name: "device2",
      GroupName: "group2",
      Host: "127.0.0.22",
      Port: 222,
    } as SonosDevice;

    describe("when no sonos seed host is provided", () => {
      it("should perform auto-discovery", async () => {
        const sonosManager = {
          InitializeWithDiscovery: jest.fn(),
          Devices: [],
        };

        mockSonosManagerConstructor.mockReturnValue(
          (sonosManager as unknown) as SonosManager
        );
        sonosManager.InitializeWithDiscovery.mockResolvedValue(true);

        const actualDevices = await sonos(true, undefined).devices();

        expect(SonosManager).toHaveBeenCalledTimes(1);
        expect(sonosManager.InitializeWithDiscovery).toHaveBeenCalledWith(10);

        expect(actualDevices).toEqual([]);
      });
    });

    describe("when sonos seed host is empty string", () => {
      it("should perform auto-discovery", async () => {
        const sonosManager = {
          InitializeWithDiscovery: jest.fn(),
          Devices: [],
        };

        mockSonosManagerConstructor.mockReturnValue(
          (sonosManager as unknown) as SonosManager
        );
        sonosManager.InitializeWithDiscovery.mockResolvedValue(true);

        const actualDevices = await sonos(true, "").devices();

        expect(SonosManager).toHaveBeenCalledTimes(1);
        expect(sonosManager.InitializeWithDiscovery).toHaveBeenCalledWith(10);

        expect(actualDevices).toEqual([]);
      });
    });

    describe("when a sonos seed host is provided", () => {
      it("should perform auto-discovery", async () => {
        const seedHost = "theSeedsOfLife";

        const sonosManager = {
          InitializeFromDevice: jest.fn(),
          Devices: [],
        };

        mockSonosManagerConstructor.mockReturnValue(
          (sonosManager as unknown) as SonosManager
        );
        sonosManager.InitializeFromDevice.mockResolvedValue(true);

        const actualDevices = await sonos(true, seedHost).devices();

        expect(SonosManager).toHaveBeenCalledTimes(1);
        expect(sonosManager.InitializeFromDevice).toHaveBeenCalledWith(
          seedHost
        );

        expect(actualDevices).toEqual([]);
      });
    });

    describe("when some devices are found", () => {
      it("should be able to return them", async () => {
        const sonosManager = {
          InitializeWithDiscovery: jest.fn(),
          Devices: [device1, device2],
        };

        mockSonosManagerConstructor.mockReturnValue(
          (sonosManager as unknown) as SonosManager
        );
        sonosManager.InitializeWithDiscovery.mockResolvedValue(true);

        const actualDevices = await sonos(true, undefined).devices();

        expect(actualDevices).toEqual([
          {
            name: device1.Name,
            group: device1.GroupName,
            ip: device1.Host,
            port: device1.Port,
          },
          {
            name: device2.Name,
            group: device2.GroupName,
            ip: device2.Host,
            port: device2.Port,
          },
        ]);
      });
    });

    describe("when SonosManager initialisation returns false", () => {
      it("should return no devices", async () => {
        const sonosManager = {
          InitializeWithDiscovery: jest.fn(),
          Devices: [device1, device2],
        };

        mockSonosManagerConstructor.mockReturnValue(
          (sonosManager as unknown) as SonosManager
        );
        sonosManager.InitializeWithDiscovery.mockResolvedValue(false);

        expect(await sonos(true, "").devices()).toEqual([]);
      });
    });
  });

  describe("sonos service discovery", () => {
    const device1 = {
      Name: "device1",
      GroupName: "group1",
      Host: "127.0.0.11",
      Port: 111,
      MusicServicesService: {
        ListAndParseAvailableServices: jest.fn(),
      },
    };

    const device2 = {
      Name: "device2",
      GroupName: "group2",
      Host: "127.0.0.22",
      Port: 222,
    };

    beforeEach(() => {
      device1.MusicServicesService.ListAndParseAvailableServices.mockClear();
    });

    describe("when there are no devices", () => {
      it("should return no services", async () => {
        const sonosManager = {
          InitializeWithDiscovery: jest.fn(),
          Devices: [],
        };

        mockSonosManagerConstructor.mockReturnValue(
          (sonosManager as unknown) as SonosManager
        );
        sonosManager.InitializeWithDiscovery.mockResolvedValue(true);

        const services = await sonos().services();

        expect(SonosManager).toHaveBeenCalledTimes(1);
        expect(sonosManager.InitializeWithDiscovery).toHaveBeenCalledWith(10);

        expect(services).toEqual([]);
      });
    });

    describe("when there are some devices", () => {
      it("should return the services from the first device", async () => {
        const sonosManager = {
          InitializeWithDiscovery: jest.fn(),
          Devices: [device1, device2],
        };

        mockSonosManagerConstructor.mockReturnValue(
          (sonosManager as unknown) as SonosManager
        );
        sonosManager.InitializeWithDiscovery.mockResolvedValue(true);
        device1.MusicServicesService.ListAndParseAvailableServices.mockResolvedValue(
          [AMAZON_MUSIC, APPLE_MUSIC, AUDIBLE]
        );

        const services = await sonos().services();

        expect(SonosManager).toHaveBeenCalledTimes(1);
        expect(sonosManager.InitializeWithDiscovery).toHaveBeenCalledWith(10);

        expect(services).toEqual([
          asService(AMAZON_MUSIC),
          asService(APPLE_MUSIC),
          asService(AUDIBLE),
        ]);
      });
    });

    describe("when SonosManager initialisation returns false", () => {
      it("should return no devices", async () => {
        const sonosManager = {
          InitializeWithDiscovery: jest.fn(),
          Devices: [device1, device2],
        };

        mockSonosManagerConstructor.mockReturnValue(
          (sonosManager as unknown) as SonosManager
        );
        sonosManager.InitializeWithDiscovery.mockResolvedValue(false);

        const services = await sonos().services();

        expect(SonosManager).toHaveBeenCalledTimes(1);
        expect(sonosManager.InitializeWithDiscovery).toHaveBeenCalledWith(10);

        expect(services).toEqual([]);
      });
    });

    describe("when getting devices fails", () => {
      it("should return no devices", async () => {
        const sonosManager = {
          InitializeWithDiscovery: jest.fn(),
          Devices: () => {
            throw Error("Boom");
          },
        };

        mockSonosManagerConstructor.mockReturnValue(
          (sonosManager as unknown) as SonosManager
        );
        sonosManager.InitializeWithDiscovery.mockResolvedValue(true);

        const services = await sonos().services();

        expect(SonosManager).toHaveBeenCalledTimes(1);
        expect(sonosManager.InitializeWithDiscovery).toHaveBeenCalledWith(10);

        expect(services).toEqual([]);
      });
    });
  });

  describe("registering a service", () => {
    const device1 = aSonosDevice({
      Name: "d1",
      Host: "127.0.0.11",
      Port: 111,
    });

    const device2 = aSonosDevice({
      Name: "d2",
    });

    const POST_CONFIG = {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    };

    const serviceToAdd = aService({
      name: "new service",
      sid: 123,
    });

    const mockGet = jest.fn();
    const mockPost = jest.fn();

    beforeEach(() => {
      mockGet.mockClear();
      mockPost.mockClear();

      axios.get = mockGet;
      axios.post = mockPost;
    });

    describe("when successful", () => {
      it("should post the service into the first found sonos device, returning true", async () => {
        const sonosManager = {
          InitializeWithDiscovery: jest.fn(),
          Devices: [device1, device2],
        };

        mockSonosManagerConstructor.mockReturnValue(
          (sonosManager as unknown) as SonosManager
        );
        sonosManager.InitializeWithDiscovery.mockResolvedValue(true);

        const csrfToken = `csrfToken-${uuid()}`;

        mockGet.mockResolvedValue({
          status: 200,
          data: `<html><input name='csrfToken' value='${csrfToken}'></html>`,
        });
        mockPost.mockResolvedValue({ status: 200, data: "" });

        const result = await sonos().register(serviceToAdd);

        expect(mockGet).toHaveBeenCalledWith(
          `http://${device1.Host}:${device1.Port}/customsd`
        );

        expect(mockPost).toHaveBeenCalledWith(
          `http://${device1.Host}:${device1.Port}/customsd`,
          new URLSearchParams(qs.stringify(asCustomdForm(csrfToken, serviceToAdd))),
          POST_CONFIG
        );

        expect(result).toEqual(true);
      });
    });

    describe("when cannot find any devices", () => {
      it("should return false", async () => {
        const sonosManager = {
          InitializeWithDiscovery: jest.fn(),
          Devices: [],
        };

        mockSonosManagerConstructor.mockReturnValue(
          (sonosManager as unknown) as SonosManager
        );
        sonosManager.InitializeWithDiscovery.mockResolvedValue(true);

        const result = await sonos().register(serviceToAdd);

        expect(mockGet).not.toHaveBeenCalled();
        expect(mockPost).not.toHaveBeenCalled();

        expect(result).toEqual(false);
      });
    });

    describe("when cannot get csrfToken", () => {
      describe("when the token is missing", () => {
        it("should return false", async () => {
          const sonosManager = {
            InitializeWithDiscovery: jest.fn(),
            Devices: [device1, device2],
          };

          mockSonosManagerConstructor.mockReturnValue(
            (sonosManager as unknown) as SonosManager
          );
          sonosManager.InitializeWithDiscovery.mockResolvedValue(true);

          mockGet.mockResolvedValue({
            status: 200,
            data: `<html></html>`,
          });

          const result = await sonos().register(serviceToAdd);

          expect(mockPost).not.toHaveBeenCalled();

          expect(result).toEqual(false);
        });
      });

      describe("when the token call returns a non 200", () => {
        it("should return false", async () => {
          const sonosManager = {
            InitializeWithDiscovery: jest.fn(),
            Devices: [device1, device2],
          };

          mockSonosManagerConstructor.mockReturnValue(
            (sonosManager as unknown) as SonosManager
          );
          sonosManager.InitializeWithDiscovery.mockResolvedValue(true);

          mockGet.mockResolvedValue({
            status: 400,
            data: `<html></html>`,
          });

          const result = await sonos().register(serviceToAdd);

          expect(mockPost).not.toHaveBeenCalled();

          expect(result).toEqual(false);
        });
      });
    });

    describe("when posting in the service definition fails", () => {
      it("should return false", async () => {
        const sonosManager = {
          InitializeWithDiscovery: jest.fn(),
          Devices: [device1, device2],
        };

        mockSonosManagerConstructor.mockReturnValue(
          (sonosManager as unknown) as SonosManager
        );
        sonosManager.InitializeWithDiscovery.mockResolvedValue(true);

        const csrfToken = `csrfToken-${uuid()}`;

        mockGet.mockResolvedValue({
          status: 200,
          data: `<html><input name='csrfToken' value='${csrfToken}'></html>`,
        });
        mockPost.mockResolvedValue({ status: 500, data: "" });

        const result = await sonos().register(serviceToAdd);

        expect(result).toEqual(false);
      });
    });
  });
});
