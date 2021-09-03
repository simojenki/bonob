import dayjs from "dayjs";
import libxmljs from "libxmljs2";

import {
  contains,
  containsWord,
  eq,
  HOLI_COLORS,
  Icon,
  iconForGenre,
  SvgIcon,
  IconFeatures,
  IconSpec,
  ICONS,
  Transformer,
  transform,
  maybeTransform,
  festivals,
  allOf,
  features,
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

  describe("with no features", () => {
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
              .with({ features: { viewPortIncreasePercent: 50 } })
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
              .with({ features: { viewPortIncreasePercent: 50 } })
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
          new SvgIcon(svgIcon24)
            .with({ features: { viewPortIncreasePercent: 0 } })
            .toString()
        ).toEqual(xmlTidy(svgIcon24));
      });
    });
  });

  describe("background color", () => {
    describe("with no viewPort increase", () => {
      it("should add a rectangle the same size as the original viewPort", () => {
        expect(
          new SvgIcon(svgIcon24)
            .with({ features: { backgroundColor: "red" } })
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

    describe("with a viewPort increase", () => {
      it("should add a rectangle the same size as the original viewPort", () => {
        expect(
          new SvgIcon(svgIcon24)
            .with({
              features: {
                backgroundColor: "pink",
                viewPortIncreasePercent: 50,
              },
            })
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
          new SvgIcon(svgIcon24)
            .with({ features: { backgroundColor: undefined } })
            .toString()
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
            .with({ features: { backgroundColor: "green" } })
            .with({ features: { backgroundColor: "red" } })
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
          new SvgIcon(svgIcon24)
            .with({ features: { foregroundColor: "red" } })
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

    describe("with a viewPort increase", () => {
      it("should add a rectangle the same size as the original viewPort", () => {
        expect(
          new SvgIcon(svgIcon24)
            .with({
              features: {
                foregroundColor: "pink",
                viewPortIncreasePercent: 50,
              },
            })
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
          new SvgIcon(svgIcon24)
            .with({ features: { foregroundColor: undefined } })
            .toString()
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
            .with({ features: { foregroundColor: "blue" } })
            .with({ features: { foregroundColor: "red" } })
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

  describe("swapping the svg", () => {
    describe("with no other changes", () => {
      it("should swap out the svg, but maintain the IconFeatures", () => {
        expect(
          new SvgIcon(svgIcon24, {
            foregroundColor: "blue",
            backgroundColor: "green",
            viewPortIncreasePercent: 50,
          })
            .with({ svg: svgIcon128 })
            .toString()
        ).toEqual(
          xmlTidy(`<?xml version="1.0" encoding="UTF-8"?>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="-21 -21 170 170">
            <rect x="-21" y="-21" width="191" height="191" fill="green"/>
            <path d="path1" fill="blue"/>
            <path d="path2" fill="none" stroke="blue"/>
            <path d="path3" fill="blue"/>
          </svg>
        `)
        );
      });
    });

    describe("with no other changes", () => {
      it("should swap out the svg, but maintain the IconFeatures", () => {
        expect(
          new SvgIcon(svgIcon24, {
            foregroundColor: "blue",
            backgroundColor: "green",
            viewPortIncreasePercent: 50,
          })
            .with({
              svg: svgIcon128,
              features: {
                foregroundColor: "pink",
                backgroundColor: "red",
                viewPortIncreasePercent: 0,
              },
            })
            .toString()
        ).toEqual(
          xmlTidy(`<?xml version="1.0" encoding="UTF-8"?>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
            <rect x="0" y="0" width="128" height="128" fill="red"/>
            <path d="path1" fill="pink"/>
            <path d="path2" fill="none" stroke="pink"/>
            <path d="path3" fill="pink"/>
          </svg>
        `)
        );
      });
    });
  });
});

class DummyIcon implements Icon {
  svg: string;
  features: Partial<IconFeatures>;
  constructor(svg: string, features: Partial<IconFeatures>) {
    this.svg = svg;
    this.features = features;
  }

  public apply = (transformer: Transformer): Icon => transformer(this);

  public with = ({ svg, features }: Partial<IconSpec>) => {
    return new DummyIcon(svg || this.svg, {
      ...this.features,
      ...(features || {}),
    });
  };

  public toString = () =>
    JSON.stringify({ svg: this.svg, features: this.features });
}

describe("transform", () => {
  describe("when the features contains no svg", () => {
    it("should apply the overriding transform ontop of the requested transform", () => {
      const original = new DummyIcon("original", {
        backgroundColor: "black",
        foregroundColor: "black",
      });
      const result = original
        .with({
          features: {
            viewPortIncreasePercent: 100,
            foregroundColor: "blue",
            backgroundColor: "blue",
          },
        })
        .apply(
          transform({
            features: {
              foregroundColor: "override1",
              backgroundColor: "override2",
            },
          })
        ) as DummyIcon;

      expect(result.svg).toEqual("original");
      expect(result.features).toEqual({
        viewPortIncreasePercent: 100,
        foregroundColor: "override1",
        backgroundColor: "override2",
      });
    });
  });

  describe("when the features contains an svg", () => {
    it("should use the newly provided svg", () => {
      const original = new DummyIcon("original", {
        backgroundColor: "black",
        foregroundColor: "black",
      });
      const result = original
        .with({
          features: {
            viewPortIncreasePercent: 100,
            foregroundColor: "blue",
            backgroundColor: "blue",
          },
        })
        .apply(
          transform({
            svg: "new",
          })
        ) as DummyIcon;

      expect(result.svg).toEqual("new");
      expect(result.features).toEqual({
        viewPortIncreasePercent: 100,
        foregroundColor: "blue",
        backgroundColor: "blue",
      });
    });
  });
});

describe("features", () => {
  it("should apply the features", () => {
    const original = new DummyIcon("original", {
      backgroundColor: "black",
      foregroundColor: "black",
    });
    const result = original.apply(
      features({
        viewPortIncreasePercent: 100,
        foregroundColor: "blue",
        backgroundColor: "blue",
      })
    ) as DummyIcon;

    expect(result.features).toEqual({
      viewPortIncreasePercent: 100,
      foregroundColor: "blue",
      backgroundColor: "blue",
    });
  });
});

describe("allOf", () => {
  it("should apply all composed transforms", () => {
    const result = new DummyIcon("original", {
      foregroundColor: "black",
      backgroundColor: "black",
      viewPortIncreasePercent: 0,
    }).apply(
      allOf(
        (icon: Icon) => icon.with({ svg: "foo" }),
        (icon: Icon) => icon.with({ features: { backgroundColor: "red" } }),
        (icon: Icon) => icon.with({ features: { foregroundColor: "blue" } })
      )
    ) as DummyIcon;

    expect(result.svg).toEqual("foo");
    expect(result.features).toEqual({
      foregroundColor: "blue",
      backgroundColor: "red",
      viewPortIncreasePercent: 0,
    });
  });
});

describe("maybeTransform", () => {
  describe("when the rule matches", () => {
    const original = new DummyIcon("original", {
      backgroundColor: "black",
      foregroundColor: "black",
    });

    describe("transforming the color", () => {
      const result = original
        .with({
          features: {
            viewPortIncreasePercent: 99,
            backgroundColor: "shouldBeIgnored",
            foregroundColor: "shouldBeIgnored",
          },
        })
        .apply(
          maybeTransform(
            () => true,
            transform({
              features: {
                backgroundColor: "blue",
                foregroundColor: "red",
              },
            })
          )
        ) as DummyIcon;

      describe("with", () => {
        it("should be the with of the underlieing icon with the overriden colors", () => {
          expect(result.svg).toEqual("original");
          expect(result.features).toEqual({
            viewPortIncreasePercent: 99,
            backgroundColor: "blue",
            foregroundColor: "red",
          });
        });
      });
    });

    describe("overriding all options", () => {
      const result = original
        .with({
          features: {
            viewPortIncreasePercent: 99,
            backgroundColor: "shouldBeIgnored",
            foregroundColor: "shouldBeIgnored",
          },
        })
        .apply(
          maybeTransform(
            () => true,
            transform({
              features: {
                backgroundColor: "blue",
                foregroundColor: "red",
              },
            })
          )
        ) as DummyIcon;

      describe("with", () => {
        it("should be the with of the underlieing icon with the overriden colors", () => {
          expect(result.features).toEqual({
            viewPortIncreasePercent: 99,
            backgroundColor: "blue",
            foregroundColor: "red",
          });
        });
      });
    });
  });

  describe("when the rule doesnt match", () => {
    const original = new DummyIcon("original", {
      backgroundColor: "black",
      foregroundColor: "black",
    });
    const result = original
      .with({
        features: {
          viewPortIncreasePercent: 88,
          backgroundColor: "shouldBeUsed",
          foregroundColor: "shouldBeUsed",
        },
      })
      .apply(
        maybeTransform(
          () => false,
          transform({
            features: { backgroundColor: "blue", foregroundColor: "red" },
          })
        )
      ) as DummyIcon;

    describe("with", () => {
      it("should use the provided features", () => {
        expect(result.features).toEqual({
          viewPortIncreasePercent: 88,
          backgroundColor: "shouldBeUsed",
          foregroundColor: "shouldBeUsed",
        });
      });
    });
  });
});

describe("festivals", () => {
  const original = new DummyIcon("original", {
    backgroundColor: "black",
    foregroundColor: "black",
  });
  let now = dayjs();
  const clock = { now: () => now };

  describe("on a day that isn't festive", () => {
    beforeEach(() => {
      now = dayjs("2022/10/12");
    });

    it("should use the given colors", () => {
      const result = original
        .apply(
          features({
            viewPortIncreasePercent: 88,
            backgroundColor: "shouldBeUsed",
            foregroundColor: "shouldBeUsed",
          })
        )
        .apply(festivals(clock)) as DummyIcon;

      expect(result.toString()).toEqual(
        new DummyIcon("original", {
          backgroundColor: "shouldBeUsed",
          foregroundColor: "shouldBeUsed",
          viewPortIncreasePercent: 88,
        }).toString()
      );
    });
  });

  describe("on christmas day", () => {
    beforeEach(() => {
      now = dayjs("2022/12/25");
    });

    it("should use the christmas theme colors", () => {
      const result = original.apply(
        allOf(
          features({
            viewPortIncreasePercent: 25,
            backgroundColor: "shouldNotBeUsed",
            foregroundColor: "shouldNotBeUsed",
          }),
          festivals(clock)
        )
      ) as DummyIcon;

      expect(result.svg).toEqual(ICONS.christmas.svg);
      expect(result.features).toEqual({
        backgroundColor: "green",
        foregroundColor: "red",
        viewPortIncreasePercent: 25,
      });
    });
  });

  describe("on halloween", () => {
    beforeEach(() => {
      now = dayjs("2022/10/31");
    });

    it("should use the given colors", () => {
      const result = original
        .apply(
          features({
            viewPortIncreasePercent: 12,
            backgroundColor: "shouldNotBeUsed",
            foregroundColor: "shouldNotBeUsed",
          })
        )
        .apply(festivals(clock)) as DummyIcon;

      expect(result.svg).toEqual(ICONS.halloween.svg);
      expect(result.features).toEqual({
        viewPortIncreasePercent: 12,
        backgroundColor: "black",
        foregroundColor: "orange",
      });
    });
  });

  describe("on cny", () => {
    describe("2022", () => {
      beforeEach(() => {
        now = dayjs("2022/02/01");
      });

      it("should use the cny theme", () => {
        const result = original
          .apply(
            features({
              viewPortIncreasePercent: 12,
              backgroundColor: "shouldNotBeUsed",
              foregroundColor: "shouldNotBeUsed",
            })
          )
          .apply(festivals(clock)) as DummyIcon;

        expect(result.svg).toEqual(ICONS.yoTiger.svg);
        expect(result.features).toEqual({
          viewPortIncreasePercent: 12,
          backgroundColor: "red",
          foregroundColor: "yellow",
        });
      });
    });

    describe("2023", () => {
      beforeEach(() => {
        now = dayjs("2023/01/22");
      });

      it("should use the cny theme", () => {
        const result = original
          .apply(
            features({
              viewPortIncreasePercent: 12,
              backgroundColor: "shouldNotBeUsed",
              foregroundColor: "shouldNotBeUsed",
            })
          )
          .apply(festivals(clock)) as DummyIcon;

        expect(result.svg).toEqual(ICONS.yoRabbit.svg);
        expect(result.features).toEqual({
          viewPortIncreasePercent: 12,
          backgroundColor: "red",
          foregroundColor: "yellow",
        });
      });
    });

    describe("2024", () => {
      beforeEach(() => {
        now = dayjs("2024/02/10");
      });

      it("should use the cny theme", () => {
        const result = original
          .apply(
            features({
              viewPortIncreasePercent: 12,
              backgroundColor: "shouldNotBeUsed",
              foregroundColor: "shouldNotBeUsed",
            })
          )
          .apply(festivals(clock)) as DummyIcon;

        expect(result.svg).toEqual(ICONS.yoDragon.svg);
        expect(result.features).toEqual({
          viewPortIncreasePercent: 12,
          backgroundColor: "red",
          foregroundColor: "yellow",
        });
      });
    });
  });

  describe("on holi", () => {
    beforeEach(() => {
      now = dayjs("2022/03/18");
    });

    it("should use the given colors", () => {
      const result = original
        .apply(
          features({
            viewPortIncreasePercent: 12,
            backgroundColor: "shouldNotBeUsed",
            foregroundColor: "shouldNotBeUsed",
          })
        )
        .apply(festivals(clock)) as DummyIcon;

      expect(result.features.viewPortIncreasePercent).toEqual(12);
      expect(HOLI_COLORS.includes(result.features.backgroundColor!)).toEqual(
        true
      );
      expect(HOLI_COLORS.includes(result.features.foregroundColor!)).toEqual(
        true
      );
      expect(result.features.backgroundColor).not.toEqual(
        result.features.foregroundColor
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
