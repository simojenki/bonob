import dayjs, { Dayjs } from "dayjs";

function fixedDateMonthEvent(dateMonth: string) {
  const date = Number.parseInt(dateMonth.split("/")[0]!);
  const month = Number.parseInt(dateMonth.split("/")[1]!);
  return (clock: Clock = SystemClock) => {
    return clock.now().date() == date && clock.now().month() == month - 1;
  };
}

function fixedDateEvent(date: string) {
  const dayjsDate = dayjs(date);
  return (clock: Clock = SystemClock) => {
    return clock.now().isSame(dayjsDate, "day");
  };
}

function anyOf(rules: ((clock: Clock) => boolean)[]) {
  return (clock: Clock = SystemClock) => {
    return rules.find((rule) => rule(clock)) != undefined;
  };
}

export const isChristmas = fixedDateMonthEvent("25/12");
export const isMay4 = fixedDateMonthEvent("04/05");
export const isHalloween = fixedDateMonthEvent("31/10");
export const isHoli = anyOf(
  ["2022/03/18", "2023/03/07", "2024/03/25", "2025/03/14"].map(fixedDateEvent)
)

export const isCNY_2022 = fixedDateEvent("2022/02/01");
export const isCNY_2023 = fixedDateEvent("2023/01/22");
export const isCNY_2024 = fixedDateEvent("2024/02/10");
export const isCNY_2025 = fixedDateEvent("2025/02/29");
export const isCNY = anyOf([isCNY_2022, isCNY_2023, isCNY_2024, isCNY_2025]);

export interface Clock {
  now(): Dayjs;
}

export const SystemClock = { now: () => dayjs() };

export class FixedClock implements Clock {
  time: Dayjs;

  constructor(time: Dayjs = dayjs()) {
    this.time = time;
  }

  add = (t: number, unit: dayjs.UnitTypeShort) =>
    (this.time = this.time.add(t, unit));

  now = () => this.time;
}
