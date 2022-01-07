
import tmp from "tmp";
import fse from "fs-extra";
import path from "path";
import { Md5 } from "ts-md5";

import sharp from "sharp";
jest.mock("sharp");

import { cachingImageFetcher } from "../src/images";

describe("cachingImageFetcher", () => {
  const delegate = jest.fn();
  const url = "http://test.example.com/someimage.jpg";

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetAllMocks();
  });

  describe("when there is no image in the cache", () => {
    it("should fetch the image from the source and then cache and return it", async () => {
      const dir = tmp.dirSync();
      const cacheFile = path.join(dir.name, `${Md5.hashStr(url)}.png`);
      const jpgImage = Buffer.from("jpg-image", "utf-8");
      const pngImage = Buffer.from("png-image", "utf-8");

      delegate.mockResolvedValue({ contentType: "image/jpeg", data: jpgImage });
      const png = jest.fn();
      (sharp as unknown as jest.Mock).mockReturnValue({ png });
      png.mockReturnValue({
        toBuffer: () => Promise.resolve(pngImage),
      });

      const result = await cachingImageFetcher(dir.name, delegate)(url);

      expect(result!.contentType).toEqual("image/png");
      expect(result!.data).toEqual(pngImage);

      expect(delegate).toHaveBeenCalledWith(url);
      expect(fse.existsSync(cacheFile)).toEqual(true);
      expect(fse.readFileSync(cacheFile)).toEqual(pngImage);
    });
  });

  describe("when the image is already in the cache", () => {
    it("should fetch the image from the cache and return it", async () => {
      const dir = tmp.dirSync();
      const cacheFile = path.join(dir.name, `${Md5.hashStr(url)}.png`);
      const data = Buffer.from("foobar2", "utf-8");

      fse.writeFileSync(cacheFile, data);

      const result = await cachingImageFetcher(dir.name, delegate)(url);

      expect(result!.contentType).toEqual("image/png");
      expect(result!.data).toEqual(data);

      expect(delegate).not.toHaveBeenCalled();
    });
  });

  describe("when the delegate returns undefined", () => {
    it("should return undefined", async () => {
      const dir = tmp.dirSync();
      const cacheFile = path.join(dir.name, `${Md5.hashStr(url)}.png`);

      delegate.mockResolvedValue(undefined);

      const result = await cachingImageFetcher(dir.name, delegate)(url);

      expect(result).toBeUndefined();

      expect(delegate).toHaveBeenCalledWith(url);
      expect(fse.existsSync(cacheFile)).toEqual(false);
    });
  });
});
