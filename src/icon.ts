import libxmljs, { Element, Attribute } from "libxmljs2";
import _ from "underscore";
import fs from "fs";

import {
  Clock,
  isChristmas,
  isCNY_2022,
  isCNY_2023,
  isCNY_2024,
  isHalloween,
  isHoli,
  isMay4,
  SystemClock,
} from "./clock";
import path from "path";

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

export type IconFeatures = {
  viewPortIncreasePercent: number | undefined;
  backgroundColor: string | undefined;
  foregroundColor: string | undefined;
};

export type IconSpec = {
  svg: string | undefined;
  features: Partial<IconFeatures> | undefined;
};

export interface Icon {
  with(spec: Partial<IconSpec>): Icon;
  apply(transformer: Transformer): Icon;
}

export type Transformer = (icon: Icon) => Icon;

export function transform(spec: Partial<IconSpec>): Transformer {
  return (icon: Icon) =>
    icon.with({
      ...spec,
      features: { ...spec.features },
    });
}

export function features(features: Partial<IconFeatures>): Transformer {
  return (icon: Icon) => icon.with({ features });
}

export function maybeTransform(rule: () => Boolean, transformer: Transformer) {
  return (icon: Icon) => (rule() ? transformer(icon) : icon);
}

export function allOf(...transformers: Transformer[]): Transformer {
  return (icon: Icon): Icon =>
    _.inject(
      transformers,
      (current: Icon, transformer: Transformer) => transformer(current),
      icon
    );
}

export class SvgIcon implements Icon {
  svg: string;
  features: IconFeatures;

  constructor(
    svg: string,
    features: Partial<IconFeatures> = {
      viewPortIncreasePercent: undefined,
      backgroundColor: undefined,
      foregroundColor: undefined,
    }
  ) {
    this.svg = svg;
    this.features = {
      viewPortIncreasePercent: undefined,
      backgroundColor: undefined,
      foregroundColor: undefined,
      ...features,
    };
  }

  public apply = (transformer: Transformer): Icon => transformer(this);

  public with = (spec: Partial<IconSpec>) =>
    new SvgIcon(spec.svg || this.svg, {
      ...this.features,
      ...spec.features,
    });

  public toString = () => {
    const xml = libxmljs.parseXmlString(this.svg, {
      noblanks: true,
      net: false,
    });
    const viewBoxAttr = xml.get("//svg:svg/@viewBox", SVG_NS) as Attribute;
    let viewBox = new ViewBox(viewBoxAttr.value());
    if (
      this.features.viewPortIncreasePercent &&
      this.features.viewPortIncreasePercent > 0
    ) {
      viewBox = viewBox.increasePercent(this.features.viewPortIncreasePercent);
      viewBoxAttr.value(viewBox.toString());
    }
    if (this.features.backgroundColor) {
      (xml.get("//svg:svg/*[1]", SVG_NS) as Element).addPrevSibling(
        new Element(xml, "rect").attr({
          x: `${viewBox.minX}`,
          y: `${viewBox.minY}`,
          width: `${Math.abs(viewBox.minX) + viewBox.width}`,
          height: `${Math.abs(viewBox.minY) + viewBox.height}`,
          fill: this.features.backgroundColor,
        })
      );
    }
    if (this.features.foregroundColor) {
      (xml.find("//svg:path", SVG_NS) as Element[]).forEach((path) => {
        if (path.attr("fill"))
          path.attr({ stroke: this.features.foregroundColor! });
        else path.attr({ fill: this.features.foregroundColor! });
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

export type ICON =
  | "artists"
  | "albums"
  | "radio"
  | "playlists"
  | "genres"
  | "random"
  | "topRated"
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
  | "progressiveRock"
  | "christmas"
  | "halloween"
  | "yoDragon"
  | "yoRabbit"
  | "yoTiger"
  | "chapel"
  | "audioWave"
  | "c3po"
  | "chewy"
  | "darth"
  | "skywalker"
  | "leia"
  | "r2d2"
  | "yoda" 
  | "heart"
  | "star" 
  | "solidStar";

const iconFrom = (name: string) =>
  new SvgIcon(
    fs
      .readFileSync(path.resolve(__dirname, "..", "web", "icons", name))
      .toString()
  );

export const ICONS: Record<ICON, SvgIcon> = {
  artists: iconFrom("navidrome-artists.svg"),
  albums: iconFrom("navidrome-all.svg"),
  radio: iconFrom("navidrome-radio.svg"),
  blank: iconFrom("blank.svg"),
  playlists: iconFrom("navidrome-playlists.svg"),
  genres: iconFrom("Theatre-Mask-111172.svg"),
  random: iconFrom("navidrome-random.svg"),
  topRated: iconFrom("navidrome-topRated.svg"),
  recentlyAdded: iconFrom("navidrome-recentlyAdded.svg"),
  recentlyPlayed: iconFrom("navidrome-recentlyPlayed.svg"),
  mostPlayed: iconFrom("navidrome-mostPlayed.svg"),
  discover: iconFrom("Opera-Glasses-102740.svg"),
  mushroom: iconFrom("Mushroom-63864.svg"),
  african: iconFrom("Africa-48087.svg"),
  rock: iconFrom("Rock-Music-11076.svg"),
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
  christmas: iconFrom("Christmas-Tree-63332.svg"),
  halloween: iconFrom("Jack-o' Lantern-66580.svg"),
  yoDragon: iconFrom("Year-of Dragon-4537.svg"),
  yoRabbit: iconFrom("Year-of Rabbit-6313.svg"),
  yoTiger: iconFrom("Year-of Tiger-22776.svg"),
  chapel: iconFrom("Chapel-69791.svg"),
  audioWave: iconFrom("Audio-Wave-1892.svg"),
  c3po: iconFrom("C-3PO-31823.svg"),
  chewy: iconFrom("Chewbacca-89771.svg"),
  darth: iconFrom("Darth-Vader-35734.svg"),
  skywalker: iconFrom("Luke-Skywalker-39424.svg"),
  leia: iconFrom("Princess-Leia-68568.svg"),
  r2d2: iconFrom("R2-D2-39423.svg"),
  yoda: iconFrom("Yoda-68107.svg"),
  heart: iconFrom("Heart-85038.svg"),
  star: iconFrom("Star-16101.svg"),
  solidStar: iconFrom("Star-43879.svg")
};

export const STAR_WARS = [ICONS.c3po, ICONS.chewy, ICONS.darth, ICONS.skywalker, ICONS.leia, ICONS.r2d2, ICONS.yoda];

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
  [containsWord("Christmas"), "christmas"],
  [containsWord("Kerst"), "christmas"], // christmas in dutch
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
  [containsWord("Komedie"), "comedy"], // dutch for Comedy
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
  [containsWord("Christian"), "chapel"],
  [containsWord("Religious"), "chapel"],
  [containsWord("Spoken"), "audioWave"],
];

export function iconForGenre(genre: string): ICON {
  const [_, name] = GENRE_RULES.find(([rule, _]) => rule(genre)) || [
    "music",
    "music",
  ];
  return name! as ICON;
}

export const festivals = (clock: Clock = SystemClock): Transformer => {
  const randomHoliColors = _.shuffle([...HOLI_COLORS]);
  return allOf(
    maybeTransform(
      () => isChristmas(clock),
      transform({
        svg: ICONS.christmas.svg,
        features: {
          backgroundColor: "green",
          foregroundColor: "red",
        },
      })
    ),
    maybeTransform(
      () => isHoli(clock),
      transform({
        features: {
          backgroundColor: randomHoliColors.pop(),
          foregroundColor: randomHoliColors.pop(),
        },
      })
    ),
    maybeTransform(
      () => isCNY_2022(clock),
      transform({
        svg: ICONS.yoTiger.svg,
        features: {
          backgroundColor: "red",
          foregroundColor: "yellow",
        },
      })
    ),
    maybeTransform(
      () => isCNY_2023(clock),
      transform({
        svg: ICONS.yoRabbit.svg,
        features: {
          backgroundColor: "red",
          foregroundColor: "yellow",
        },
      })
    ),
    maybeTransform(
      () => isCNY_2024(clock),
      transform({
        svg: ICONS.yoDragon.svg,
        features: {
          backgroundColor: "red",
          foregroundColor: "yellow",
        },
      })
    ),
    maybeTransform(
      () => isHalloween(clock),
      transform({
        svg: ICONS.halloween.svg,
        features: {
          backgroundColor: "black",
          foregroundColor: "orange",
        },
      })
    ),
    maybeTransform(
      () => isMay4(clock),
      transform({
        svg: STAR_WARS[_.random(STAR_WARS.length - 1)]!.svg,
        features: {
          backgroundColor: undefined,
          foregroundColor: undefined,
        },
      })
    )
  );
};
