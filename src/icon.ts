import libxmljs, { Element, Attribute } from "libxmljs2";
import _ from "underscore";
import fs from "fs";

import {
  Clock,
  isChristmas,
  isCNY,
  isHalloween,
  isHoli,
  SystemClock,
} from "./clock";
import path from "path";

export type Transformation = {
  viewPortIncreasePercent: number | undefined;
  backgroundColor: string | undefined;
  foregroundColor: string | undefined;
  text: string | undefined;
  fontColor: string | undefined;
  fontFamily: string | undefined;
};

const SVG_NS = {
  svg: "http://www.w3.org/2000/svg",
};

class ViewBox {
  minX: number;
  minY: number;
  width: number;
  height: number;

  constructor(viewBox: string) {
    const parts = viewBox.split(" ").map((it) => Number.parseInt(it));
    this.minX = parts[0]!;
    this.minY = parts[1]!;
    this.width = parts[2]!;
    this.height = parts[3]!;
  }

  public increasePercent = (percent: number) => {
    const i = Math.floor(((percent / 100) * this.height) / 3);
    return new ViewBox(
      `${-i} ${-i} ${this.height + 2 * i} ${this.height + 2 * i}`
    );
  };

  public toString = () =>
    `${this.minX} ${this.minY} ${this.width} ${this.height}`;
}

export interface Icon {
  with(newTransformation: Partial<Transformation>): Icon;
}

export class ColorOverridingIcon implements Icon {
  rule: () => Boolean;
  newColors: () => Partial<
    Pick<
      Transformation,
      "backgroundColor" | "foregroundColor" | "fontColor" | "fontFamily"
    >
  >;
  icon: Icon;

  constructor(
    icon: Icon,
    rule: () => Boolean,
    newColors: () => Partial<
      Pick<
        Transformation,
        "backgroundColor" | "foregroundColor" | "fontColor" | "fontFamily"
      >
    >
  ) {
    this.icon = icon;
    this.rule = rule;
    this.newColors = newColors;
  }

  public with = (transformation: Partial<Transformation>) =>
    this.rule()
      ? this.icon.with({ ...transformation, ...this.newColors() })
      : this.icon.with(transformation);

  public toString = () => this.with({}).toString();
}

export class SvgIcon implements Icon {
  private svg: string;
  private transformation: Transformation;

  constructor(
    svg: string,
    transformation: Transformation = {
      viewPortIncreasePercent: undefined,
      backgroundColor: undefined,
      foregroundColor: undefined,
      text: undefined,
      fontColor: undefined,
      fontFamily: undefined,
    }
  ) {
    this.svg = svg;
    this.transformation = transformation;
  }

  public with = (newTransformation: Partial<Transformation>) =>
    new SvgIcon(this.svg, { ...this.transformation, ...newTransformation });

  public toString = () => {
    const xml = libxmljs.parseXmlString(this.svg, {
      noblanks: true,
      net: false,
    });
    const viewBoxAttr = xml.get("//svg:svg/@viewBox", SVG_NS) as Attribute;
    let viewBox = new ViewBox(viewBoxAttr.value());
    if (
      this.transformation.viewPortIncreasePercent &&
      this.transformation.viewPortIncreasePercent > 0
    ) {
      viewBox = viewBox.increasePercent(
        this.transformation.viewPortIncreasePercent
      );
      viewBoxAttr.value(viewBox.toString());
    }
    if (this.transformation.backgroundColor) {
      (xml.get("//svg:svg/*[1]", SVG_NS) as Element).addPrevSibling(
        new Element(xml, "rect").attr({
          x: `${viewBox.minX}`,
          y: `${viewBox.minY}`,
          width: `${Math.abs(viewBox.minX) + viewBox.width}`,
          height: `${Math.abs(viewBox.minY) + viewBox.height}`,
          fill: this.transformation.backgroundColor,
        })
      );
    }
    if (this.transformation.foregroundColor) {
      (xml.find("//svg:path", SVG_NS) as Element[]).forEach((path) => {
        if (path.attr("fill"))
          path.attr({ stroke: this.transformation.foregroundColor! });
        else path.attr({ fill: this.transformation.foregroundColor! });
      });
    }
    if (this.transformation.text) {
      const w = Math.abs(viewBox.minX) + Math.abs(viewBox.width);
      const h = Math.abs(viewBox.minY) + Math.abs(viewBox.height);
      const i = Math.floor(0.1 * w);
      let attr: any = {
        "font-size": `${Math.floor(h / 4)}`,
        "font-weight": "bold",
      };
      if (this.transformation.fontFamily)
        attr = { ...attr, "font-family": this.transformation.fontFamily };
      if (this.transformation.fontColor)
        attr = { ...attr, style: `fill:${this.transformation.fontColor}` };
      const g = new Element(xml, "g");
      g.attr(attr);
      (xml.get("//svg:svg", SVG_NS) as Element).addChild(
        g.addChild(
          new Element(xml, "text")
            .attr({
              x: `${viewBox.minX + i}`,
              y: `${viewBox.minY + Math.floor(0.8 * h)}`,
            })
            .text(this.transformation.text)
        )
      );
    }
    return xml.toString();
  };
}

export const HOLI_COLORS = [
  "#06bceb",
  "#9fc717",
  "#fbdc10",
  "#f00b9a",
  "#fa9705",
];

export const makeFestive = (icon: Icon, clock: Clock = SystemClock): Icon => {
  const wrap = (
    icon: Icon,
    rule: (clock: Clock) => boolean,
    colors: Pick<
      Transformation,
      "backgroundColor" | "foregroundColor" | "fontColor"
    >
  ) =>
    new ColorOverridingIcon(
      icon,
      () => rule(clock),
      () => colors
    );

  let result = icon;

  const apply = (
    rule: (clock: Clock) => boolean,
    colors: Pick<
      Transformation,
      "backgroundColor" | "foregroundColor" | "fontColor"
    >
  ) => (result = wrap(result, rule, colors));

  apply(isChristmas, {
    backgroundColor: "green",
    foregroundColor: "red",
    fontColor: "white",
  });

  const randomHoliColors = _.shuffle([...HOLI_COLORS]);
  apply(isHoli, {
    backgroundColor: randomHoliColors.pop(),
    foregroundColor: randomHoliColors.pop(),
    fontColor: randomHoliColors.pop(),
  });

  apply(isCNY, {
    backgroundColor: "red",
    foregroundColor: "yellow",
    fontColor: "crimson",
  });

  apply(isHalloween, {
    backgroundColor: "orange",
    foregroundColor: "black",
    fontColor: "orangered",
  });

  return result;
};

export type ICON =
  | "artists"
  | "albums"
  | "playlists"
  | "genres"
  | "random"
  | "starred"
  | "recentlyAdded"
  | "recentlyPlayed"
  | "mostPlayed"
  | "discover"
  | "blank"
  | "mushroom"
  | "african"
  | "rock"
  | "metal"
  | "punk"
  | "americana"
  | "guitar"
  | "book"
  | "oz"
  | "rap"
  | "horror"
  | "hipHop"
  | "pop"
  | "blues"
  | "classical"
  | "comedy"
  | "vinyl"
  | "electronic"
  | "pills"
  | "trumpet"
  | "conductor"
  | "reggae"
  | "music"
  | "error";

const iconFrom = (name: string) =>
  new SvgIcon(
    fs
      .readFileSync(path.resolve(__dirname, "..", "web", "icons", name))
      .toString()
  ).with({ viewPortIncreasePercent: 50 });

export const ICONS: Record<ICON, Icon> = {
  artists: iconFrom("navidrome-artists.svg"),
  albums: iconFrom("navidrome-all.svg"),
  blank: iconFrom("blank.svg"),
  playlists: iconFrom("navidrome-playlists.svg"),
  genres: iconFrom("Theatre-Mask-111172.svg"),
  random: iconFrom("navidrome-random.svg"),
  starred: iconFrom("navidrome-topRated.svg"),
  recentlyAdded: iconFrom("navidrome-recentlyAdded.svg"),
  recentlyPlayed: iconFrom("navidrome-recentlyPlayed.svg"),
  mostPlayed: iconFrom("navidrome-mostPlayed.svg"),
  discover: iconFrom("Binoculars-14310.svg"),
  mushroom: iconFrom("Mushroom-63864.svg"),
  african: iconFrom("Africa-48087.svg"),
  rock: iconFrom("Rock-Music-11007.svg"),
  metal: iconFrom("Metal-Music-17763.svg"),
  punk: iconFrom("Punk-40450.svg"),
  americana: iconFrom("US-Capitol-104805.svg"),
  guitar: iconFrom("Guitar-110433.svg"),
  book: iconFrom("Book-453.svg"),
  oz: iconFrom("Kangaroo-16730.svg"),
  hipHop: iconFrom("Hip-Hop Music-17757.svg"),
  rap: iconFrom("Rap-24851.svg"),
  horror: iconFrom("Horror-4387.svg"),
  pop: iconFrom("Ice-Pop Yellow-94532.svg"),
  blues: iconFrom("Blues-113548.svg"),
  classical: iconFrom("Classic-Music-11646.svg"),
  comedy: iconFrom("Comedy-2-599.svg"),
  vinyl: iconFrom("Music-Record-102104.svg"),
  electronic: iconFrom("Electronic-Music-17745.svg"),
  pills: iconFrom("Pills-112386.svg"),
  trumpet: iconFrom("Trumpet-17823.svg"),
  conductor: iconFrom("Music-Conductor-225.svg"),
  reggae: iconFrom("Reggae-24843.svg"),
  music: iconFrom("Music-14097.svg"),
  error: iconFrom("Error-82783.svg"),
};

export type RULE = (genre: string) => boolean;

const eq =
  (expected: string): RULE =>
  (value: string) =>
    expected.toLowerCase() === value.toLowerCase();

const contains =
  (expected: string): RULE =>
  (value: string) =>
    value.toLowerCase().includes(expected.toLowerCase());

const containsWithAllTheNonWordCharsRemoved =
  (expected: string): RULE =>
  (value: string) =>
    value.replace(/\W+/, " ").toLowerCase().includes(expected.toLowerCase());

const GENRE_RULES: [RULE, ICON][] = [
  [eq("Acid House"), "mushroom"],
  [contains("Goa"), "mushroom"],
  [contains("Psy"), "mushroom"],
  [eq("African"), "african"],
  [eq("Americana"), "americana"],
  [contains("Rock"), "rock"],
  [contains("Folk"), "guitar"],
  [contains("Book"), "book"],
  [contains("Australian"), "oz"],
  [contains("Rap"), "rap"],
  [containsWithAllTheNonWordCharsRemoved("Hip Hop"), "hipHop"],
  [contains("Horror"), "horror"],
  [contains("Metal"), "metal"],
  [contains("Punk"), "punk"],
  [contains("Pop"), "pop"],
  [contains("Blues"), "blues"],
  [contains("Classical"), "classical"],
  [contains("Comedy"), "comedy"],
  [contains("Dub"), "vinyl"],
  [contains("Turntable"), "vinyl"],
  [contains("Electro"), "electronic"],
  [contains("Trance"), "pills"],
  [contains("Techno"), "pills"],
  [contains("House"), "pills"],
  [contains("Rave"), "pills"],
  [contains("Jazz"), "trumpet"],
  [contains("Orchestra"), "conductor"],
  [contains("Reggae"), "reggae"],
];

export function iconForGenre(genre: string): ICON {
  const [_, name] = GENRE_RULES.find(([rule, _]) => rule(genre)) || [
    "music",
    "music",
  ];
  return name! as ICON;
}
