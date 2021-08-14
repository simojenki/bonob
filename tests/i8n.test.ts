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

    describe("with multiple langs", () => {
      describe("and the first lang is a match", () => {
        describe("and there is no templating", () => {
          it("should return the value for the first lang", () => {
            expect(i8n("foo")("en-US", "nl-NL")("artists")).toEqual("Artists");
            expect(i8n("foo")("nl-NL", "en-US")("artists")).toEqual("Artiesten");
          });
        });
  
        describe("and there is templating of the service name", () => {
          it("should return the value for the firt lang", () => {
            expect(i8n("service123")("en-US", "nl-NL")("AppLinkMessage")).toEqual(
              "Linking sonos with service123"
            );
            expect(i8n("service456")("nl-NL", "en-US")("AppLinkMessage")).toEqual(
              "Sonos koppelen aan service456"
            );
          });
        });
      });

      describe("and the first lang is not a match, however there is a match in the provided langs", () => {
        describe("and there is no templating", () => {
          it("should return the value for the first lang", () => {
            expect(i8n("foo")("something", "en-US", "nl-NL")("artists")).toEqual("Artists");
            expect(i8n("foo")("something", "nl-NL", "en-US")("artists")).toEqual("Artiesten");
          });
        });
  
        describe("and there is templating of the service name", () => {
          it("should return the value for the firt lang", () => {
            expect(i8n("service123")("something", "en-US", "nl-NL")("AppLinkMessage")).toEqual(
              "Linking sonos with service123"
            );
            expect(i8n("service456")("something", "nl-NL", "en-US")("AppLinkMessage")).toEqual(
              "Sonos koppelen aan service456"
            );
          });
        });
      });      

      describe("and no lang is a match", () => {
        describe("and there is no templating", () => {
          it("should return the value for the first lang", () => {
            expect(i8n("foo")("something", "something2")("artists")).toEqual("Artists");
          });
        });
  
        describe("and there is templating of the service name", () => {
          it("should return the value for the firt lang", () => {
            expect(i8n("service123")("something", "something2")("AppLinkMessage")).toEqual(
              "Linking sonos with service123"
            );
          });
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

    describe("when the lang is not represented", () => {
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
  });
});
