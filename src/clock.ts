import dayjs, { Dayjs } from "dayjs";

export interface Clock {
  now(): Dayjs;
}

export const SystemClock = { now: () => dayjs() };
