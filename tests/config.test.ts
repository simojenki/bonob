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

  function describeBooleanConfigValue(name : string, envVar: string) {
    describe(name, () => {
      function expecting({
        value,
        expected,
      }: {
        value: string;
        expected: boolean;
      }) {
        describe(`when value is ${value}`, () => {
          it(`should be ${expected}`, () => {
            process.env[envVar] = value;
            expect((config() as any)[name]).toEqual(expected);
          });
        });
      }
  
      expecting({ value: "", expected: true });
      expecting({ value: "true", expected: true });
      expecting({ value: "false", expected: false });
      expecting({ value: "foo", expected: false });
    });
  };
  
  describeBooleanConfigValue("scrobbleTracks", "BONOB_SCROBBLE_TRACKS");
  describeBooleanConfigValue("reportNowPlaying", "BONOB_REPORT_NOW_PLAYING");
});
