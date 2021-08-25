import libxmljs, { Element, Attribute } from "libxmljs2";
import _ from "underscore";
import { Clock, isChristmas, isCNY, isHalloween, isHoli, SystemClock } from "./clock";

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
  newColors: () => Pick<Transformation, "backgroundColor" | "foregroundColor">;
  icon: Icon;

  constructor(
    icon: Icon,
    rule: () => Boolean,
    newColors: () => Pick<Transformation, "backgroundColor" | "foregroundColor">
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
          style: `fill:${this.transformation.backgroundColor}`,
        })
      );
    }
    if (this.transformation.foregroundColor) {
      (xml.find("//svg:path", SVG_NS) as Element[]).forEach((path) =>
        path.attr({ style: `fill:${this.transformation.foregroundColor}` })
      );
    }
    return xml.toString();
  };
}

export const HOLI_COLORS = ["#06bceb", "#9fc717", "#fbdc10", "#f00b9a", "#fa9705"]

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

  const xmas = wrap(icon, isChristmas, {
    backgroundColor: "green",
    foregroundColor: "red",
  });
  const randomHoliColors = _.shuffle([...HOLI_COLORS]);
  const holi = wrap(xmas, isHoli, {
    backgroundColor: randomHoliColors.pop(),
    foregroundColor: randomHoliColors.pop(),
  });
  const cny = wrap(holi, isCNY, {
    backgroundColor: "red",
    foregroundColor: "yellow",
  });
  const halloween = wrap(cny, isHalloween, {
    backgroundColor: "orange",
    foregroundColor: "black",
  });
  return halloween;
};
