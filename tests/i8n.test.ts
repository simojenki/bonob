import i8n, { langs, LANG, KEY, keys, asLANGs } from "../src/i8n";

describe("i8n", () => {
  describe("asLANGs", () => {
    describe("when the value is empty string", () => {
      it("should return an empty array", () => {
        expect(asLANGs("")).toEqual([]);
        expect(asLANGs(";q=0.9,en;q=0.8")).toEqual([]);
      });
    });
    describe("when the value is undefined", () => {
      it("should return an empty array", () => {
        expect(asLANGs(undefined)).toEqual([]);
      });
    });
    describe("when there are multiple in the accept-langauge header", () => {
      it("should split them out and return them", () => {
        expect(asLANGs("en-GB,en-US;q=0.9,en;q=0.8")).toEqual([
          "en-GB",
          "en-US",
        ]);
      });
    });
    describe("when there are multiple in the accept-langauge header with spaces", () => {
      it("should split them out and return them", () => {
        expect(asLANGs("es-ES, es, en-US;q=0.9, en;q=0.8")).toEqual([
          "es-ES",
          "es",
          "en-US",
        ]);
      });
    });
  });

  describe("langs", () => {
    it("should be all langs that are explicitly defined", () => {
      expect(langs()).toEqual(["en-US", "nl-NL"]);
    });
  });

  describe("validity of translations", () => {
    it("all langs should have same keys as US", () => {
      langs().forEach((l) => {
        expect(keys(l as LANG)).toEqual(keys("en-US"));
      });
    });
  });

  describe("keys", () => {
    it("should equal the keys of en-US", () => {
      expect(keys()).toEqual(keys("en-US"));
    });
  });

  describe("fetching translations", () => {
    describe("with a single lang", () => {
      describe("and the lang is not represented", () => {
        describe("and there is no templating", () => {
          it("should return the en-US value", () => {
            expect(i8n("foo")("en-AU" as LANG)("artists")).toEqual("Artists");
          });
        });
  
        describe("and there is templating of the service name", () => {
          it("should return the en-US value templated", () => {
            expect(i8n("service123")("en-AU" as LANG)("AppLinkMessage")).toEqual(
              "Linking sonos with service123"
            );
          });
        });
      });
  
      describe("and the lang is represented", () => {
        describe("and there is no templating", () => {
          it("should return the value", () => {
            expect(i8n("foo")("en-US")("artists")).toEqual("Artists");
            expect(i8n("foo")("nl-NL")("artists")).toEqual("Artiesten");
          });
        });
  
        describe("and there is templating of the service name", () => {
          it("should return the value", () => {
            expect(i8n("service123")("en-US")("AppLinkMessage")).toEqual(
              "Linking sonos with service123"
            );
            expect(i8n("service456")("nl-NL")("AppLinkMessage")).toEqual(
              "Sonos koppelen aan service456"
            );
          });
        });
      });
    });

    describe("with multiple langs", () => {
      function itShouldReturn(serviceName: string, langs: string[], key: KEY, expected: string) {
        it(`should return '${expected}' for the serviceName=${serviceName}, langs=${langs}`, () => {
          expect(i8n(serviceName)(...langs)(key)).toEqual(expected);
        });
      };

      describe("and the first lang is an exact match", () => {
        describe("and there is no templating", () => {
          itShouldReturn("foo", ["en-US", "nl-NL"], "artists", "Artists");
          itShouldReturn("foo", ["nl-NL", "en-US"], "artists", "Artiesten");
        });
  
        describe("and there is templating of the service name", () => {
          itShouldReturn("service123", ["en-US", "nl-NL"], "AppLinkMessage", "Linking sonos with service123");
          itShouldReturn("service456", ["nl-NL", "en-US"], "AppLinkMessage", "Sonos koppelen aan service456");
        });
      });

      describe("and the first lang is a case insensitive match", () => {
        describe("and there is no templating", () => {
          itShouldReturn("foo", ["en-us", "nl-NL"], "artists", "Artists");
          itShouldReturn("foo", ["nl-nl", "en-US"], "artists", "Artiesten");
        });
  
        describe("and there is templating of the service name", () => {
          itShouldReturn("service123", ["en-us", "nl-NL"], "AppLinkMessage", "Linking sonos with service123");
          itShouldReturn("service456", ["nl-nl", "en-US"], "AppLinkMessage", "Sonos koppelen aan service456");
        });
      });

      describe("and the first lang is a lang match without region", () => {
        describe("and there is no templating", () => {
          itShouldReturn("foo", ["en", "nl-NL"], "artists", "Artists");
          itShouldReturn("foo", ["nl", "en-US"], "artists", "Artiesten");
        });
  
        describe("and there is templating of the service name", () => {
          itShouldReturn("service123", ["en", "nl-NL"], "AppLinkMessage", "Linking sonos with service123");
          itShouldReturn("service456", ["nl", "en-US"], "AppLinkMessage", "Sonos koppelen aan service456");
        });
      });

      describe("and the first lang is not a match, however there is an exact match in the provided langs", () => {
        describe("and there is no templating", () => {
          itShouldReturn("foo", ["something", "en-US", "nl-NL"], "artists", "Artists")
          itShouldReturn("foo", ["something", "nl-NL", "en-US"], "artists", "Artiesten")
        });
  
        describe("and there is templating of the service name", () => {
          itShouldReturn("service123", ["something", "en-US", "nl-NL"], "AppLinkMessage", "Linking sonos with service123")
          itShouldReturn("service456", ["something", "nl-NL", "en-US"], "AppLinkMessage", "Sonos koppelen aan service456")
        });
      });      

      describe("and the first lang is not a match, however there is a case insensitive match in the provided langs", () => {
        describe("and there is no templating", () => {
          itShouldReturn("foo", ["something", "en-us", "nl-nl"], "artists", "Artists")
          itShouldReturn("foo", ["something", "nl-nl", "en-us"], "artists", "Artiesten")
        });
  
        describe("and there is templating of the service name", () => {
          itShouldReturn("service123", ["something", "en-us", "nl-nl"], "AppLinkMessage", "Linking sonos with service123")
          itShouldReturn("service456", ["something", "nl-nl", "en-us"], "AppLinkMessage", "Sonos koppelen aan service456")
        });
      });      

      describe("and the first lang is not a match, however there is a lang match without region", () => {
        describe("and there is no templating", () => {
          itShouldReturn("foo", ["something", "en", "nl-nl"], "artists", "Artists")
          itShouldReturn("foo", ["something", "nl", "en-us"], "artists", "Artiesten")
        });
  
        describe("and there is templating of the service name", () => {
          itShouldReturn("service123", ["something", "en", "nl-nl"], "AppLinkMessage", "Linking sonos with service123")
          itShouldReturn("service456", ["something", "nl", "en-us"], "AppLinkMessage", "Sonos koppelen aan service456")
        });
      });      

      describe("and no lang is a match", () => {
        describe("and there is no templating", () => {
          itShouldReturn("foo", ["something", "something2"], "artists", "Artists")
        });
  
        describe("and there is templating of the service name", () => {
          itShouldReturn("service123", ["something", "something2"], "AppLinkMessage", "Linking sonos with service123")
        });
      });          
    });

    describe("when the lang exists but the KEY doesnt", () => {
      it("should blow up", () => {
        expect(() => i8n("foo")("en-US")("foobar123" as KEY)).toThrowError(
          "No translation found for en-US:foobar123"
        );
      });
    });

  });
});
