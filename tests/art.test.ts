/* eslint-disable functional/prefer-readonly-type */
import { Art, assertSource, format, formatCoverArt, formatForURL, parse, parseCoverArt } from "../src/art";

type ArtSpec = {
  art: Art;
  asString: string;
  shorthand: string;
};

describe("Art", () => {
  describe("format", () => {
    (
      [
        {
          art: {
            source: "external",
            id: "http://example.com/widget.jpg",
          },
          asString: "bnb:external:http://example.com/widget.jpg",
          shorthand: "bnb:e:http://example.com/widget.jpg",
        },
        {
          art: { source: "subsonic", id: "1234" },
          asString: "bnb:subsonic:1234",
          shorthand: "bnb:s:1234",
        },
        {
          art: { source: "navidrome", id: "1234" },
          asString: "bnb:navidrome:1234",
          shorthand: "bnb:n:1234",
        },
      ] as ArtSpec[]
    ).forEach(({ art, asString, shorthand }) => {
      describe(asString, () => {
        it("can be formatted as string and then roundtripped back into Art", () => {
          const stringValue = format(art);
          expect(stringValue).toEqual(asString);
          expect(parse(stringValue)).toEqual(art);
        });

        it("can be formatted as shorthand string and then roundtripped back into Art", () => {
          const stringValue = format(art, { shorthand: true });
          expect(stringValue).toEqual(shorthand);
          expect(parse(stringValue)).toEqual(art);
        });

        describe(`encrypted ${asString}`, () => {
          it("can be formatted as an encrypted string and then roundtripped back into Art", () => {
            const stringValue = format(art, { encrypt: true });
            expect(stringValue.startsWith("bnb:encrypted:")).toBeTruthy();
            expect(stringValue).not.toContain(art.source);
            expect(stringValue).not.toContain(art.id);
            expect(parse(stringValue)).toEqual(art);
          });

          it("can be formatted as an encrypted shorthand string and then roundtripped back into Art", () => {
            const stringValue = format(art, {
              shorthand: true,
              encrypt: true,
            });
            expect(stringValue.startsWith("bnb:c:")).toBeTruthy();
            expect(stringValue).not.toContain(art.source);
            expect(stringValue).not.toContain(art.id);
            expect(parse(stringValue)).toEqual(art);
          });
        });
      });
    });
  });

  describe("formatForURL", () => {
    describe("external", () => {
      it("should be encrypted", () => {
        const art = {
          source: "external",
          id: "http://example.com/foo.jpg",
        };
        const formatted = formatForURL(art);
        expect(formatted.startsWith("bnb:c:")).toBeTruthy();
        expect(formatted).not.toContain("http://example.com/foo.jpg");

        expect(parse(formatted)).toEqual(art);
      });
    });

    describe("not external", () => {
      it("should be shorthand form", () => {
        expect(formatForURL({ source: "internal", id: "foo" })).toEqual(
          "bnb:i:foo"
        );
        expect(
          formatForURL({ source: "subsonic", id: "foo:bar" })
        ).toEqual("bnb:s:foo:bar");
      });
    });
  });

  describe("assertSource", () => {
    it("should fail if the source is not equal", () => {
      const art = { source: "external", id: "something"};
      expect(() => assertSource(art, "subsonic")).toThrow(`Unsupported urn: '${format(art)}'`)
    });

    it("should pass if the source is equal", () => {
      const art = { source: "external", id: "something"};
      expect(assertSource(art, "external")).toEqual(art);
    });
  });

  describe("coverArt", () => {
    const art = { source: "subsonic", id: "al-123" };

    it("can be formatted and then parsed back", () => {
      expect(parseCoverArt(formatCoverArt("token-123", art))).toEqual({ token: "token-123", art });
    });

    it("should not expose the token or art", () => {
      // decode each segment the way anyone holding the URL could
      const readable = formatCoverArt("token-123", art)
        .split(".")
        .flatMap((it) => [it, Buffer.from(it, "base64url").toString(), Buffer.from(it, "hex").toString()])
        .join(" ");

      expect(readable).not.toContain("token-123");
      expect(readable).not.toContain("al-123");
    });

    it("should reject values bonob did not issue", () => {
      const b64url = (value: string) => Buffer.from(value).toString("base64url");
      const unsigned = [
        b64url(JSON.stringify({ alg: "HS256" })),
        b64url(JSON.stringify({ t: "token-123", a: "bnb:e:http://127.0.0.1/internal" })),
        "",
      ].join(".");

      expect(() => parseCoverArt(unsigned)).toThrow();
    });
  });
});
