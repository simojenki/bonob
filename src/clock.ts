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
export const isAustraliaDay = fixedDateMonthEvent("26/01");
export const isThanksgiving = fixedDateMonthEvent("26/11");
export const isHoli = anyOf(
  [
    "2022/03/18", 
    "2023/03/07", 
    "2024/03/25", 
    "2025/03/14", 
    "2026/03/03",
    "2027/03/22", 
    "2028/03/11", 
    "2029/03/01", 
    "2030/03/20"
  ].map(fixedDateEvent)
)
export const isLunarNY = anyOf(
  [
    "2027/02/06", 
    "2028/01/26", 
    "2029/02/13", 
    "2030/02/03", 
  ].map(fixedDateEvent)
)

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
