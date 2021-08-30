import { takeWithRepeats } from "../src/utils";

describe("takeWithRepeat", () => {
  describe("when there is nothing in the input", () => {
    it("should return an array of undefineds", () => {
      expect(takeWithRepeats([], 3)).toEqual([undefined, undefined, undefined]);
    });
  });

  describe("when there are exactly the amount required", () => {
    it("should return them all", () => {
      expect(takeWithRepeats(["a", undefined, "c"], 3)).toEqual([
        "a",
        undefined,
        "c",
      ]);
      expect(takeWithRepeats(["a"], 1)).toEqual(["a"]);
      expect(takeWithRepeats([undefined], 1)).toEqual([undefined]);
    });
  });

  describe("when there are less than the amount required", () => {
    it("should cycle through the ones available", () => {
      expect(takeWithRepeats(["a", "b"], 3)).toEqual(["a", "b", "a"]);
      expect(takeWithRepeats(["a", "b"], 5)).toEqual(["a", "b", "a", "b", "a"]);
    });
  });

  describe("when there more than the amount required", () => {
    it("should return the first n items", () => {
      expect(takeWithRepeats(["a", "b", "c"], 2)).toEqual(["a", "b"]);
      expect(takeWithRepeats(["a", undefined, "c"], 2)).toEqual(["a", undefined]);
    });
  });
});
