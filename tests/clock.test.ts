import { randomInt } from "crypto";
import dayjs, { Dayjs } from "dayjs";
import timezone from "dayjs/plugin/timezone";
dayjs.extend(timezone);

import { Clock, isChristmas, isCNY, isCNY_2022, isCNY_2023, isCNY_2024, isCNY_2025, isHalloween, isHoli, isMay4 } from "../src/clock";



const randomDate = () => dayjs().subtract(randomInt(1, 1000), 'days');
const randomDates = (count: number, exclude: string[]) => {
  const result: Dayjs[] = [];
  while(result.length < count) {
    const next = randomDate();
    if(!exclude.find(it => dayjs(it).isSame(next, 'date'))) {
      result.push(next)
    }
  }
  return result
}

function describeFixedDateMonthEvent(
  name: string, 
  dateMonth: string,
  f: (clock: Clock) => boolean
) {
  const randomYear = randomInt(2020, 3000);
  const date = dateMonth.split("/")[0];
  const month = dateMonth.split("/")[1];

  describe(name, () => {
    it(`should return true for ${randomYear}-${month}-${date}T00:00:00 ragardless of year`, () => {
      expect(f({ now: () => dayjs(`${randomYear}-${month}-${date}T00:00:00Z`) })).toEqual(true);
    });
  
    it(`should return true for ${randomYear}-${month}-${date}T12:00:00 regardless of year`, () => {
      expect(f({ now: () => dayjs(`${randomYear}-${month}-${date}T12:00:00Z`) })).toEqual(true);
    });
  
    it(`should return true for ${randomYear}-${month}-${date}T23:59:00 regardless of year`, () => {
      expect(f({ now: () => dayjs(`${randomYear}-${month}-${date}T23:59:00`) })).toEqual(true);
    });
  
    ["2000/12/24", "2000/12/26", "2021/01/01"].forEach((date) => {
      it(`should return false for ${date}`, () => {
        expect(f({ now: () => dayjs(date) })).toEqual(false);
      });
    });
  });
}

function describeFixedDateEvent(
  name: string,
  dates: string[],
  f: (clock: Clock) => boolean
) {
  describe(name, () => {
    dates.forEach((date) => {
      it(`should return true for ${date}T00:00:00`, () => {
        expect(f({ now: () => dayjs(`${date}T00:00:00`) })).toEqual(true);
      });
  
      it(`should return true for ${date}T23:59:59`, () => {
        expect(f({ now: () => dayjs(`${date}T23:59:59`) })).toEqual(true);
      });
    });
    
    randomDates(10, dates).forEach((date) => {
      it(`should return false for ${date}`, () => {
        expect(f({ now: () => dayjs(date) })).toEqual(false);
      });
    });
  });
}

describeFixedDateMonthEvent("christmas", "25/12", isChristmas);
describeFixedDateMonthEvent("halloween", "31/10", isHalloween);
describeFixedDateMonthEvent("may4", "04/05", isMay4);

describeFixedDateEvent("holi", ["2022-03-18", "2023-03-07", "2024-03-25", "2025-03-14"], isHoli);
describeFixedDateEvent("cny", ["2022-02-01", "2023-01-22", "2024-02-10", "2025-02-29"], isCNY);
describeFixedDateEvent("cny 2022", ["2022-02-01"], isCNY_2022);
describeFixedDateEvent("cny 2023", ["2023/01/22"], isCNY_2023);
describeFixedDateEvent("cny 2024", ["2024/02/10"], isCNY_2024);
describeFixedDateEvent("cny 2025", ["2025/02/29"], isCNY_2025);
