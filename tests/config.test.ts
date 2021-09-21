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

  function describeBooleanConfigValue(
    name: string,
    envVar: string,
    expectedDefault: boolean,
    propertyGetter: (config: any) => any
  ) {
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
  }

  describe("bonobUrl", () => {
    describe("when BONOB_URL is specified", () => {
      it("should be used", () => {
        const url = "http://bonob1.example.com:8877/";
        process.env["BONOB_URL"] = url;

        expect(config().bonobUrl.href()).toEqual(url);
      });
    });

    describe("when BONOB_URL is not specified, however legacy BONOB_WEB_ADDRESS is specified", () => {
      it("should be used", () => {
        const url = "http://bonob2.example.com:9988/";
        process.env["BONOB_URL"] = "";
        process.env["BONOB_WEB_ADDRESS"] = url;

        expect(config().bonobUrl.href()).toEqual(url);
      });
    });

    describe("when neither BONOB_URL nor BONOB_WEB_ADDRESS are specified", () => {
      describe("when BONOB_PORT is not specified", () => {
        it(`should default to http://${hostname()}:4534`, () => {
          expect(config().bonobUrl.href()).toEqual(
            `http://${hostname()}:4534/`
          );
        });
      });

      describe("when BONOB_PORT is specified as 3322", () => {
        it(`should default to http://${hostname()}:3322`, () => {
          process.env["BONOB_PORT"] = "3322";
          expect(config().bonobUrl.href()).toEqual(
            `http://${hostname()}:3322/`
          );
        });
      });
    });
  });

  describe("navidrome", () => {
    describe("url", () => {
      describe("when BONOB_NAVIDROME_URL is not specified", () => {
        it(`should default to http://${hostname()}:4533`, () => {
          expect(config().navidrome.url).toEqual(`http://${hostname()}:4533`);
        });
      });

      describe("when BONOB_NAVIDROME_URL is ''", () => {
        it(`should default to http://${hostname()}:4533`, () => {
          process.env["BONOB_NAVIDROME_URL"] = "";
          expect(config().navidrome.url).toEqual(`http://${hostname()}:4533`);
        });
      });

      describe("when BONOB_NAVIDROME_URL is specified", () => {
        it(`should use it`, () => {
          const url = "http://navidrome.example.com:1234";
          process.env["BONOB_NAVIDROME_URL"] = url;
          expect(config().navidrome.url).toEqual(url);
        });
      });
    });
  });

  describe("icons", () => {
    describe("foregroundColor", () => {
      describe("when BONOB_ICON_FOREGROUND_COLOR is not specified", () => {
        it(`should default to undefined`, () => {
          expect(config().icons.foregroundColor).toEqual(undefined);
        });
      });

      describe("when BONOB_ICON_FOREGROUND_COLOR is ''", () => {
        it(`should default to undefined`, () => {
          process.env["BONOB_ICON_FOREGROUND_COLOR"] = "";
          expect(config().icons.foregroundColor).toEqual(undefined);
        });
      });

      describe("when BONOB_ICON_FOREGROUND_COLOR is specified", () => {
        it(`should use it`, () => {
          process.env["BONOB_ICON_FOREGROUND_COLOR"] = "pink";
          expect(config().icons.foregroundColor).toEqual("pink");
        });
      });

      describe("when BONOB_ICON_FOREGROUND_COLOR is an invalid string", () => {
        it(`should blow up`, () => {
          process.env["BONOB_ICON_FOREGROUND_COLOR"] = "#dfasd";
          expect(() => config()).toThrow(
            "Invalid color specified for BONOB_ICON_FOREGROUND_COLOR"
          );
        });
      });
    });

    describe("backgroundColor", () => {
      describe("when BONOB_ICON_BACKGROUND_COLOR is not specified", () => {
        it(`should default to undefined`, () => {
          expect(config().icons.backgroundColor).toEqual(undefined);
        });
      });

      describe("when BONOB_ICON_BACKGROUND_COLOR is ''", () => {
        it(`should default to undefined`, () => {
          process.env["BONOB_ICON_BACKGROUND_COLOR"] = "";
          expect(config().icons.backgroundColor).toEqual(undefined);
        });
      });

      describe("when BONOB_ICON_BACKGROUND_COLOR is specified", () => {
        it(`should use it`, () => {
          process.env["BONOB_ICON_BACKGROUND_COLOR"] = "blue";
          expect(config().icons.backgroundColor).toEqual("blue");
        });
      });

      describe("when BONOB_ICON_BACKGROUND_COLOR is an invalid string", () => {
        it(`should blow up`, () => {
          process.env["BONOB_ICON_BACKGROUND_COLOR"] = "#red";
          expect(() => config()).toThrow(
            "Invalid color specified for BONOB_ICON_BACKGROUND_COLOR"
          );
        });
      });
    });
  });

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

    describeBooleanConfigValue(
      "deviceDiscovery",
      "BONOB_SONOS_DEVICE_DISCOVERY",
      true,
      (config) => config.sonos.discovery.enabled
    );

    describe("seedHost", () => {
      it("should default to undefined", () => {
        expect(config().sonos.discovery.seedHost).toBeUndefined();
      });

      it("should be overridable", () => {
        process.env["BONOB_SONOS_SEED_HOST"] = "123.456.789.0";
        expect(config().sonos.discovery.seedHost).toEqual("123.456.789.0");
      });
    });

    describeBooleanConfigValue(
      "autoRegister",
      "BONOB_SONOS_AUTO_REGISTER",
      false,
      (config) => config.sonos.autoRegister
    );

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

  describeBooleanConfigValue(
    "scrobbleTracks",
    "BONOB_SCROBBLE_TRACKS",
    true,
    (config) => config.scrobbleTracks
  );
  describeBooleanConfigValue(
    "reportNowPlaying",
    "BONOB_REPORT_NOW_PLAYING",
    true,
    (config) => config.reportNowPlaying
  );
});
