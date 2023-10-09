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
      ).toThrowError(
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
      describe.each([
        "BNB_URL", 
        "BONOB_URL", 
        "BONOB_WEB_ADDRESS"
      ])("when %s is specified", (k) => {
        it("should be used", () => {
          const url = "http://bonob1.example.com:8877/";

          process.env["BNB_URL"] = "";
          process.env["BONOB_URL"] = "";
          process.env["BONOB_WEB_ADDRESS"] = "";
          process.env[k] = url;

          expect(config().bonobUrl.href()).toEqual(url);
        });
    });

    describe("when none of BNB_URL, BONOB_URL, BONOB_WEB_ADDRESS are specified", () => {
      describe("when BONOB_PORT is not specified", () => {
        it(`should default to http://${hostname()}:4534`, () => {
          expect(config().bonobUrl.href()).toEqual(
            `http://${hostname()}:4534/`
          );
        });
      });

      describe("when BNB_PORT is specified as 3322", () => {
        it(`should default to http://${hostname()}:3322`, () => {
          process.env["BNB_PORT"] = "3322";
          expect(config().bonobUrl.href()).toEqual(
            `http://${hostname()}:3322/`
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

  describe("icons", () => {
    describe("foregroundColor", () => {
      describe.each([
        "BNB_ICON_FOREGROUND_COLOR",
        "BONOB_ICON_FOREGROUND_COLOR",
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
        "BONOB_ICON_BACKGROUND_COLOR",
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

  describe("secret", () => {
    it("should default to bonob", () => {
      expect(config().secret).toEqual("bonob");
    });

    describe.each([
      "BNB_SECRET", 
      "BONOB_SECRET"
    ])("%s", (k) => {
      it(`should be overridable using ${k}`, () => {
        process.env[k] = "new secret";
        expect(config().secret).toEqual("new secret");
      });
    });
  });

  describe("authTimeout", () => {
    it("should default to 1h", () => {
      expect(config().authTimeout).toEqual("1h");
    });

    it(`should be overridable using BNB_AUTH_TIMEOUT`, () => {
      process.env["BNB_AUTH_TIMEOUT"] = "33s";
      expect(config().authTimeout).toEqual("33s");
    });
  });
  
  describe("logRequests", () => {
    describeBooleanConfigValue(
      "logRequests",
      "BNB_SERVER_LOG_REQUESTS",
      false,
      (config) => config.logRequests
    );
  });

  describe("sonos", () => {
    describe("serviceName", () => {
      it("should default to bonob", () => {
        expect(config().sonos.serviceName).toEqual("bonob");
      });

      describe.each([
        "BNB_SONOS_SERVICE_NAME", 
        "BONOB_SONOS_SERVICE_NAME"
      ])(
        "%s",
        (k) => {
          it("should be overridable", () => {
            process.env[k] = "foobar1000";
            expect(config().sonos.serviceName).toEqual("foobar1000");
          });
        }
      );
    });

    describe.each([
      "BNB_SONOS_DEVICE_DISCOVERY",
      "BONOB_SONOS_DEVICE_DISCOVERY",
    ])("%s", (k) => {
      describeBooleanConfigValue(
        "deviceDiscovery",
        k,
        true,
        (config) => config.sonos.discovery.enabled
      );
    });

    describe("seedHost", () => {
      it("should default to undefined", () => {
        expect(config().sonos.discovery.seedHost).toBeUndefined();
      });

      describe.each([
        "BNB_SONOS_SEED_HOST", 
        "BONOB_SONOS_SEED_HOST"
      ])(
        "%s",
        (k) => {
          it("should be overridable", () => {
            process.env[k] = "123.456.789.0";
            expect(config().sonos.discovery.seedHost).toEqual("123.456.789.0");
          });
        }
      );
    });

    describe.each([
      "BNB_SONOS_AUTO_REGISTER", 
      "BONOB_SONOS_AUTO_REGISTER"
    ])(
      "%s",
      (k) => {
        describeBooleanConfigValue(
          "autoRegister",
          k,
          false,
          (config) => config.sonos.autoRegister
        );
      }
    );

    describe("sid", () => {
      it("should default to 246", () => {
        expect(config().sonos.sid).toEqual(246);
      });

      describe.each([
        "BNB_SONOS_SERVICE_ID", 
        "BONOB_SONOS_SERVICE_ID"
      ])(
        "%s",
        (k) => {
          it("should be overridable", () => {
            process.env[k] = "786";
            expect(config().sonos.sid).toEqual(786);
          });
        }
      );
    });
  });

  describe("subsonic", () => {
    describe("url", () => {
      describe.each([
        "BNB_SUBSONIC_URL",
        "BONOB_SUBSONIC_URL",
        "BONOB_NAVIDROME_URL",
      ])("%s", (k) => {
        describe(`when ${k} is not specified`, () => {
          it(`should default to http://${hostname()}:4533`, () => {
            expect(config().subsonic.url).toEqual(`http://${hostname()}:4533`);
          });
        });

        describe(`when ${k} is ''`, () => {
          it(`should default to http://${hostname()}:4533`, () => {
            process.env[k] = "";
            expect(config().subsonic.url).toEqual(`http://${hostname()}:4533`);
          });
        });

        describe(`when ${k} is specified`, () => {
          it(`should use it for ${k}`, () => {
            const url = "http://navidrome.example.com:1234";
            process.env[k] = url;
            expect(config().subsonic.url).toEqual(url);
          });
        });

        describe(`when ${k} is specified with trailing slash`, () => {
          it(`should remove the trailing slash and use it for ${k}`, () => {
            const url = "http://navidrome.example.com:1234";
            process.env[k] = `${url}/`;
            expect(config().subsonic.url).toEqual(url);
          });
        });
      });
    });

    describe("customClientsFor", () => {
      it("should default to undefined", () => {
        expect(config().subsonic.customClientsFor).toBeUndefined();
      });

      describe.each([
        "BNB_SUBSONIC_CUSTOM_CLIENTS",
        "BONOB_SUBSONIC_CUSTOM_CLIENTS",
        "BONOB_NAVIDROME_CUSTOM_CLIENTS",
      ])("%s", (k) => {
        it(`should be overridable for ${k}`, () => {
          process.env[k] = "whoop/whoop";
          expect(config().subsonic.customClientsFor).toEqual("whoop/whoop");
        });
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
  });

  describe.each([
    "BNB_SCROBBLE_TRACKS", 
    "BONOB_SCROBBLE_TRACKS"
  ])("%s", (k) => {
    describeBooleanConfigValue(
      "scrobbleTracks",
      k,
      true,
      (config) => config.scrobbleTracks
    );
  });

  describe.each([
    "BNB_REPORT_NOW_PLAYING", 
    "BONOB_REPORT_NOW_PLAYING"
  ])(
    "%s",
    (k) => {
      describeBooleanConfigValue(
        "reportNowPlaying",
        k,
        true,
        (config) => config.reportNowPlaying
      );
    }
  );
});
