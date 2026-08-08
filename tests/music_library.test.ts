import { randomUUID as uuid } from "crypto";

import { anArtist } from "./builders";
import {
  artistToArtistSummary,
  paginate,
  Paging,
  slice2,
} from "../src/music_library";

type TestQuery = Paging & { type: string };

const makeItems = (start: number, count: number) =>
  Array.from({ length: count }, (_, i) => `item${start + i}`);

const mockPage = (total: number) =>
  jest.fn().mockImplementation((q: TestQuery) =>
    Promise.resolve({
      results: makeItems(q._index!, q._count!),
      total,
    })
  );

describe("paginate", () => {
  it("should delegate to the page function when _count is less than the page size", async () => {
    const total = jest.fn().mockResolvedValue(1200);
    const page = jest.fn().mockResolvedValue({
      results: ["a", "b"],
      total: 2,
    });
    const paginated = paginate(total, page);

    const result = await paginated({
      _index: 0,
      _count: 100,
      type: "test",
    } as TestQuery);

    expect(total).not.toHaveBeenCalled();
    expect(page).toHaveBeenCalledTimes(1);
    expect(page).toHaveBeenCalledWith({
      _index: 0,
      _count: 100,
      type: "test",
    });
    expect(result).toEqual({ results: ["a", "b"], total: 2 });
  });

  it("should delegate to the page function when _count equals the page size", async () => {
    const total = jest.fn().mockResolvedValue(1200);
    const page = jest.fn().mockResolvedValue({
      results: makeItems(0, 500),
      total: 1200,
    });
    const paginated = paginate(total, page);

    const result = await paginated({
      _index: 0,
      _count: 500,
      type: "test",
    } as TestQuery);

    expect(total).not.toHaveBeenCalled();
    expect(page).toHaveBeenCalledTimes(1);
    expect(page).toHaveBeenCalledWith({
      _index: 0,
      _count: 500,
      type: "test",
    });
    expect(result.results).toEqual(makeItems(0, 500));
  });

  it("should fetch all pages when _count is undefined", async () => {
    const total = jest.fn().mockResolvedValue(700);
    const page = mockPage(700);
    const paginated = paginate(total, page);

    const result = await paginated({
      _index: 0,
      _count: undefined,
      type: "test",
    } as TestQuery);

    expect(total).toHaveBeenCalledTimes(1);
    expect(page).toHaveBeenCalledTimes(2);
    expect(page).toHaveBeenNthCalledWith(1, {
      _index: 0,
      _count: 500,
      type: "test",
    });
    expect(page).toHaveBeenNthCalledWith(2, {
      _index: 500,
      _count: 200,
      type: "test",
    });
    expect(result.results).toEqual(makeItems(0, 700));
    expect(result.total).toEqual(700);
  });

  it("should fetch all remaining pages when _index and _count are undefined", async () => {
    const total = jest.fn().mockResolvedValue(700);
    const page = mockPage(700);
    const paginated = paginate(total, page);

    const result = await paginated({
      _index: undefined,
      _count: undefined,
      type: "test",
    } as TestQuery);

    expect(total).toHaveBeenCalledTimes(1);
    expect(page).toHaveBeenCalledTimes(2);
    expect(page).toHaveBeenNthCalledWith(1, {
      _index: 0,
      _count: 500,
      type: "test",
    });
    expect(page).toHaveBeenNthCalledWith(2, {
      _index: 500,
      _count: 200,
      type: "test",
    });
    expect(result.results).toEqual(makeItems(0, 700));
    expect(result.total).toEqual(700);
  });

  it("should fetch multiple pages in parallel for a large _count", async () => {
    const total = jest.fn().mockResolvedValue(1200);
    const page = mockPage(1200);
    const paginated = paginate(total, page);

    const result = await paginated({
      _index: 0,
      _count: 1000,
      type: "test",
    } as TestQuery);

    expect(total).toHaveBeenCalledTimes(1);
    expect(page).toHaveBeenCalledTimes(2);
    expect(page).toHaveBeenNthCalledWith(1, {
      _index: 0,
      _count: 500,
      type: "test",
    });
    expect(page).toHaveBeenNthCalledWith(2, {
      _index: 500,
      _count: 500,
      type: "test",
    });
    expect(result.results).toEqual(makeItems(0, 1000));
    expect(result.total).toEqual(1200);
  });

  it("should only fetch the pages needed for the requested window", async () => {
    const total = jest.fn().mockResolvedValue(1200);
    const page = mockPage(1200);
    const paginated = paginate(total, page);

    const result = await paginated({
      _index: 0,
      _count: 550,
      type: "test",
    } as TestQuery);

    expect(page).toHaveBeenCalledTimes(2);
    expect(page).toHaveBeenNthCalledWith(1, {
      _index: 0,
      _count: 500,
      type: "test",
    });
    expect(page).toHaveBeenNthCalledWith(2, {
      _index: 500,
      _count: 50,
      type: "test",
    });
    expect(result.results).toEqual(makeItems(0, 550));
    expect(result.total).toEqual(1200);
  });

  it("should fetch all pages when the requested count exceeds the total", async () => {
    const total = jest.fn().mockResolvedValue(700);
    const page = mockPage(700);
    const paginated = paginate(total, page);

    const result = await paginated({
      _index: 0,
      _count: 10000,
      type: "test",
    } as TestQuery);

    expect(page).toHaveBeenCalledTimes(2);
    expect(page).toHaveBeenNthCalledWith(1, {
      _index: 0,
      _count: 500,
      type: "test",
    });
    expect(page).toHaveBeenNthCalledWith(2, {
      _index: 500,
      _count: 200,
      type: "test",
    });
    expect(result.results).toEqual(makeItems(0, 700));
    expect(result.total).toEqual(700);
  });

  it("should support offsets that start beyond the first page", async () => {
    const total = jest.fn().mockResolvedValue(1200);
    const page = mockPage(1200);
    const paginated = paginate(total, page);

    const result = await paginated({
      _index: 500,
      _count: 1000,
      type: "test",
    } as TestQuery);

    expect(page).toHaveBeenCalledTimes(2);
    expect(page).toHaveBeenNthCalledWith(1, {
      _index: 500,
      _count: 500,
      type: "test",
    });
    expect(page).toHaveBeenNthCalledWith(2, {
      _index: 1000,
      _count: 200,
      type: "test",
    });
    expect(result.results).toEqual([...makeItems(500, 500), ...makeItems(1000, 200)]);
    expect(result.total).toEqual(1200);
  });

  it("should start paging from the requested _index", async () => {
    const total = jest.fn().mockResolvedValue(1200);
    const page = mockPage(1200);
    const paginated = paginate(total, page);

    const result = await paginated({
      _index: 100,
      _count: 501,
      type: "test",
    } as TestQuery);

    expect(page).toHaveBeenCalledTimes(2);
    expect(page).toHaveBeenNthCalledWith(1, {
      _index: 100,
      _count: 500,
      type: "test",
    });
    expect(page).toHaveBeenNthCalledWith(2, {
      _index: 600,
      _count: 1,
      type: "test",
    });
    expect(result.results).toEqual(makeItems(100, 501));
    expect(result.total).toEqual(1200);
  });
});

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
