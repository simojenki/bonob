import { hostname } from "os";
import config from "../src/config";

describe("config", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV };
  });

  afterEach(() => {
    process.env = OLD_ENV;
  });

  function describeBooleanConfigValue(name: string, envVar: string, expectedDefault: boolean, propertyGetter: (config: any) => any) {
    describe(name, () => {
      function expecting({
        value,
        expected,
      }: {
        value: string;
        expected: boolean;
      }) {
        describe(`when value is '${value}'`, () => {
          it(`should be ${expected}`, () => {
            process.env[envVar] = value;
            expect(propertyGetter(config())).toEqual(expected);
          });
        });
      }

      expecting({ value: "", expected: expectedDefault });
      expecting({ value: "true", expected: true });
      expecting({ value: "false", expected: false });
      expecting({ value: "foo", expected: false });
    });
  };

  describe("secret", () => {
    it("should default to bonob", () => {
      expect(config().secret).toEqual("bonob");
    });

    it("should be overridable", () => {
      process.env["BONOB_SECRET"] = "new secret";
      expect(config().secret).toEqual("new secret");
    });
  });

  describe("sonos", () => {
    describe("serviceName", () => {
      it("should default to bonob", () => {
        expect(config().sonos.serviceName).toEqual("bonob");
      });

      it("should be overridable", () => {
        process.env["BONOB_SONOS_SERVICE_NAME"] = "foobar1000";
        expect(config().sonos.serviceName).toEqual("foobar1000");
      });
    });

    describeBooleanConfigValue("deviceDiscovery", "BONOB_SONOS_DEVICE_DISCOVERY", true, config => config.sonos.deviceDiscovery);

    describe("seedHost", () => {
      it("should default to undefined", () => {
        expect(config().sonos.seedHost).toBeUndefined();
      });

      it("should be overridable", () => {
        process.env["BONOB_SONOS_SEED_HOST"] = "123.456.789.0";
        expect(config().sonos.seedHost).toEqual("123.456.789.0");
      });
    });

    describeBooleanConfigValue("autoRegister", "BONOB_SONOS_AUTO_REGISTER", false, config => config.sonos.autoRegister);

    describe("sid", () => {
      it("should default to 246", () => {
        expect(config().sonos.sid).toEqual(246);
      });

      it("should be overridable", () => {
        process.env["BONOB_SONOS_SERVICE_ID"] = "786";
        expect(config().sonos.sid).toEqual(786);
      });
    });
  });

  describe("navidrome", () => {
    describe("url", () => {
      it("should default to http://${hostname()}:4533", () => {
        expect(config().navidrome.url).toEqual(`http://${hostname()}:4533`);
      });

      it("should be overridable", () => {
        process.env["BONOB_NAVIDROME_URL"] = "http://farfaraway.com";
        expect(config().navidrome.url).toEqual("http://farfaraway.com");
      });
    });

    describe("customClientsFor", () => {
      it("should default to undefined", () => {
        expect(config().navidrome.customClientsFor).toBeUndefined();
      });

      it("should be overridable", () => {
        process.env["BONOB_NAVIDROME_CUSTOM_CLIENTS"] = "whoop/whoop";
        expect(config().navidrome.customClientsFor).toEqual("whoop/whoop");
      });
    });
  });

  describeBooleanConfigValue("scrobbleTracks", "BONOB_SCROBBLE_TRACKS", true, config => config.scrobbleTracks);
  describeBooleanConfigValue("reportNowPlaying", "BONOB_REPORT_NOW_PLAYING", true, config => config.reportNowPlaying);
});
