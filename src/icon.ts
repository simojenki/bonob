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
    Pick<Transformation, "backgroundColor" | "foregroundColor">
  >;
  icon: Icon;

  constructor(
    icon: Icon,
    rule: () => Boolean,
    newColors: () => Partial<
      Pick<Transformation, "backgroundColor" | "foregroundColor">
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
    colors: Pick<Transformation, "backgroundColor" | "foregroundColor">
  ) =>
    new ColorOverridingIcon(
      icon,
      () => rule(clock),
      () => colors
    );

  let result = icon;

  const apply = (
    rule: (clock: Clock) => boolean,
    colors: Pick<Transformation, "backgroundColor" | "foregroundColor">
  ) => (result = wrap(result, rule, colors));

  apply(isChristmas, {
    backgroundColor: "green",
    foregroundColor: "red",
  });

  const randomHoliColors = _.shuffle([...HOLI_COLORS]);
  apply(isHoli, {
    backgroundColor: randomHoliColors.pop(),
    foregroundColor: randomHoliColors.pop(),
  });

  apply(isCNY, {
    backgroundColor: "red",
    foregroundColor: "yellow",
  });

  apply(isHalloween, {
    backgroundColor: "orange",
    foregroundColor: "black",
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
  | "error"
  | "chill"
  | "country"
  | "dance"
  | "disco"
  | "film"
  | "new"
  | "old"
  | "cannabis"
  | "trip"
  | "opera"
  | "world"
  | "violin"
  | "celtic"
  | "children"
  | "chillout"
  | "progressiveRock";

const iconFrom = (name: string) =>
  new SvgIcon(
    fs
      .readFileSync(path.resolve(__dirname, "..", "web", "icons", name))
      .toString()
  );

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
  discover: iconFrom("Opera-Glasses-102740.svg"),
  mushroom: iconFrom("Mushroom-63864.svg"),
  african: iconFrom("Africa-48087.svg"),
  rock: iconFrom("Rock-Music-11007.svg"),
  progressiveRock: iconFrom("Progressive-Rock-24862.svg"),
  metal: iconFrom("Metal-Music-17763.svg"),
  punk: iconFrom("Punk-40450.svg"),
  americana: iconFrom("US-Capitol-104805.svg"),
  guitar: iconFrom("Guitar-110433.svg"),
  book: iconFrom("Book-22940.svg"),
  oz: iconFrom("Kangaroo-16730.svg"),
  hipHop: iconFrom("Hip-Hop Music-17757.svg"),
  rap: iconFrom("Rap-24851.svg"),
  horror: iconFrom("Horror-88855.svg"),
  pop: iconFrom("Ice-Pop Yellow-94532.svg"),
  blues: iconFrom("Blues-113548.svg"),
  classical: iconFrom("Classic-Music-17728.svg"),
  comedy: iconFrom("Comedy-5937.svg"),
  vinyl: iconFrom("Music-Record-102104.svg"),
  electronic: iconFrom("Electronic-Music-17745.svg"),
  pills: iconFrom("Pills-92954.svg"),
  trumpet: iconFrom("Trumpet-17823.svg"),
  conductor: iconFrom("Music-Conductor-225.svg"),
  reggae: iconFrom("Reggae-24843.svg"),
  music: iconFrom("Music-14097.svg"),
  error: iconFrom("Error-82783.svg"),
  chill: iconFrom("Fridge-282.svg"),
  country: iconFrom("Country-Music-113286.svg"),
  dance: iconFrom("Tango-25015.svg"),
  disco: iconFrom("Disco-Ball-25777.svg"),
  film: iconFrom("Film-Reel-3230.svg"),
  new: iconFrom("New-47652.svg"),
  old: iconFrom("Old-Woman-77881.svg"),
  cannabis: iconFrom("Cannabis-33270.svg"),
  trip: iconFrom("TripAdvisor-44407.svg"),
  opera: iconFrom("Sydney-Opera House-59090.svg"),
  world: iconFrom("Globe-1301.svg"),
  violin: iconFrom("Violin-3421.svg"),
  celtic: iconFrom("Scottish-Thistle-108212.svg"),
  children: iconFrom("Children-78186.svg"),
  chillout: iconFrom("Sleeping-in Bed-14385.svg"),
};

export type RULE = (genre: string) => boolean;

export const eq =
  (expected: string): RULE =>
  (value: string) =>
    expected.toLowerCase() === value.toLowerCase();

export const contains =
  (expected: string): RULE =>
  (value: string) =>
    value.toLowerCase().includes(expected.toLowerCase());

export const containsWord =
  (expected: string): RULE =>
  (value: string) =>
    value.toLowerCase().split(/\W/).includes(expected.toLowerCase());

const containsWithAllTheNonWordCharsRemoved =
  (expected: string): RULE =>
  (value: string) =>
    value.replace(/\W+/, " ").toLowerCase().includes(expected.toLowerCase());

const GENRE_RULES: [RULE, ICON][] = [
  [eq("Acid House"), "mushroom"],
  [eq("African"), "african"],
  [eq("Americana"), "americana"],
  [eq("Film Score"), "film"],
  [eq("Soundtrack"), "film"],
  [eq("Stoner Rock"), "cannabis"],
  [eq("Turntablism"), "vinyl"],
  [eq("Celtic"), "celtic"],
  [eq("Progressive Rock"), "progressiveRock"],
  [containsWord("Country"), "country"],
  [containsWord("Rock"), "rock"],
  [containsWord("Folk"), "guitar"],
  [containsWord("Book"), "book"],
  [containsWord("Australian"), "oz"],
  [containsWord("Baroque"), "violin"],
  [containsWord("Rap"), "rap"],
  [containsWithAllTheNonWordCharsRemoved("Hip Hop"), "hipHop"],
  [containsWithAllTheNonWordCharsRemoved("Trip Hop"), "trip"],
  [containsWord("Metal"), "metal"],
  [containsWord("Punk"), "punk"],
  [containsWord("Blues"), "blues"],
  [eq("Classic"), "classical"],
  [containsWord("Classical"), "classical"],
  [containsWord("Comedy"), "comedy"],
  [containsWord("Turntable"), "vinyl"],
  [containsWord("Dub"), "electronic"],
  [eq("Dubstep"), "electronic"],
  [eq("Drum And Bass"), "electronic"],
  [contains("Goa"), "mushroom"],
  [contains("Psy"), "mushroom"],
  [containsWord("Trance"), "pills"],
  [containsWord("Techno"), "pills"],
  [containsWord("House"), "pills"],
  [containsWord("Rave"), "pills"],
  [containsWord("Jazz"), "trumpet"],
  [containsWord("Orchestra"), "conductor"],
  [containsWord("Reggae"), "reggae"],
  [containsWord("Disco"), "disco"],
  [containsWord("New"), "new"],
  [containsWord("Opera"), "opera"],
  [containsWord("Vocal"), "opera"],
  [containsWord("Ballad"), "opera"],
  [containsWord("Western"), "country"],
  [containsWord("World"), "world"],
  [contains("Electro"), "electronic"],
  [contains("Dance"), "dance"],
  [contains("Pop"), "pop"],
  [contains("Horror"), "horror"],
  [contains("Children"), "children"],
  [contains("Chill"), "chill"],
  [contains("Old"), "old"],
];

export function iconForGenre(genre: string): ICON {
  const [_, name] = GENRE_RULES.find(([rule, _]) => rule(genre)) || [
    "music",
    "music",
  ];
  return name! as ICON;
}
