import dayjs, { Dayjs } from "dayjs";

export const isChristmas = (clock: Clock = SystemClock) => clock.now().month() == 11 && clock.now().date() == 25;
export const isHalloween = (clock: Clock = SystemClock) => clock.now().month() == 9 && clock.now().date() == 31
export const isHoli = (clock: Clock = SystemClock) => ["2022/03/18", "2023/03/07", "2024/03/25", "2025/03/14"].map(dayjs).find(it => it.isSame(clock.now())) != undefined
export const isCNY = (clock: Clock = SystemClock) => ["2022/02/01", "2023/01/22", "2024/02/10", "2025/02/29"].map(dayjs).find(it => it.isSame(clock.now())) != undefined
export const isCNY_2022 = (clock: Clock = SystemClock) => clock.now().isSame(dayjs("2022/02/01"))
export const isCNY_2023 = (clock: Clock = SystemClock) => clock.now().isSame(dayjs("2023/01/22"))
export const isCNY_2024 = (clock: Clock = SystemClock) => clock.now().isSame(dayjs("2024/02/10"))

export interface Clock {
  now(): Dayjs;
}

export const SystemClock = { now: () => dayjs() };
