import { Md5 } from "ts-md5";
import tmp from "tmp";
import fse from "fs-extra";
import path from "path";
import { option as O } from "fp-ts";

import {
  isValidImage,
  t,
  asURLSearchParams,
  cachingImageFetcher,
  asTrack,
  artistImageURN,
  TranscodingCustomPlayers,
  CustomPlayers,
  DODGY_IMAGE_NAME,
  NO_CUSTOM_PLAYERS,
  song,
} from "../src/subsonic";

import sharp from "sharp";
jest.mock("sharp");

import {
  anAlbum,
  aTrack,
} from "./builders";

import {
  asSongJson,
} from "./subsonic.test.helpers";

describe("t", () => {
  it("should be an md5 of the password and the salt", () => {
    const p = "password123";
    const s = "saltydog";
    expect(t(p, s)).toEqual(Md5.hashStr(`${p}${s}`));
  });
});

describe("isValidImage", () => {
  describe("when ends with 2a96cbd8b46e442fc41c2b86b821562f.png", () => {
    it("is dodgy", () => {
      expect(
        isValidImage("http://something/2a96cbd8b46e442fc41c2b86b821562f.png")
      ).toEqual(false);
    });
  });
  describe("when does not end with 2a96cbd8b46e442fc41c2b86b821562f.png", () => {
    it("is dodgy", () => {
      expect(isValidImage("http://something/somethingelse.png")).toEqual(true);
      expect(
        isValidImage(
          "http://something/2a96cbd8b46e442fc41c2b86b821562f.png?withsomequerystring=true"
        )
      ).toEqual(true);
    });
  });
});


describe("StreamClient(s)", () => {
  describe("CustomStreamClientApplications", () => {
    const customClients = TranscodingCustomPlayers.from("audio/flac,audio/mp3>audio/ogg")
  
    describe("clientFor", () => {
      describe("when there is a match", () => {
        it("should return the match", () => {
          expect(customClients.encodingFor({ mimeType: "audio/flac" })).toEqual(O.of({player: "bonob+audio/flac", mimeType:"audio/flac"}))
          expect(customClients.encodingFor({ mimeType: "audio/mp3" })).toEqual(O.of({player: "bonob+audio/mp3", mimeType:"audio/ogg"}))
        });
      });
  
      describe("when there is no match", () => {
        it("should return undefined", () => {
          expect(customClients.encodingFor({ mimeType: "audio/bob" })).toEqual(O.none)
        });
      });
    });
  }); 
});

describe("asURLSearchParams", () => {
  describe("empty q", () => {
    it("should return empty params", () => {
      const q = {};
      const expected = new URLSearchParams();
      expect(asURLSearchParams(q)).toEqual(expected);
    });
  });

  describe("singular params", () => {
    it("should append each", () => {
      const q = {
        a: 1,
        b: "bee",
        c: false,
        d: true,
      };
      const expected = new URLSearchParams();
      expected.append("a", "1");
      expected.append("b", "bee");
      expected.append("c", "false");
      expected.append("d", "true");

      expect(asURLSearchParams(q)).toEqual(expected);
    });
  });

  describe("list params", () => {
    it("should append each", () => {
      const q = {
        a: [1, "two", false, true],
        b: "yippee",
      };

      const expected = new URLSearchParams();
      expected.append("a", "1");
      expected.append("a", "two");
      expected.append("a", "false");
      expected.append("a", "true");
      expected.append("b", "yippee");

      expect(asURLSearchParams(q)).toEqual(expected);
    });
  });
});

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

describe("artistURN", () => {
  describe("when artist URL is", () => {
    describe("a valid external URL", () => {
      it("should return an external URN", () => {
        expect(
          artistImageURN({ artistId: "someArtistId", artistImageURL: "http://example.com/image.jpg" })
        ).toEqual({ system: "external", resource: "http://example.com/image.jpg" });
      });
    });

    describe("an invalid external URL", () => {
      describe("and artistId is valid", () => {
        it("should return an external URN", () => {
          expect(
            artistImageURN({
              artistId: "someArtistId",
              artistImageURL: `http://example.com/${DODGY_IMAGE_NAME}`
            })
          ).toEqual({ system: "subsonic", resource: "art:someArtistId" });
        });
      });

      describe("and artistId is -1", () => {
        it("should return an error icon urn", () => {
          expect(
            artistImageURN({
              artistId: "-1",
              artistImageURL: `http://example.com/${DODGY_IMAGE_NAME}`
            })
          ).toBeUndefined();
        });
      });

      describe("and artistId is undefined", () => {
        it("should return an error icon urn", () => {
          expect(
            artistImageURN({
              artistId: undefined,
              artistImageURL: `http://example.com/${DODGY_IMAGE_NAME}`
            })
          ).toBeUndefined();
        });
      });
    });

    describe("undefined", () => {
      describe("and artistId is valid", () => {
        it("should return artist art by artist id URN", () => {
          expect(artistImageURN({ artistId: "someArtistId", artistImageURL: undefined })).toEqual({system:"subsonic", resource:"art:someArtistId"});
        });
      });

      describe("and artistId is -1", () => {
        it("should return error icon", () => {
          expect(artistImageURN({ artistId: "-1", artistImageURL: undefined })).toBeUndefined();
        });
      });

      describe("and artistId is undefined", () => {
        it("should return error icon", () => {
          expect(artistImageURN({ artistId: undefined, artistImageURL: undefined })).toBeUndefined();
        });
      });
    });
  });
});

describe("asTrack", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetAllMocks();
  });

  describe("when the song has no artistId", () => {
    const album = anAlbum();
    const track = aTrack({ artist: undefined });

    it("should provide no artist", () => {
      const result = asTrack(album, { ...asSongJson(track), artistId: undefined }, NO_CUSTOM_PLAYERS);
      expect(result.artist).toBeUndefined();
    });
  });

  describe("when the song has no artist name", () => {
    const album = anAlbum();

    it("should provide a ? to sonos", () => {
      const result = asTrack(album, { id: '1', artistId: 'some-id' } as any as song, NO_CUSTOM_PLAYERS);
      expect(result.artist?.id).toEqual('some-id');
      expect(result.artist?.name).toEqual("?");
      expect(result.artist?.image).toBeDefined();
    });
  });

  describe("invalid rating.stars values", () => {
    const album = anAlbum();
    const track = aTrack();

    describe("a value greater than 5", () => {
      it("should be returned as 0", () => {
        const result = asTrack(album, { ...asSongJson(track), userRating: 6 }, NO_CUSTOM_PLAYERS);
        expect(result.rating.stars).toEqual(0);
      });
    });

    describe("a value less than 0", () => {
      it("should be returned as 0", () => {
        const result = asTrack(album, { ...asSongJson(track), userRating: -1 }, NO_CUSTOM_PLAYERS);
        expect(result.rating.stars).toEqual(0);
      });
    });
  });

  describe("content types", () => {
    const album = anAlbum();
    const track = aTrack();

    describe("when there are no custom players", () => {
      describe("when subsonic reports no transcodedContentType", () => {
        it("should use the default client and default contentType", () => {
          const result = asTrack(album, { 
            ...asSongJson(track),
            contentType: "nonTranscodedContentType",
            transcodedContentType: undefined 
          }, NO_CUSTOM_PLAYERS);

          expect(result.encoding).toEqual({ player: "bonob", mimeType: "nonTranscodedContentType" })
        });
      });

      describe("when subsonic reports a transcodedContentType", () => {
        it("should use the default client and transcodedContentType", () => {
          const result = asTrack(album, { 
            ...asSongJson(track),
            contentType: "nonTranscodedContentType",
            transcodedContentType: "transcodedContentType" 
          }, NO_CUSTOM_PLAYERS);

          expect(result.encoding).toEqual({ player: "bonob", mimeType: "transcodedContentType" })
        });
      });
    });

    describe("when there are custom players registered", () => {
      const streamClient = {
        encodingFor: jest.fn()
      }

      describe("however no player is found for the default mimeType", () => {
        describe("and there is no transcodedContentType", () => {
          it("should use the default player with the default content type", () => {
            streamClient.encodingFor.mockReturnValue(O.none)

            const result = asTrack(album, { 
              ...asSongJson(track),
              contentType: "nonTranscodedContentType",
              transcodedContentType: undefined 
            },  streamClient as unknown as CustomPlayers);
  
            expect(result.encoding).toEqual({ player: "bonob", mimeType: "nonTranscodedContentType" });
            expect(streamClient.encodingFor).toHaveBeenCalledWith({ mimeType: "nonTranscodedContentType" });
          });
        });

        describe("and there is a transcodedContentType", () => {
          it("should use the default player with the transcodedContentType", () => {
            streamClient.encodingFor.mockReturnValue(O.none)

            const result = asTrack(album, { 
              ...asSongJson(track),
              contentType: "nonTranscodedContentType",
              transcodedContentType: "transcodedContentType1" 
            },  streamClient as unknown as CustomPlayers);
  
            expect(result.encoding).toEqual({ player: "bonob", mimeType: "transcodedContentType1" });
            expect(streamClient.encodingFor).toHaveBeenCalledWith({ mimeType: "nonTranscodedContentType" });
          });
        });
      });

      describe("there is a player with the matching content type", () => {
        it("should use it", () => {
          const customEncoding = { player: "custom-player", mimeType: "audio/some-mime-type" };
          streamClient.encodingFor.mockReturnValue(O.of(customEncoding));
    
          const result = asTrack(album, { 
            ...asSongJson(track), 
            contentType: "sourced-from/subsonic", 
            transcodedContentType: "sourced-from/subsonic2" 
          }, streamClient as unknown as CustomPlayers);
    
          expect(result.encoding).toEqual(customEncoding);
          expect(streamClient.encodingFor).toHaveBeenCalledWith({ mimeType: "sourced-from/subsonic" });
        });    
      });
    });
  });
});

