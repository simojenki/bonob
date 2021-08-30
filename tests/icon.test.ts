import dayjs from "dayjs";
import libxmljs from "libxmljs2";

import {
  ColorOverridingIcon,
  contains,
  containsWord,
  eq,
  HOLI_COLORS,
  Icon,
  iconForGenre,
  makeFestive,
  SvgIcon,
  Transformation,
} from "../src/icon";

describe("SvgIcon", () => {
  const xmlTidy = (xml: string) =>
    libxmljs.parseXmlString(xml, { noblanks: true, net: false }).toString();

  const svgIcon24 = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
  <path d="path1"/>
  <path d="path2" fill="none" stroke="#000"/>
  <path d="path3"/>
</svg>
`;

  const svgIcon128 = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <path d="path1"/>
  <path d="path2" fill="none" stroke="#000"/>
  <path d="path3"/>
</svg>
`;

  describe("with no transformation", () => {
    it("should be the same", () => {
      expect(new SvgIcon(svgIcon24).toString()).toEqual(xmlTidy(svgIcon24));
    });
  });

  describe("with a view port increase", () => {
    describe("of 50%", () => {
      describe("when the viewPort is of size 0 0 24 24", () => {
        it("should resize the viewPort", () => {
          expect(
            new SvgIcon(svgIcon24)
              .with({ viewPortIncreasePercent: 50 })
              .toString()
          ).toEqual(
            xmlTidy(`<?xml version="1.0" encoding="UTF-8"?>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="-4 -4 32 32">
              <path d="path1"/>
              <path d="path2" fill="none" stroke="#000"/>
              <path d="path3"/>
            </svg>
          `)
          );
        });
      });
      describe("when the viewPort is of size 0 0 128 128", () => {
        it("should resize the viewPort", () => {
          expect(
            new SvgIcon(svgIcon128)
              .with({ viewPortIncreasePercent: 50 })
              .toString()
          ).toEqual(
            xmlTidy(`<?xml version="1.0" encoding="UTF-8"?>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="-21 -21 170 170">
              <path d="path1"/>
              <path d="path2" fill="none" stroke="#000"/>
              <path d="path3"/>
            </svg>
          `)
          );
        });
      });
    });

    describe("of 0%", () => {
      it("should do nothing", () => {
        expect(
          new SvgIcon(svgIcon24).with({ viewPortIncreasePercent: 0 }).toString()
        ).toEqual(xmlTidy(svgIcon24));
      });
    });
  });

  describe("background color", () => {
    describe("with no viewPort increase", () => {
      it("should add a rectangle the same size as the original viewPort", () => {
        expect(
          new SvgIcon(svgIcon24).with({ backgroundColor: "red" }).toString()
        ).toEqual(
          xmlTidy(`<?xml version="1.0" encoding="UTF-8"?>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
              <rect x="0" y="0" width="24" height="24" fill="red"/>
              <path d="path1"/>
              <path d="path2" fill="none" stroke="#000"/>
              <path d="path3"/>
            </svg>
        `)
        );
      });
    });

    describe("with a viewPort increase", () => {
      it("should add a rectangle the same size as the original viewPort", () => {
        expect(
          new SvgIcon(svgIcon24)
            .with({ backgroundColor: "pink", viewPortIncreasePercent: 50 })
            .toString()
        ).toEqual(
          xmlTidy(`<?xml version="1.0" encoding="UTF-8"?>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="-4 -4 32 32">
              <rect x="-4" y="-4" width="36" height="36" fill="pink"/>
              <path d="path1"/>
              <path d="path2" fill="none" stroke="#000"/>
              <path d="path3"/>
            </svg>
        `)
        );
      });
    });

    describe("of undefined", () => {
      it("should not do anything", () => {
        expect(
          new SvgIcon(svgIcon24).with({ backgroundColor: undefined }).toString()
        ).toEqual(
          xmlTidy(`<?xml version="1.0" encoding="UTF-8"?>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
              <path d="path1"/>
              <path d="path2" fill="none" stroke="#000"/>
              <path d="path3"/>
            </svg>
        `)
        );
      });
    });

    describe("multiple times", () => {
      it("should use the most recent", () => {
        expect(
          new SvgIcon(svgIcon24)
            .with({ backgroundColor: "green" })
            .with({ backgroundColor: "red" })
            .toString()
        ).toEqual(
          xmlTidy(`<?xml version="1.0" encoding="UTF-8"?>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
              <rect x="0" y="0" width="24" height="24" fill="red"/>
              <path d="path1"/>
              <path d="path2" fill="none" stroke="#000"/>
              <path d="path3"/>
            </svg>
        `)
        );
      });
    });
  });

  describe("foreground color", () => {
    describe("with no viewPort increase", () => {
      it("should add a rectangle the same size as the original viewPort", () => {
        expect(
          new SvgIcon(svgIcon24).with({ foregroundColor: "red" }).toString()
        ).toEqual(
          xmlTidy(`<?xml version="1.0" encoding="UTF-8"?>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
              <path d="path1" fill="red"/>
              <path d="path2" fill="none" stroke="red"/>
              <path d="path3" fill="red"/>
            </svg>
        `)
        );
      });
    });

    describe("with a viewPort increase", () => {
      it("should add a rectangle the same size as the original viewPort", () => {
        expect(
          new SvgIcon(svgIcon24)
            .with({ foregroundColor: "pink", viewPortIncreasePercent: 50 })
            .toString()
        ).toEqual(
          xmlTidy(`<?xml version="1.0" encoding="UTF-8"?>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="-4 -4 32 32">
              <path d="path1" fill="pink"/>
              <path d="path2" fill="none" stroke="pink"/>
              <path d="path3" fill="pink"/>
            </svg>
        `)
        );
      });
    });

    describe("of undefined", () => {
      it("should not do anything", () => {
        expect(
          new SvgIcon(svgIcon24).with({ foregroundColor: undefined }).toString()
        ).toEqual(
          xmlTidy(`<?xml version="1.0" encoding="UTF-8"?>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
              <path d="path1"/>
              <path d="path2" fill="none" stroke="#000"/>
              <path d="path3"/>
            </svg>
        `)
        );
      });
    });

    describe("mutliple times", () => {
      it("should use the most recent", () => {
        expect(
          new SvgIcon(svgIcon24)
            .with({ foregroundColor: "blue" })
            .with({ foregroundColor: "red" })
            .toString()
        ).toEqual(
          xmlTidy(`<?xml version="1.0" encoding="UTF-8"?>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
              <path d="path1" fill="red"/>
              <path d="path2" fill="none" stroke="red"/>
              <path d="path3" fill="red"/>
            </svg>
        `)
        );
      });
    });
  });
});

class DummyIcon implements Icon {
  transformation: Partial<Transformation>;
  constructor(transformation: Partial<Transformation>) {
    this.transformation = transformation;
  }
  public with = (newTransformation: Partial<Transformation>) =>
    new DummyIcon({ ...this.transformation, ...newTransformation });

  public toString = () => JSON.stringify(this);
}

describe("ColorOverridingIcon", () => {
  describe("when the rule matches", () => {
    const icon = new DummyIcon({
      backgroundColor: "black",
      foregroundColor: "black",
    });

    describe("overriding some options", () => {
      const overriding = new ColorOverridingIcon(
        icon,
        () => true,
        () => ({ backgroundColor: "blue", foregroundColor: "red" })
      );

      describe("with", () => {
        it("should be the with of the underlieing icon with the overriden colors", () => {
          const result = overriding.with({
            viewPortIncreasePercent: 99,
            backgroundColor: "shouldBeIgnored",
            foregroundColor: "shouldBeIgnored",
          }) as DummyIcon;

          expect(result.transformation).toEqual({
            viewPortIncreasePercent: 99,
            backgroundColor: "blue",
            foregroundColor: "red",
          });
        });
      });

      describe("toString", () => {
        it("should be the toString of the underlieing icon with the overriden colors", () => {
          expect(overriding.toString()).toEqual(
            new DummyIcon({
              backgroundColor: "blue",
              foregroundColor: "red",
            }).toString()
          );
        });
      });
    });

    describe("overriding all options", () => {
      const overriding = new ColorOverridingIcon(
        icon,
        () => true,
        () => ({
          backgroundColor: "blue",
          foregroundColor: "red",
        })
      );

      describe("with", () => {
        it("should be the with of the underlieing icon with the overriden colors", () => {
          const result = overriding.with({
            viewPortIncreasePercent: 99,
            backgroundColor: "shouldBeIgnored",
            foregroundColor: "shouldBeIgnored",
          }) as DummyIcon;

          expect(result.transformation).toEqual({
            viewPortIncreasePercent: 99,
            backgroundColor: "blue",
            foregroundColor: "red",
          });
        });
      });

      describe("toString", () => {
        it("should be the toString of the underlieing icon with the overriden colors", () => {
          expect(overriding.toString()).toEqual(
            new DummyIcon({
              backgroundColor: "blue",
              foregroundColor: "red",
            }).toString()
          );
        });
      });
    });
  });

  describe("when the rule doesnt match", () => {
    const icon = new DummyIcon({
      backgroundColor: "black",
      foregroundColor: "black",
    });
    const overriding = new ColorOverridingIcon(
      icon,
      () => false,
      () => ({ backgroundColor: "blue", foregroundColor: "red" })
    );

    describe("with", () => {
      it("should use the provided transformation", () => {
        const result = overriding.with({
          viewPortIncreasePercent: 88,
          backgroundColor: "shouldBeUsed",
          foregroundColor: "shouldBeUsed",
        }) as DummyIcon;

        expect(result.transformation).toEqual({
          viewPortIncreasePercent: 88,
          backgroundColor: "shouldBeUsed",
          foregroundColor: "shouldBeUsed",
        });
      });
    });

    describe("toString", () => {
      it("should be the toString of the unchanged icon", () => {
        expect(overriding.toString()).toEqual(icon.toString());
      });
    });
  });
});

describe("makeFestive", () => {
  const icon = new DummyIcon({
    backgroundColor: "black",
    foregroundColor: "black",
  });
  let now = dayjs();

  const festiveIcon = makeFestive(icon, { now: () => now });

  describe("on a day that isn't festive", () => {
    beforeEach(() => {
      now = dayjs("2022/10/12");
    });

    it("should use the given colors", () => {
      const result = festiveIcon.with({
        viewPortIncreasePercent: 88,
        backgroundColor: "shouldBeUsed",
        foregroundColor: "shouldBeUsed",
      }) as DummyIcon;

      expect(result.transformation).toEqual({
        viewPortIncreasePercent: 88,
        backgroundColor: "shouldBeUsed",
        foregroundColor: "shouldBeUsed",
      });
    });
  });

  describe("on christmas day", () => {
    beforeEach(() => {
      now = dayjs("2022/12/25");
    });

    it("should use the christmas theme colors", () => {
      const result = festiveIcon.with({
        viewPortIncreasePercent: 25,
        backgroundColor: "shouldNotBeUsed",
        foregroundColor: "shouldNotBeUsed",
      }) as DummyIcon;

      expect(result.transformation).toEqual({
        viewPortIncreasePercent: 25,
        backgroundColor: "green",
        foregroundColor: "red",
      });
    });
  });

  describe("on halloween", () => {
    beforeEach(() => {
      now = dayjs("2022/10/31");
    });

    it("should use the given colors", () => {
      const result = festiveIcon.with({
        viewPortIncreasePercent: 12,
        backgroundColor: "shouldNotBeUsed",
        foregroundColor: "shouldNotBeUsed",
      }) as DummyIcon;

      expect(result.transformation).toEqual({
        viewPortIncreasePercent: 12,
        backgroundColor: "orange",
        foregroundColor: "black",
      });
    });
  });

  describe("on cny", () => {
    beforeEach(() => {
      now = dayjs("2022/02/01");
    });

    it("should use the given colors", () => {
      const result = festiveIcon.with({
        viewPortIncreasePercent: 12,
        backgroundColor: "shouldNotBeUsed",
        foregroundColor: "shouldNotBeUsed",
      }) as DummyIcon;

      expect(result.transformation).toEqual({
        viewPortIncreasePercent: 12,
        backgroundColor: "red",
        foregroundColor: "yellow",
      });
    });
  });

  describe("on holi", () => {
    beforeEach(() => {
      now = dayjs("2022/03/18");
    });

    it("should use the given colors", () => {
      const result = festiveIcon.with({
        viewPortIncreasePercent: 12,
        backgroundColor: "shouldNotBeUsed",
        foregroundColor: "shouldNotBeUsed",
      }) as DummyIcon;

      expect(result.transformation.viewPortIncreasePercent).toEqual(12);
      expect(
        HOLI_COLORS.includes(result.transformation.backgroundColor!)
      ).toEqual(true);
      expect(
        HOLI_COLORS.includes(result.transformation.foregroundColor!)
      ).toEqual(true);
      expect(result.transformation.backgroundColor).not.toEqual(
        result.transformation.foregroundColor
      );
    });
  });
});

describe("eq", () => {
  it("should be true when ===", () => {
    expect(eq("Foo")("foo")).toEqual(true);
  });

  it("should be false when not ===", () => {
    expect(eq("Foo")("bar")).toEqual(false);
  });
});

describe("contains", () => {
  it("should be true word is a substring", () => {
    expect(contains("Foo")("some foo bar")).toEqual(true);
  });

  it("should be false when not ===", () => {
    expect(contains("Foo")("some bar")).toEqual(false);
  });
});

describe("containsWord", () => {
  it("should be true word is a substring with space delim", () => {
    expect(containsWord("Foo")("some   foo   bar")).toEqual(true);
  });
  
  it("should be true word is a substring with hyphen delim", () => {
    expect(containsWord("Foo")("some----foo-bar")).toEqual(true);
  });

  it("should be false when not ===", () => {
    expect(containsWord("Foo")("somefoobar")).toEqual(false);
  });
});


describe("iconForGenre", () => {
  [
    ["Acid House", "mushroom"],
    ["African", "african"],
    ["Alternative Rock", "rock"],
    ["Americana", "americana"],
    ["Anti-Folk", "guitar"],
    ["Audio-Book", "book"],
    ["Australian Hip Hop", "oz"],
    ["Rap", "rap"],
    ["Hip Hop", "hipHop"],
    ["Hip-Hop", "hipHop"],
    ["Metal", "metal"],
    ["Horrorcore", "horror"],
    ["Punk", "punk"],
    ["blah", "music"],
  ].forEach(([genre, expected]) => {
    describe(`a genre of ${genre}`, () => {
      it(`should have an icon of ${expected}`, () => {
        const name = iconForGenre(genre!)!;
        expect(name).toEqual(expected);
      });
    });

    describe(`a genre of ${genre!.toLowerCase()}`, () => {
      it(`should have an icon of ${expected}`, () => {
        const name = iconForGenre(genre!)!;
        expect(name).toEqual(expected);
      });
    });
  });
});
