import { assertSystem, BUrn, format, formatForURL, parse } from "../src/burn";

type BUrnSpec = {
  burn: BUrn;
  asString: string;
  shorthand: string;
};

describe("BUrn", () => {
  describe("format", () => {
    (
      [
        {
          burn: { system: "internal", resource: "icon:error" },
          asString: "bnb:internal:icon:error",
          shorthand: "bnb:i:icon:error",
        },
        {
          burn: {
            system: "external",
            resource: "http://example.com/widget.jpg",
          },
          asString: "bnb:external:http://example.com/widget.jpg",
          shorthand: "bnb:e:http://example.com/widget.jpg",
        },
        {
          burn: { system: "subsonic", resource: "art:1234" },
          asString: "bnb:subsonic:art:1234",
          shorthand: "bnb:s:art:1234",
        },
        {
          burn: { system: "navidrome", resource: "art:1234" },
          asString: "bnb:navidrome:art:1234",
          shorthand: "bnb:n:art:1234",
        },
      ] as BUrnSpec[]
    ).forEach(({ burn, asString, shorthand }) => {
      describe(asString, () => {
        it("can be formatted as string and then roundtripped back into BUrn", () => {
          const stringValue = format(burn);
          expect(stringValue).toEqual(asString);
          expect(parse(stringValue)).toEqual(burn);
        });

        it("can be formatted as shorthand string and then roundtripped back into BUrn", () => {
          const stringValue = format(burn, { shorthand: true });
          expect(stringValue).toEqual(shorthand);
          expect(parse(stringValue)).toEqual(burn);
        });

        describe(`encrypted ${asString}`, () => {
          it("can be formatted as an encrypted string and then roundtripped back into BUrn", () => {
            const stringValue = format(burn, { encrypt: true });
            expect(stringValue.startsWith("bnb:encrypted:")).toBeTruthy();
            expect(stringValue).not.toContain(burn.system);
            expect(stringValue).not.toContain(burn.resource);
            expect(parse(stringValue)).toEqual(burn);
          });

          it("can be formatted as an encrypted shorthand string and then roundtripped back into BUrn", () => {
            const stringValue = format(burn, {
              shorthand: true,
              encrypt: true,
            });
            expect(stringValue.startsWith("bnb:x:")).toBeTruthy();
            expect(stringValue).not.toContain(burn.system);
            expect(stringValue).not.toContain(burn.resource);
            expect(parse(stringValue)).toEqual(burn);
          });
        });
      });
    });
  });

  describe("formatForURL", () => {
    describe("external", () => {
      it("should be encrypted", () => {
        const burn = {
          system: "external",
          resource: "http://example.com/foo.jpg",
        };
        const formatted = formatForURL(burn);
        expect(formatted.startsWith("bnb:x:")).toBeTruthy();
        expect(formatted).not.toContain("http://example.com/foo.jpg");

        expect(parse(formatted)).toEqual(burn);
      });
    });

    describe("not external", () => {
      it("should be shorthand form", () => {
        expect(formatForURL({ system: "internal", resource: "foo" })).toEqual(
          "bnb:i:foo"
        );
        expect(
          formatForURL({ system: "subsonic", resource: "foo:bar" })
        ).toEqual("bnb:s:foo:bar");
      });
    });
  });

  describe("assertSystem", () => {
    it("should fail if the system is not equal", () => {
      const burn = { system: "external", resource: "something"};
      expect(() => assertSystem(burn, "subsonic")).toThrow(`Unsupported urn: '${format(burn)}'`)
    });

    it("should pass if the system is equal", () => {
      const burn = { system: "external", resource: "something"};
      expect(assertSystem(burn, "external")).toEqual(burn);
    });
  });
});

