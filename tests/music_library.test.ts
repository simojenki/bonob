import { randomUUID as uuid } from "crypto";

import { anArtist } from "./builders";
import { artistToArtistSummary, slice2 } from "../src/music_library";

describe("slice2", () => {
  const items = [10, 20, 30, 40, 50];

  describe("when neither _index nor _count are provided", () => {
    it("should return all items", () => {
      expect(slice2()(items)).toEqual([items, 5]);
    });
  });

  describe("when _index is defined and _count is undefined", () => {
    it("should return items from _index to end", () => {
      expect(slice2({ _index: 2 })(items)).toEqual([[30, 40, 50], 5]);
    });
  });

  describe("when _index is undefined and _count is defined", () => {
    it("should return the first _count items", () => {
      expect(slice2({ _count: 3 })(items)).toEqual([[10, 20, 30], 5]);
    });
  });

  describe("when both _index and _count are defined", () => {
    it("should return _count items starting from _index", () => {
      expect(slice2({ _index: 1, _count: 2 })(items)).toEqual([[20, 30], 5]);
    });
  });

  it("should always report the total as the full length regardless of paging", () => {
    expect(slice2({ _index: 2, _count: 1 })(items)[1]).toEqual(5);
  });
});

describe("artistToArtistSummary", () => {
  it("should map fields correctly", () => {
    const artist = anArtist({
      id: uuid(),
      name: "The Artist",
      image: {
        system: "external",
        resource: "http://example.com:1234/image.jpg",
      },
    });
    expect(artistToArtistSummary(artist)).toEqual({
      id: artist.id,
      name: artist.name,
      image: artist.image,
    });
  });
});
