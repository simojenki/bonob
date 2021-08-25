import dayjs from "dayjs";
import { isChristmas, isCNY, isHalloween, isHoli } from "../src/clock";

describe("isChristmas", () => {
  ["2000/12/25", "2022/12/25", "2030/12/25"].forEach((date) => {
    it(`should return true for ${date} regardless of year`, () => {
      expect(isChristmas({ now: () => dayjs(date) })).toEqual(true);
    });
  });

  ["2000/12/24", "2000/12/26", "2021/01/01"].forEach((date) => {
    it(`should return false for ${date} regardless of year`, () => {
      expect(isChristmas({ now: () => dayjs(date) })).toEqual(false);
    });
  });
});

describe("isHalloween", () => {
  ["2000/10/31", "2022/10/31", "2030/10/31"].forEach((date) => {
    it(`should return true for ${date} regardless of year`, () => {
      expect(isHalloween({ now: () => dayjs(date) })).toEqual(true);
    });
  });

  ["2000/09/31", "2000/10/30", "2021/01/01"].forEach((date) => {
    it(`should return false for ${date} regardless of year`, () => {
      expect(isHalloween({ now: () => dayjs(date) })).toEqual(false);
    });
  });
});

describe("isHoli", () => {
  ["2022/03/18", "2023/03/07", "2024/03/25", "2025/03/14"].forEach((date) => {
    it(`should return true for ${date} regardless of year`, () => {
      expect(isHoli({ now: () => dayjs(date) })).toEqual(true);
    });
  });

  ["2000/09/31", "2000/10/30", "2021/01/01"].forEach((date) => {
    it(`should return false for ${date} regardless of year`, () => {
      expect(isHoli({ now: () => dayjs(date) })).toEqual(false);
    });
  });
});

describe("isCNY", () => {
  ["2022/02/01", "2023/01/22", "2024/02/10", "2025/02/29"].forEach((date) => {
    it(`should return true for ${date} regardless of year`, () => {
      expect(isCNY({ now: () => dayjs(date) })).toEqual(true);
    });
  });

  ["2000/09/31", "2000/10/30", "2021/01/01"].forEach((date) => {
    it(`should return false for ${date} regardless of year`, () => {
      expect(isCNY({ now: () => dayjs(date) })).toEqual(false);
    });
  });
});
