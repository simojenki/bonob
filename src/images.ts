
import sharp from "sharp";
import fse from "fs-extra";
import path from "path";
import { Md5 } from "ts-md5/dist/md5";
import axios from "axios";

import { CoverArt } from "./music_service";
import { BROWSER_HEADERS } from "./utils";

export type ImageFetcher = (url: string) => Promise<CoverArt | undefined>;

export const cachingImageFetcher =
  (cacheDir: string, delegate: ImageFetcher) =>
  async (url: string): Promise<CoverArt | undefined> => {
    const filename = path.join(cacheDir, `${Md5.hashStr(url)}.png`);
    return fse
      .readFile(filename)
      .then((data) => ({ contentType: "image/png", data }))
      .catch(() =>
        delegate(url).then((image) => {
          if (image) {
            return sharp(image.data)
              .png()
              .toBuffer()
              .then((png) => {
                return fse
                  .writeFile(filename, png)
                  .then(() => ({ contentType: "image/png", data: png }));
              });
          } else {
            return undefined;
          }
        })
      );
  };

export const axiosImageFetcher = (url: string): Promise<CoverArt | undefined> =>
  axios
    .get(url, {
      headers: BROWSER_HEADERS,
      responseType: "arraybuffer",
    })
    .then((res) => ({
      contentType: res.headers["content-type"],
      data: Buffer.from(res.data, "binary"),
    }))
    .catch(() => undefined);
