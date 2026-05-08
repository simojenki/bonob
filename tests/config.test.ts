import { hostname } from "os";
import config, { COLOR, envVar } from "../src/config";

describe("envVar", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV };

    process.env["bnb-var"] = "bnb-var-value";
    process.env["bnb-legacy2"] = "bnb-legacy2-value";
    process.env["bnb-legacy3"] = "bnb-legacy3-value";
  });

  afterEach(() => {
    process.env = OLD_ENV;
  });

  describe("when the env var exists", () => {
    describe("and there are no legacy env vars that match", () => {
      it("should return the env var", () => {
        expect(envVar("bnb-var")).toEqual("bnb-var-value");
      });
    });

    describe("and there are legacy env vars that match", () => {
      it("should return the env var", () => {
        expect(
          envVar("bnb-var", {
            default: "not valid",
            legacy: ["bnb-legacy1", "bnb-legacy2", "bnb-legacy3"],
          })
        ).toEqual("bnb-var-value");
      });
    });
  });

  describe("when the env var doesnt exist", () => {
    describe("and there are no legacy env vars specified", () => {
      describe("and there is no default value specified", () => {
        it("should be undefined", () => {
          expect(envVar("bnb-not-set")).toBeUndefined();
        });
      });

      describe("and there is a default value specified", () => {
        it("should return the default", () => {
          expect(envVar("bnb-not-set", { default: "widget" })).toEqual(
            "widget"
          );
        });
      });
    });

    describe("when there are legacy env vars specified", () => {
      it("should return the value from the first matched legacy env var", () => {
        expect(
          envVar("bnb-not-set", {
            legacy: ["bnb-legacy1", "bnb-legacy2", "bnb-legacy3"],
          })
        ).toEqual("bnb-legacy2-value");
      });
    });
  });

  describe("validationPattern", () => {
    it("should fail when the value does not match the pattern", () => {
      expect(() =>
        envVar("bnb-var", {
          validationPattern: /^foobar$/,
        })
      ).toThrow(
        `Invalid value specified for 'bnb-var', must match ${/^foobar$/}`
      );
    });
  });
});

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
      it.each([
        [expectedDefault, ""],
        [expectedDefault, undefined],
        [true, "true"],
        [false, "false"],
        [false, "foo"],
      ])("should be %s when env var is '%s'", (expected, value) => {
        process.env[envVar] = value;
        expect(propertyGetter(config())).toEqual(expected);
      })
    });
  }

  describe("bonobUrl", () => {
    it("should be used when BNB_URL is specified", () => {
      const url = "http://bonob1.example.com:8877/";

      process.env["BNB_SECRET"] = "bonob";
      process.env["BNB_URL"] = url;

      expect(config().bonobUrl.href()).toEqual(url);
    });

    describe(`when BNB_URL is 'http://localhost'`, () => {
      it(`should process exit 1`, () => {
        process.env["BNB_URL"] = "http://localhost";
        const mockDeath = jest.fn() as unknown as (code?: number) => never;
        expect(config(mockDeath));
        expect(mockDeath).toHaveBeenCalledWith(1);
      });
    });

    describe("when BNB_URL is not specified", () => {
      beforeEach(() => {
        process.env["BNB_SECRET"] = "bonob";
      });

      it(`should default to http://${hostname()}:4534`, () => {
        expect(config().bonobUrl.href()).toEqual(
          `http://${hostname()}:4534/`
        );
      });

      describe("when BNB_PORT is specified as 3322", () => {
        it(`should default to http://${hostname()}:3322`, () => {
          process.env["BNB_PORT"] = "3322";
          expect(config().bonobUrl.href()).toEqual(
            `http://${hostname()}:3322/`
          );
        });
      });
    });
  });

  describe("icons", () => {
    beforeEach(() => {
      process.env["BNB_SECRET"] = "bonob";
    });

    describe("foregroundColor", () => {
      describe.each([
        "BNB_ICON_FOREGROUND_COLOR",
      ])("%s", (k) => {
        describe(`when ${k} is not specified`, () => {
          it(`should default to undefined`, () => {
            expect(config().icons.foregroundColor).toEqual(undefined);
          });
        });

        describe(`when ${k} is ''`, () => {
          it(`should default to undefined`, () => {
            process.env[k] = "";
            expect(config().icons.foregroundColor).toEqual(undefined);
          });
        });

        describe(`when ${k} is specified as a color`, () => {
          it(`should use it`, () => {
            process.env[k] = "pink";
            expect(config().icons.foregroundColor).toEqual("pink");
          });
        });

        describe(`when ${k} is specified as hex`, () => {
          it(`should use it`, () => {
            process.env[k] = "#1db954";
            expect(config().icons.foregroundColor).toEqual("#1db954");
          });
        });

        describe(`when ${k} is an invalid string`, () => {
          it(`should blow up`, () => {
            process.env[k] = "!dfasd";
            expect(() => config()).toThrow(
              `Invalid value specified for 'BNB_ICON_FOREGROUND_COLOR', must match ${COLOR}`
            );
          });
        });
      });
    });

    describe("backgroundColor", () => {
      describe.each([
        "BNB_ICON_BACKGROUND_COLOR",
      ])("%s", (k) => {
        describe(`when ${k} is not specified`, () => {
          it(`should default to undefined`, () => {
            expect(config().icons.backgroundColor).toEqual(undefined);
          });
        });

        describe(`when ${k} is ''`, () => {
          it(`should default to undefined`, () => {
            process.env[k] = "";
            expect(config().icons.backgroundColor).toEqual(undefined);
          });
        });

        describe(`when ${k} is specified as a color`, () => {
          it(`should use it`, () => {
            process.env[k] = "blue";
            expect(config().icons.backgroundColor).toEqual("blue");
          });
        });

        describe(`when ${k} is specified as hex`, () => {
          it(`should use it`, () => {
            process.env[k] = "#1db954";
            expect(config().icons.backgroundColor).toEqual("#1db954");
          });
        });

        describe(`when ${k} is an invalid string`, () => {
          it(`should blow up`, () => {
            process.env[k] = "!red";
            expect(() => config()).toThrow(
              `Invalid value specified for 'BNB_ICON_BACKGROUND_COLOR', must match ${COLOR}`
            );
          });
        });
      });
    });
  });

  describe("login theme", () => {
    beforeEach(() => {
      process.env["BNB_SECRET"] = "bonob";
    });

    it("should default to classic", () => {
      expect(config().loginTheme).toEqual("classic");
    });

    it(`should be overridable to navidrome-ish using BNB_LOGIN_THEME`, () => {
      process.env["BNB_LOGIN_THEME"] = "navidrome-ish";
      expect(config().loginTheme).toEqual("navidrome-ish");
    });

    it(`should be fall back to classic if invalid value is provided`, () => {
      process.env["BNB_LOGIN_THEME"] = "not-valid";
      expect(config().loginTheme).toEqual("classic");
    });
  });

  describe("secret", () => {
    it("should process exit 1 if not provided", () => {
      const mockDeath = jest.fn() as unknown as (code?: number) => never;
      expect(config(mockDeath));
      expect(mockDeath).toHaveBeenCalledWith(1);
    });

    it(`should be overridable using BNB_SECRET`, () => {
      const secret = "new-secret-that-is-really-really-really-long-isnt-it"
      process.env["BNB_SECRET"] = secret;
      expect(config().secret).toEqual(secret);
    });
  });

  describe("authTimeout", () => {
    beforeEach(() => {
      process.env["BNB_SECRET"] = "bonob";
    });

    it("should default to 1h", () => {
      expect(config().authTimeout).toEqual("1h");
    });

    it(`should be overridable using BNB_AUTH_TIMEOUT`, () => {
      process.env["BNB_AUTH_TIMEOUT"] = "33s";
      expect(config().authTimeout).toEqual("33s");
    });
  });
  
  describe("logRequests", () => {
    beforeEach(() => {
      process.env["BNB_SECRET"] = "bonob";
    });

    describeBooleanConfigValue(
      "logRequests",
      "BNB_SERVER_LOG_REQUESTS",
      false,
      (config) => config.logRequests
    );
  });

  describe("sonos", () => {
    beforeEach(() => {
      process.env["BNB_SECRET"] = "bonob";
    });

    describe("serviceName", () => {
      it("should default to bonob", () => {
        expect(config().sonos.serviceName).toEqual("bonob");
      });

      it("should be overridable using BNB_SONOS_SERVICE_NAME", () => {
        process.env["BNB_SONOS_SERVICE_NAME"] = "foobar1000";
        expect(config().sonos.serviceName).toEqual("foobar1000");
      });
    });

    describeBooleanConfigValue(
      "deviceDiscovery",
      "BNB_SONOS_DEVICE_DISCOVERY",
      true,
      (config) => config.sonos.discovery.enabled
    );

    describe("seedHost", () => {
      it("should default to undefined", () => {
        expect(config().sonos.discovery.seedHost).toBeUndefined();
      });

      it("should be overridable using BNB_SONOS_SEED_HOST", () => {
        process.env["BNB_SONOS_SEED_HOST"] = "123.456.789.0";
        expect(config().sonos.discovery.seedHost).toEqual("123.456.789.0");
      });
    });

    describeBooleanConfigValue(
      "autoRegister",
      "BNB_SONOS_AUTO_REGISTER",
      false,
      (config) => config.sonos.autoRegister
    );

    describe("sid", () => {
      it("should default to 246", () => {
        expect(config().sonos.sid).toEqual(246);
      });

      it("should be overridable using BNB_SONOS_SERVICE_ID", () => {
        process.env["BNB_SONOS_SERVICE_ID"] = "786";
        expect(config().sonos.sid).toEqual(786);
      });
    });
  });

  describe("subsonic", () => {
    beforeEach(() => {
      process.env["BNB_SECRET"] = "bonob";
    });

    describe("url", () => {
      it(`should default to http://${hostname()}:4533/`, () => {
        expect(config().subsonic.url.href()).toEqual(`http://${hostname()}:4533/`);
      });

      it(`should default to http://${hostname()}:4533/ when BNB_SUBSONIC_URL is ''`, () => {
        process.env["BNB_SUBSONIC_URL"] = "";
        expect(config().subsonic.url.href()).toEqual(`http://${hostname()}:4533/`);
      });

      it(`should use BNB_SUBSONIC_URL when specified`, () => {
        const url = "http://navidrome.example.com:1234/some-context-path";
        process.env["BNB_SUBSONIC_URL"] = url;
        expect(config().subsonic.url.href()).toEqual(url);
      });

      it(`should maintain trailing slash`, () => {
        const url = "http://navidrome.example.com:1234/";
        process.env["BNB_SUBSONIC_URL"] = url;
        expect(config().subsonic.url.href()).toEqual(url);
      });
    });

    describe("customClientsFor", () => {
      it("should default to undefined", () => {
        expect(config().subsonic.customClientsFor).toBeUndefined();
      });

      it(`should be overridable using BNB_SUBSONIC_CUSTOM_CLIENTS`, () => {
        process.env["BNB_SUBSONIC_CUSTOM_CLIENTS"] = "whoop/whoop";
        expect(config().subsonic.customClientsFor).toEqual("whoop/whoop");
      });
    });

    describe("artistImageCache", () => {
      it("should default to undefined", () => {
        expect(config().subsonic.artistImageCache).toBeUndefined();
      });

      it(`should be overridable for BNB_SUBSONIC_ARTIST_IMAGE_CACHE`, () => {
        process.env["BNB_SUBSONIC_ARTIST_IMAGE_CACHE"] = "/some/path";
        expect(config().subsonic.artistImageCache).toEqual("/some/path");
      });
    });

    describeBooleanConfigValue(
      "transcode",
      "BNB_SUBSONIC_TRANSCODE",
      true,
      (config) => config.subsonic.transcode
    );
  });

  describe("scrobbling and reporting", () => {
    beforeEach(() => {
      process.env["BNB_SECRET"] = "bonob";
    });

    describeBooleanConfigValue(
      "scrobbleTracks",
      "BNB_SCROBBLE_TRACKS",
      true,
      (config) => config.scrobbleTracks
    );

    describeBooleanConfigValue(
      "reportNowPlaying",
      "BNB_REPORT_NOW_PLAYING",
      true,
      (config) => config.reportNowPlaying
    );
  });
});
