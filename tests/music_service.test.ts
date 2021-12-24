import { v4 as uuid } from "uuid";

import { anArtist } from "./builders";
import { artistToArtistSummary, slice2 } from "../src/music_service";


describe("slice2", () => {
  const things = ["a", "b", "c", "d", "e", "f", "g", "h", "i"];
  
  describe("when slice is a subset of the things", () => {
    it("should return the page", () => {
      expect(slice2({ _index: 3, _count: 4 })(things)).toEqual([
        ["d", "e", "f", "g"],
        things.length
      ])
    });
  });

  describe("when slice goes off the end of the things", () => {
    it("should return the page", () => {
      expect(slice2({ _index: 5, _count: 100 })(things)).toEqual([
        ["f", "g", "h", "i"],
        things.length
      ])
    });
  });

  describe("when no _count is provided", () => {
    it("should return from the index", () => {
      expect(slice2({ _index: 5 })(things)).toEqual([
        ["f", "g", "h", "i"],
        things.length
      ])
    });
  });

  describe("when no _index is provided", () => {
    it("should assume from the start", () => {
      expect(slice2({ _count: 3 })(things)).toEqual([
        ["a", "b", "c"],
        things.length
      ])
    });
  });

  describe("when no _index or _count is provided", () => {
    it("should return all the things", () => {
      expect(slice2()(things)).toEqual([
        things,
        things.length
      ])
    });
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
