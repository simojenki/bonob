import { SonosManager, SonosDevice } from "@svrooij/sonos";
import { MusicServicesService } from "@svrooij/sonos/lib/services";
import { shuffle } from "underscore";

jest.mock("@svrooij/sonos");

import { AMAZON_MUSIC, APPLE_MUSIC, AUDIBLE } from "./music_services";

import sonos, {
  SONOS_DISABLED,
  asDevice,
  Device,
  servicesFrom,
  registrationStatus,
} from "../src/sonos";

const mockSonosManagerConstructor = <jest.Mock<SonosManager>>SonosManager;

describe("sonos", () => {
  beforeEach(() => {
    mockSonosManagerConstructor.mockClear();
  });

  describe("bonobRegistrationStatus", () => {
    describe("when bonob is registered", () => {
      it("should return 'registered'", () => {
        const bonob = {
          name: "some bonob",
          id: 123,
        };
        expect(
          registrationStatus(
            [
              { id: 1, name: "not bonob" },
              bonob,
              { id: 2, name: "also not bonob" },
            ],
            bonob
          )
        ).toBe("registered");
      });
    });

    describe("when bonob is not registered", () => {
      it("should return not-registered", () => {
        expect(
          registrationStatus([{ id: 1, name: "not bonob" }], {
            name: "bonob",
            id: 999,
          })
        ).toBe("not-registered");
      });
    });
  });

  describe("asDevice", () => {
    it("should convert", async () => {
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

      expect(await asDevice(device)).toEqual({
        name: "d1",
        group: "g1",
        ip: "127.0.0.222",
        port: 123,
        services: [
          {
            name: AMAZON_MUSIC.Name,
            id: AMAZON_MUSIC.Id,
          },
          {
            name: APPLE_MUSIC.Name,
            id: APPLE_MUSIC.Id,
          },
        ],
      });
    });
  });

  function someDevice(params: Partial<Device> = {}): Device {
    const device = {
      name: "device123",
      group: "",
      ip: "127.0.0.11",
      port: 123,
      services: [],
    };
    return { ...device, ...params };
  }

  describe("servicesFrom", () => {
    it("should only return uniq services, sorted by name", () => {
      const service1 = { id: 1, name: "D" };
      const service2 = { id: 2, name: "B" };
      const service3 = { id: 3, name: "C" };
      const service4 = { id: 4, name: "A" };

      const d1 = someDevice({ services: shuffle([service1, service2]) });
      const d2 = someDevice({
        services: shuffle([service1, service2, service3]),
      });
      const d3 = someDevice({ services: shuffle([service4]) });

      const devices: Device[] = [d1, d2, d3];

      expect(servicesFrom(devices)).toEqual([
        service4,
        service2,
        service3,
        service1,
      ]);
    });
  });

  describe("when is disabled", () => {
    it("should return a disabled client", async () => {
      const disabled = sonos("disabled");

      expect(disabled).toEqual(SONOS_DISABLED);
      expect(await disabled.devices()).toEqual([]);
    });
  });

  describe("sonos device discovery", () => {
    const device1_MusicServicesService = {
      ListAndParseAvailableServices: jest.fn(),
    };
    const device1 = {
      Name: "device1",
      GroupName: "group1",
      Host: "127.0.0.11",
      Port: 111,
      MusicServicesService: (device1_MusicServicesService as unknown) as MusicServicesService,
    } as SonosDevice;

    const device2_MusicServicesService = {
      ListAndParseAvailableServices: jest.fn(),
    };
    const device2 = {
      Name: "device2",
      GroupName: "group2",
      Host: "127.0.0.22",
      Port: 222,
      MusicServicesService: (device2_MusicServicesService as unknown) as MusicServicesService,
    } as SonosDevice;

    beforeEach(() => {
      device1_MusicServicesService.ListAndParseAvailableServices.mockClear();
      device2_MusicServicesService.ListAndParseAvailableServices.mockClear();
    });

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

        const actualDevices = await sonos(undefined).devices();

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

        const actualDevices = await sonos("").devices();

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

        const actualDevices = await sonos(seedHost).devices();

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

        device1_MusicServicesService.ListAndParseAvailableServices.mockResolvedValue(
          [AMAZON_MUSIC, APPLE_MUSIC]
        );
        device2_MusicServicesService.ListAndParseAvailableServices.mockResolvedValue(
          [AUDIBLE]
        );

        const actualDevices = await sonos(undefined).devices();

        expect(
          device1_MusicServicesService.ListAndParseAvailableServices
        ).toHaveBeenCalled();
        expect(
          device2_MusicServicesService.ListAndParseAvailableServices
        ).toHaveBeenCalled();

        expect(actualDevices).toEqual([
          {
            name: device1.Name,
            group: device1.GroupName,
            ip: device1.Host,
            port: device1.Port,
            services: [
              {
                name: AMAZON_MUSIC.Name,
                id: AMAZON_MUSIC.Id,
              },
              {
                name: APPLE_MUSIC.Name,
                id: APPLE_MUSIC.Id,
              },
            ],
          },
          {
            name: device2.Name,
            group: device2.GroupName,
            ip: device2.Host,
            port: device2.Port,
            services: [
              {
                name: AUDIBLE.Name,
                id: AUDIBLE.Id,
              },
            ],
          },
        ]);
      });
    });

    describe("when initialisation returns false", () => {
      it("should return empty []", async () => {
        const initialize = jest.fn();
        const sonosManager = {
          InitializeWithDiscovery: initialize as (
            x: number
          ) => Promise<boolean>,
          Devices: [device1, device2],
        } as SonosManager;

        mockSonosManagerConstructor.mockReturnValue(sonosManager);
        initialize.mockResolvedValue(false);

        const actualDevices = await sonos("").devices();

        expect(SonosManager).toHaveBeenCalledTimes(1);
        expect(initialize).toHaveBeenCalledWith(10);

        expect(actualDevices).toEqual([]);
      });
    });

    describe("when getting devices fails", () => {
      it("should return empty []", async () => {
        const initialize = jest.fn();

        const sonosManager = ({
          InitializeWithDiscovery: initialize as (
            x: number
          ) => Promise<boolean>,
          Devices: () => {
            throw Error("Boom");
          },
        } as unknown) as SonosManager;

        mockSonosManagerConstructor.mockReturnValue(sonosManager);
        initialize.mockResolvedValue(true);

        const actualDevices = await sonos("").devices();

        expect(SonosManager).toHaveBeenCalledTimes(1);
        expect(initialize).toHaveBeenCalledWith(10);

        expect(actualDevices).toEqual([]);
      });
    });
  });
});
