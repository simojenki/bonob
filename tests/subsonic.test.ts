import { option as O, either as E } from "fp-ts";
import { v4 as uuid } from "uuid";
import { Md5 } from "ts-md5";
import tmp from "tmp";
import fse from "fs-extra";
import path from "path";
import { pipe } from "fp-ts/lib/function";

import sharp from "sharp";
jest.mock("sharp");

import axios from "axios";
jest.mock("axios");

import randomstring from "randomstring";
jest.mock("randomstring");

import { URLBuilder } from "../src/url_builder";
import {
  isValidImage,
  t,
  DODGY_IMAGE_NAME,
  asURLSearchParams,
  cachingImageFetcher,
  asTrack,
  artistImageURN,
  song,
  TranscodingCustomPlayers,
  CustomPlayers,
  NO_CUSTOM_PLAYERS,
  Subsonic,
  asGenre,
  PingResponse
} from "../src/subsonic";

import { getArtistJson, getArtistInfoJson, asArtistsJson } from "./subsonic_music_library.test";

import { b64Encode } from "../src/b64";

import { Album, Artist, Track, AlbumSummary, AuthFailure } from "../src/music_library";
import { anAlbum, aTrack, anAlbumSummary, anArtistSummary, anArtist, aSimilarArtist, POP } from "./builders";
import { BUrn } from "../src/burn";



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
    const customClients = TranscodingCustomPlayers.from(
      "audio/flac,audio/mp3>audio/ogg"
    );

    describe("clientFor", () => {
      describe("when there is a match", () => {
        it("should return the match", () => {
          expect(customClients.encodingFor({ mimeType: "audio/flac" })).toEqual(
            O.of({ player: "bonob+audio/flac", mimeType: "audio/flac" })
          );
          expect(customClients.encodingFor({ mimeType: "audio/mp3" })).toEqual(
            O.of({ player: "bonob+audio/mp3", mimeType: "audio/ogg" })
          );
        });
      });

      describe("when there is no match", () => {
        it("should return undefined", () => {
          expect(customClients.encodingFor({ mimeType: "audio/bob" })).toEqual(
            O.none
          );
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

      // todo: the fact that I need to pass the sharp mock in here isnt correct
      const result = await cachingImageFetcher(dir.name, delegate, sharp)(url);

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

const maybeIdFromCoverArtUrn = (coverArt: BUrn | undefined) =>
  pipe(
    coverArt,
    O.fromNullable,
    O.map((it) => it.resource.split(":")[1]),
    O.getOrElseW(() => "")
  );

const asSongJson = (track: Track) => ({
  id: track.id,
  parent: track.album.id,
  title: track.name,
  album: track.album.name,
  artist: track.artist.name,
  track: track.number,
  genre: track.genre?.name,
  isDir: "false",
  coverArt: maybeIdFromCoverArtUrn(track.coverArt),
  created: "2004-11-08T23:36:11",
  duration: track.duration,
  bitRate: 128,
  size: "5624132",
  suffix: "mp3",
  contentType: track.encoding.mimeType,
  transcodedContentType: undefined,
  isVideo: "false",
  path: "ACDC/High voltage/ACDC - The Jack.mp3",
  albumId: track.album.id,
  artistId: track.artist.id,
  type: "music",
  starred: track.rating.love ? "sometime" : undefined,
  userRating: track.rating.stars,
  year: "",
});

export type ArtistWithAlbum = {
  artist: Artist;
  album: Album;
};

const pingJson = (pingResponse: Partial<PingResponse> = {}) => ({
  "subsonic-response": {
    status: "ok",
    version: "1.16.1",
    type: "subsonic",
    serverVersion: "0.45.1 (c55e6590)",
    ...pingResponse,
  },
});

describe("artistImageURN", () => {
  describe("when artist URL is", () => {
    describe("a valid external URL", () => {
      it("should return an external URN", () => {
        expect(
          artistImageURN({
            artistId: "someArtistId",
            artistImageURL: "http://example.com/image.jpg",
          })
        ).toEqual({
          system: "external",
          resource: "http://example.com/image.jpg",
        });
      });
    });

    describe("an invalid external URL", () => {
      describe("and artistId is valid", () => {
        it("should return an external URN", () => {
          expect(
            artistImageURN({
              artistId: "someArtistId",
              artistImageURL: `http://example.com/${DODGY_IMAGE_NAME}`,
            })
          ).toEqual({ system: "subsonic", resource: "art:someArtistId" });
        });
      });

      describe("and artistId is -1", () => {
        it("should return an error icon urn", () => {
          expect(
            artistImageURN({
              artistId: "-1",
              artistImageURL: `http://example.com/${DODGY_IMAGE_NAME}`,
            })
          ).toBeUndefined();
        });
      });

      describe("and artistId is undefined", () => {
        it("should return an error icon urn", () => {
          expect(
            artistImageURN({
              artistId: undefined,
              artistImageURL: `http://example.com/${DODGY_IMAGE_NAME}`,
            })
          ).toBeUndefined();
        });
      });
    });

    describe("undefined", () => {
      describe("and artistId is valid", () => {
        it("should return artist art by artist id URN", () => {
          expect(
            artistImageURN({
              artistId: "someArtistId",
              artistImageURL: undefined,
            })
          ).toEqual({ system: "subsonic", resource: "art:someArtistId" });
        });
      });

      describe("and artistId is -1", () => {
        it("should return error icon", () => {
          expect(
            artistImageURN({ artistId: "-1", artistImageURL: undefined })
          ).toBeUndefined();
        });
      });

      describe("and artistId is undefined", () => {
        it("should return error icon", () => {
          expect(
            artistImageURN({ artistId: undefined, artistImageURL: undefined })
          ).toBeUndefined();
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
    const track = aTrack({
      artist: {
        id: undefined,
        name: "Not in library so no id",
        image: undefined,
      },
    });

    it("should provide no artistId", () => {
      const result = asTrack(
        album,
        { ...asSongJson(track) },
        NO_CUSTOM_PLAYERS
      );
      expect(result.artist.id).toBeUndefined();
      expect(result.artist.name).toEqual("Not in library so no id");
      expect(result.artist.image).toBeUndefined();
    });
  });

  describe("when the song has no artist name", () => {
    const album = anAlbum();

    it("should provide a ? to sonos", () => {
      const result = asTrack(
        album,
        { id: "1" } as any as song,
        NO_CUSTOM_PLAYERS
      );
      expect(result.artist.id).toBeUndefined();
      expect(result.artist.name).toEqual("?");
      expect(result.artist.image).toBeUndefined();
    });
  });

  describe("invalid rating.stars values", () => {
    const album = anAlbum();
    const track = aTrack();

    describe("a value greater than 5", () => {
      it("should be returned as 0", () => {
        const result = asTrack(
          album,
          { ...asSongJson(track), userRating: 6 },
          NO_CUSTOM_PLAYERS
        );
        expect(result.rating.stars).toEqual(0);
      });
    });

    describe("a value less than 0", () => {
      it("should be returned as 0", () => {
        const result = asTrack(
          album,
          { ...asSongJson(track), userRating: -1 },
          NO_CUSTOM_PLAYERS
        );
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
          const result = asTrack(
            album,
            {
              ...asSongJson(track),
              contentType: "nonTranscodedContentType",
              transcodedContentType: undefined,
            },
            NO_CUSTOM_PLAYERS
          );

          expect(result.encoding).toEqual({
            player: "bonob",
            mimeType: "nonTranscodedContentType",
          });
        });
      });

      describe("when subsonic reports a transcodedContentType", () => {
        it("should use the default client and transcodedContentType", () => {
          const result = asTrack(
            album,
            {
              ...asSongJson(track),
              contentType: "nonTranscodedContentType",
              transcodedContentType: "transcodedContentType",
            },
            NO_CUSTOM_PLAYERS
          );

          expect(result.encoding).toEqual({
            player: "bonob",
            mimeType: "transcodedContentType",
          });
        });
      });
    });

    describe("when there are custom players registered", () => {
      const streamClient = {
        encodingFor: jest.fn(),
      };

      describe("however no player is found for the default mimeType", () => {
        describe("and there is no transcodedContentType", () => {
          it("should use the default player with the default content type", () => {
            streamClient.encodingFor.mockReturnValue(O.none);

            const result = asTrack(
              album,
              {
                ...asSongJson(track),
                contentType: "nonTranscodedContentType",
                transcodedContentType: undefined,
              },
              streamClient as unknown as CustomPlayers
            );

            expect(result.encoding).toEqual({
              player: "bonob",
              mimeType: "nonTranscodedContentType",
            });
            expect(streamClient.encodingFor).toHaveBeenCalledWith({
              mimeType: "nonTranscodedContentType",
            });
          });
        });

        describe("and there is a transcodedContentType", () => {
          it("should use the default player with the transcodedContentType", () => {
            streamClient.encodingFor.mockReturnValue(O.none);

            const result = asTrack(
              album,
              {
                ...asSongJson(track),
                contentType: "nonTranscodedContentType",
                transcodedContentType: "transcodedContentType1",
              },
              streamClient as unknown as CustomPlayers
            );

            expect(result.encoding).toEqual({
              player: "bonob",
              mimeType: "transcodedContentType1",
            });
            expect(streamClient.encodingFor).toHaveBeenCalledWith({
              mimeType: "nonTranscodedContentType",
            });
          });
        });
      });

      describe("there is a player with the matching content type", () => {
        it("should use it", () => {
          const customEncoding = {
            player: "custom-player",
            mimeType: "audio/some-mime-type",
          };
          streamClient.encodingFor.mockReturnValue(O.of(customEncoding));

          const result = asTrack(
            album,
            {
              ...asSongJson(track),
              contentType: "sourced-from/subsonic",
              transcodedContentType: "sourced-from/subsonic2",
            },
            streamClient as unknown as CustomPlayers
          );

          expect(result.encoding).toEqual(customEncoding);
          expect(streamClient.encodingFor).toHaveBeenCalledWith({
            mimeType: "sourced-from/subsonic",
          });
        });
      });
    });
  });
});

const subsonicResponse = (response : Partial<{ status: string, body: any }> = { }) => {
  const status = response.status || "ok"
  const body = response.body || {}
  return {
    "subsonic-response": {
      status,
      version: "1.16.1",
      type: "subsonic",
      serverVersion: "0.45.1 (c55e6590)",
      ...body,
    },
  };
};

const subsonicOK = (body: any = {}) => subsonicResponse({ status: "ok", body });

const asGenreJson = (genre: { name: string; albumCount: number }) => ({
  songCount: 1475,
  albumCount: genre.albumCount,
  value: genre.name,
});

const getGenresJson = (genres: { name: string; albumCount: number }[]) =>
  subsonicOK({
    genres: {
      genre: genres.map(asGenreJson),
    },
  });

const ok = (data: string | object) => ({
  status: 200,
  data,
});

export const asArtistAlbumJson = (
  artist: { id: string | undefined; name: string | undefined },
  album: AlbumSummary
) => ({
  id: album.id,
  parent: artist.id,
  isDir: "true",
  title: album.name,
  name: album.name,
  album: album.name,
  artist: artist.name,
  genre: album.genre?.name,
  duration: "123",
  playCount: "4",
  year: album.year,
  created: "2021-01-07T08:19:55.834207205Z",
  artistId: artist.id,
  songCount: "19",
});

export const asAlbumJson = (
  artist: { id: string | undefined; name: string | undefined },
  album: Album
) => ({
  id: album.id,
  parent: artist.id,
  isDir: "true",
  title: album.name,
  name: album.name,
  album: album.name,
  artist: artist.name,
  genre: album.genre?.name,
  coverArt: maybeIdFromCoverArtUrn(album.coverArt),
  duration: "123",
  playCount: "4",
  year: album.year,
  created: "2021-01-07T08:19:55.834207205Z",
  artistId: artist.id,
  songCount: "19",
  isVideo: false,
  song: album.tracks.map(asSongJson),
});


export const getAlbumJson = (album: Album) =>
  subsonicOK({ album: {
    id: album.id,
    parent: album.artistId,
    album: album.name,
    title: album.name,
    name: album.name,
    isDir: true,
    coverArt: maybeIdFromCoverArtUrn(album.coverArt),
    songCount: 19,
    created: "2021-01-07T08:19:55.834207205Z",
    duration: 123,
    playCount: 4,
    artistId: album.artistId,
    artist: album.artistName,
    year: album.year,
    genre: album.genre?.name,
    song: album.tracks.map(track => ({
      id: track.id,
      parent: track.album.id,
      title: track.name,
      isDir: false,
      isVideo: false,
      type: "music",
      albumId: track.album.id,
      album: track.album.name,
      artistId: track.artist.id,
      artist: track.artist.name,
      coverArt: maybeIdFromCoverArtUrn(track.coverArt),
      duration: track.duration,
      bitRate: 128,
      bitDepth: 16,
      samplingRate: 555,
      channelCount: 2,
      track: track.number,
      year: 1900,
      genre: track.genre?.name,
      size: 5624132,
      discNumer: 1,
      suffix: "mp3",
      contentType: track.encoding.mimeType,
      path: "ACDC/High voltage/ACDC - The Jack.mp3"
    })),
  } });

describe("Subsonic", () => {
  const url = new URLBuilder("http://127.0.0.22:4567/some-context-path");
  const customPlayers = {
    encodingFor: jest.fn(),
  };
  const username = `user1-${uuid()}`;
  const password = `pass1-${uuid()}`;
  const credentials = { username, password };
  const subsonic = new Subsonic(url, customPlayers);

  const mockRandomstring = jest.fn();
  const mockGET = jest.fn();
  const mockPOST = jest.fn();

  const salt = "saltysalty";

  const authParams = {
    u: username,
    v: "1.16.1",
    c: "bonob",
    t: t(password, salt),
    s: salt,
  };

  const authParamsPlusJson = {
    ...authParams,
    f: "json",
  };

  const headers = {
    "User-Agent": "bonob",
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetAllMocks();

    randomstring.generate = mockRandomstring;
    axios.get = mockGET;
    axios.post = mockPOST;

    mockRandomstring.mockReturnValue(salt);
  });

  describe("ping", () => {
    describe("when authenticates and status is ok", () => {
      beforeEach(() => {
        mockGET.mockImplementationOnce(() =>
          Promise.resolve(ok(pingJson({ 
            status: "ok",
            type: "subsonic-that-works"
          })))
        );
      });

      it("should return authenticated", async () => {
        const result = await subsonic.ping(credentials)();
        expect(result).toEqual(E.right({ authenticated: true, type: "subsonic-that-works" }));
      });
    });

    describe("when authenticates however status is not ok", () => {
      beforeEach(() => {
        mockGET.mockImplementationOnce(() =>
          Promise.resolve(ok(pingJson({ 
            status: "i am not ok",
            type: "subsonic-that-doesnt-works"
          })))
        );
      });

      it("should return an error", async () => {
        const result = await subsonic.ping(credentials)();
        expect(result).toEqual(E.left(new AuthFailure("Not authenticated, status not 'ok'")));
      });
    });
  });  

  describe("getting artists", () => {
    describe("when there are indexes, but no artists", () => {
      beforeEach(() => {
        mockGET.mockImplementationOnce(() =>
          Promise.resolve(
            ok(
              subsonicOK({
                artists: {
                  index: [
                    {
                      name: "#",
                    },
                    {
                      name: "A",
                    },
                    {
                      name: "B",
                    },
                  ],
                },
              })
            )
          )
        );
      });

      it("should return empty", async () => {
        const artists = await subsonic.getArtists(credentials);

        expect(artists).toEqual([]);
      });
    });

    describe("when there no indexes and no artists", () => {
      beforeEach(() => {
        mockGET.mockImplementationOnce(() =>
          Promise.resolve(
            ok(
              subsonicOK({
                artists: {},
              })
            )
          )
        );
      });

      it("should return empty", async () => {
        const artists = await subsonic.getArtists(credentials);

        expect(artists).toEqual([]);
      });
    });

    describe("when there are artists", () => {
      const artist1 = anArtist({ name: "A Artist", albums: [anAlbum()] });
      const artist2 = anArtist({ name: "B Artist", albums: [anAlbum(), anAlbum()] });
      const artist3 = anArtist({ name: "C Artist" });
      const artist4 = anArtist({ name: "D Artist" });
      const artists = [artist1, artist2, artist3, artist4];

      beforeEach(() => {
        mockGET.mockImplementationOnce(() =>
          Promise.resolve(ok(asArtistsJson(artists)))
        );
      });

      it("should return all the artists", async () => {
        const artists = await subsonic.getArtists(credentials);

        const expectedResults = [artist1, artist2, artist3, artist4].map(
          (it) => ({
            id: it.id,
            image: it.image,
            name: it.name,
            albumCount: it.albums.length
          })
        );

        expect(artists).toEqual(expectedResults);

        expect(axios.get).toHaveBeenCalledWith(
          url.append({ pathname: "/rest/getArtists" }).href(),
          {
            params: asURLSearchParams(authParamsPlusJson),
            headers,
          }
        );
      });
    });
  });

   describe("getArtist", () => {
      describe("when the artist exists", () => {
        describe("and has multiple albums", () => {
          const album1 = anAlbumSummary({ genre: asGenre("Pop") });
  
          const album2 = anAlbumSummary({ genre: asGenre("Flop") });
  
          const artist: Artist = anArtist({
            albums: [album1, album2]
          });
  
          beforeEach(() => {
            mockGET
              .mockImplementationOnce(() =>
                Promise.resolve(ok(getArtistJson(artist)))
              )
          });
  
          it("should return it", async () => {
            const result = await subsonic.getArtist(credentials, artist.id!);
  
            expect(result).toEqual({
              id: artist.id,
              name: artist.name,
              artistImageUrl: undefined,
              albums: artist.albums
            });
  
            expect(axios.get).toHaveBeenCalledWith(
              url.append({ pathname: "/rest/getArtist" }).href(),
              {
                params: asURLSearchParams({
                  ...authParamsPlusJson,
                  id: artist.id,
                }),
                headers,
              }
            );
          });
        });
  
        describe("and has only 1 album", () => {
          const album = anAlbumSummary({ genre: POP });
  
          const artist: Artist = anArtist({
            albums: [album]
          });
  
          beforeEach(() => {
            mockGET
              .mockImplementationOnce(() =>
                Promise.resolve(ok(getArtistJson(artist)))
              )
          });
  
          it("should return it", async () => {
            const result = await subsonic.getArtist(credentials, artist.id!);
  
            expect(result).toEqual({
              id: artist.id,
              name: artist.name,
              artistImageUrl: undefined,
              albums: artist.albums,
            });
  
            expect(axios.get).toHaveBeenCalledWith(
              url.append({ pathname: "/rest/getArtist" }).href(),
              {
                params: asURLSearchParams({
                  ...authParamsPlusJson,
                  id: artist.id,
                }),
                headers,
              }
            );
          });
        });
  
        describe("and has no albums", () => {
          const artist: Artist = anArtist({
            albums: [],
          });
  
          beforeEach(() => {
            mockGET
              .mockImplementationOnce(() =>
                Promise.resolve(ok(getArtistJson(artist)))
              )
          });
  
          it("should return it", async () => {
            const result = await subsonic.getArtist(credentials, artist.id!);
  
            expect(result).toEqual({
              id: artist.id,
              name: artist.name,
              artistImageUrl: undefined,
              albums: []
            });
  
            expect(axios.get).toHaveBeenCalledWith(
              url.append({ pathname: "/rest/getArtist" }).href(),
              {
                params: asURLSearchParams({
                  ...authParamsPlusJson,
                  id: artist.id,
                }),
                headers,
              }
            );
          });
        });

        describe("and has an artistImageUrl", () => {
          const artist: Artist = anArtist({
            albums: []
          });
  
          const artistImageUrl = `http://localhost:1234/somewhere.jpg`;
  
          beforeEach(() => {
            mockGET
              .mockImplementationOnce(() =>
                Promise.resolve(
                  ok(getArtistJson(artist, { artistImageUrl }))
                )
              )
          });
  
          it("should return the artist image url", async () => {
            const result = await subsonic.getArtist(credentials, artist.id!);
  
            expect(result).toEqual({
              id: artist.id,
              name: artist.name,
              artistImageUrl,
              albums: [],
            });
  
            // todo: these are everywhere??
            expect(axios.get).toHaveBeenCalledWith(
              url.append({ pathname: "/rest/getArtist" }).href(),
              {
                params: asURLSearchParams({
                  ...authParamsPlusJson,
                  id: artist.id,
                }),
                headers,
              }
            );
          });
        });  
      });

      // todo: what happens when the artist doesnt exist?
    });

    describe("getArtistInfo", () => {
      // todo: what happens when the artist doesnt exist?

      describe("when the artist exists", () => {
        describe("and has many similar artists", () => {
          const artist = anArtist({
            similarArtists: [
              aSimilarArtist({
                id: "similar1.id",
                name: "similar1",
                inLibrary: true,
              }),
              aSimilarArtist({ id: "-1", name: "similar2", inLibrary: false }),
              aSimilarArtist({
                id: "similar3.id",
                name: "similar3",
                inLibrary: true,
              }),
              aSimilarArtist({ id: "-1", name: "similar4", inLibrary: false }),
            ],
          });
  
          beforeEach(() => {
            mockGET
              .mockImplementationOnce(() =>
                Promise.resolve(ok(getArtistInfoJson(artist)))
              )
          });
  
          it("should return the similar artists", async () => {
            const result = await subsonic.getArtistInfo(credentials, artist.id!);
  
            expect(result).toEqual({
              similarArtist: artist.similarArtists,
              images: {
                l: undefined,
                m: undefined,
                s: undefined
              }
            });
    
            expect(axios.get).toHaveBeenCalledWith(
              url.append({ pathname: "/rest/getArtistInfo2" }).href(),
              {
                params: asURLSearchParams({
                  ...authParamsPlusJson,
                  id: artist.id,
                  count: 50,
                  includeNotPresent: true,
                }),
                headers,
              }
            );
          });
        });
  
        describe("and has one similar artist", () => {
          const artist = anArtist({
            similarArtists: [
              aSimilarArtist({
                id: "similar1.id",
                name: "similar1",
                inLibrary: true,
              }),
            ],
          });
  
          beforeEach(() => {
            mockGET
              .mockImplementationOnce(() =>
                Promise.resolve(ok(getArtistInfoJson(artist)))
              );
          });
  
          it("should return the similar artists", async () => {
            const result = await subsonic.getArtistInfo(credentials, artist.id!);
  
            expect(result).toEqual({
              similarArtist: artist.similarArtists,
              images: {
                l: undefined,
                m: undefined,
                s: undefined
              }
            });
  
            expect(axios.get).toHaveBeenCalledWith(
              url.append({ pathname: "/rest/getArtistInfo2" }).href(),
              {
                params: asURLSearchParams({
                  ...authParamsPlusJson,
                  id: artist.id,
                  count: 50,
                  includeNotPresent: true,
                }),
                headers,
              }
            );
          });
        });
  
        describe("and has no similar artists", () => {
          const artist = anArtist({
            similarArtists: [],
          });
  
          beforeEach(() => {
            mockGET
              .mockImplementationOnce(() =>
                Promise.resolve(ok(getArtistInfoJson(artist)))
              );
          });
  
          it("should return the similar artists", async () => {
            const result = await subsonic.getArtistInfo(credentials, artist.id!);
  
            expect(result).toEqual({
              similarArtist: artist.similarArtists,
              images: {
                l: undefined,
                m: undefined,
                s: undefined
              }
            });
  
            expect(axios.get).toHaveBeenCalledWith(
              url.append({ pathname: "/rest/getArtistInfo2" }).href(),
              {
                params: asURLSearchParams({
                  ...authParamsPlusJson,
                  id: artist.id,
                  count: 50,
                  includeNotPresent: true,
                }),
                headers,
              }
            );
          });
        });
  
        describe("and has some images", () => {
          const artist: Artist = anArtist({
            albums: [],
            similarArtists: [],
          });

          const smallImageUrl = "http://small";
          const mediumImageUrl = "http://medium";
          const largeImageUrl = "http://large"
  
  
          beforeEach(() => {
            mockGET
              .mockImplementationOnce(() =>
                Promise.resolve(
                  ok(
                    getArtistInfoJson(artist, {
                      smallImageUrl,
                      mediumImageUrl,
                      largeImageUrl,
                    })
                  )
                )
              );
          });
  
          it("should fetch the images", async () => {
            const result = await subsonic.getArtistInfo(credentials, artist.id!);
  
            expect(result).toEqual({
              similarArtist: [],
              images: {
                s: smallImageUrl,
                m: mediumImageUrl,
                l: largeImageUrl
              }
            });
  
            expect(axios.get).toHaveBeenCalledWith(
              url.append({ pathname: "/rest/getArtistInfo2" }).href(),
              {
                params: asURLSearchParams({
                  ...authParamsPlusJson,
                  id: artist.id,
                  count: 50,
                  includeNotPresent: true,
                }),
                headers,
              }
            );
          });
        });
      });
    });

  describe("getting genres", () => {
    describe("when there are none", () => {
      beforeEach(() => {
        mockGET.mockImplementationOnce(() =>
          Promise.resolve(ok(getGenresJson([])))
        );
      });

      it("should return empty array", async () => {
        const result = await subsonic.getGenres(credentials);

        expect(result).toEqual([]);

        expect(axios.get).toHaveBeenCalledWith(
          url.append({ pathname: "/rest/getGenres" }).href(),
          {
            params: asURLSearchParams(authParamsPlusJson),
            headers,
          }
        );
      });
    });

    describe("when there is only 1 that has an albumCount > 0", () => {
      const genres = [
        { name: "genre1", albumCount: 1 },
        { name: "genreWithNoAlbums", albumCount: 0 },
      ];

      beforeEach(() => {
        mockGET.mockImplementationOnce(() =>
          Promise.resolve(ok(getGenresJson(genres)))
        );
      });

      it("should return them alphabetically sorted", async () => {
        const result = await subsonic.getGenres(credentials);

        expect(result).toEqual([{ id: b64Encode("genre1"), name: "genre1" }]);

        expect(axios.get).toHaveBeenCalledWith(
          url.append({ pathname: "/rest/getGenres" }).href(),
          {
            params: asURLSearchParams(authParamsPlusJson),
            headers,
          }
        );
      });
    });

    describe("when there are many that have an albumCount > 0", () => {
      const genres = [
        { name: "g1", albumCount: 1 },
        { name: "g2", albumCount: 1 },
        { name: "g3", albumCount: 1 },
        { name: "g4", albumCount: 1 },
        { name: "someGenreWithNoAlbums", albumCount: 0 },
      ];

      beforeEach(() => {
        mockGET.mockImplementationOnce(() =>
          Promise.resolve(ok(getGenresJson(genres)))
        );
      });

      it("should return them alphabetically sorted", async () => {
        const result = await subsonic.getGenres(credentials);

        expect(result).toEqual([
          { id: b64Encode("g1"), name: "g1" },
          { id: b64Encode("g2"), name: "g2" },
          { id: b64Encode("g3"), name: "g3" },
          { id: b64Encode("g4"), name: "g4" },
        ]);

        expect(axios.get).toHaveBeenCalledWith(
          url.append({ pathname: "/rest/getGenres" }).href(),
          {
            params: asURLSearchParams(authParamsPlusJson),
            headers,
          }
        );
      });
    });
  });

  describe("getting an album", () => {
    describe("when there are no custom players", () => {
      beforeEach(() => {
        customPlayers.encodingFor.mockReturnValue(O.none);
      });
  
      describe("when the album has some tracks", () => {
        const artistId = "artist6677"
        const artistName = "Fizzy Wizzy"
  
        const albumSummary = anAlbumSummary({ artistId, artistName })
        const artistSumamry = anArtistSummary({ id: artistId, name: artistName })
  
        // todo: fix these ratings
        const tracks = [
          aTrack({ artist: artistSumamry, album: albumSummary, rating: { love: false, stars: 0 } }),
          aTrack({ artist: artistSumamry, album: albumSummary, rating: { love: false, stars: 0 } }),
          aTrack({ artist: artistSumamry, album: albumSummary, rating: { love: false, stars: 0 } }),
          aTrack({ artist: artistSumamry, album: albumSummary, rating: { love: false, stars: 0 } }),
        ];
  
        const album = anAlbum({
          ...albumSummary,
          tracks,
          artistId,
          artistName,
         });
  
        beforeEach(() => {
          mockGET.mockImplementationOnce(() =>
            Promise.resolve(ok(getAlbumJson(album)))
          );
        });
  
        it("should return the album", async () => {
          const result = await subsonic.getAlbum(credentials, album.id);
  
          expect(result).toEqual(album);
  
          expect(axios.get).toHaveBeenCalledWith(
            url.append({ pathname: "/rest/getAlbum" }).href(),
            {
              params: asURLSearchParams({
                ...authParamsPlusJson,
                id: album.id,
              }),
              headers,
            }
          );
        });
      });

      describe("when the album has no tracks", () => {
        const artistId = "artist6677"
        const artistName = "Fizzy Wizzy"
  
        const albumSummary = anAlbumSummary({ artistId, artistName })
  
        const album = anAlbum({
          ...albumSummary,
          tracks: [],
          artistId,
          artistName,
         });
  
        beforeEach(() => {
          mockGET.mockImplementationOnce(() =>
            Promise.resolve(ok(getAlbumJson(album)))
          );
        });
  
        it("should return the album", async () => {
          const result = await subsonic.getAlbum(credentials, album.id);
  
          expect(result).toEqual(album);
  
          expect(axios.get).toHaveBeenCalledWith(
            url.append({ pathname: "/rest/getAlbum" }).href(),
            {
              params: asURLSearchParams({
                ...authParamsPlusJson,
                id: album.id,
              }),
              headers,
            }
          );
        });
      });

    });

    describe("when a custom player is configured for the mime type", () => {
        const hipHop = asGenre("Hip-Hop");
        const tripHop = asGenre("Trip-Hop");

        const albumSummary = anAlbumSummary({ id: "album1", name: "Burnin", genre: hipHop });

        const artistSummary = anArtistSummary({
          id: "artist1",
          name: "Bob Marley"
        });

        const alac = aTrack({
          artist: artistSummary,
          album: albumSummary,
          encoding: {
            player: "bonob",
            mimeType: "audio/alac",
          },
          genre: hipHop,
          rating: {
            love: true,
            stars: 3,
          },
        });
        const m4a = aTrack({
          artist: artistSummary,
          album: albumSummary,
          encoding: {
            player: "bonob",
            mimeType: "audio/m4a",
          },
          genre: hipHop,
          rating: {
            love: false,
            stars: 0,
          },
        });
        const mp3 = aTrack({
          artist: artistSummary,
          album: albumSummary,
          encoding: {
            player: "bonob",
            mimeType: "audio/mp3",
          },
          genre: tripHop,
          rating: {
            love: true,
            stars: 5,
          },
        });

        const album = anAlbum({
          ...albumSummary,
          tracks: [alac, m4a, mp3]
        })
      
       beforeEach(() => {
          customPlayers.encodingFor
            .mockReturnValueOnce(
              O.of({ player: "bonob+audio/alac", mimeType: "audio/flac" })
            )
            .mockReturnValueOnce(
              O.of({ player: "bonob+audio/m4a", mimeType: "audio/opus" })
            )
            .mockReturnValueOnce(O.none);

          mockGET.mockImplementationOnce(() =>
            Promise.resolve(ok(getAlbumJson(album)))
          );
        });

        it("should return the album with custom players applied", async () => {
          const result = await subsonic.getAlbum(credentials, album.id);

          expect(result).toEqual({
            ...album,
            tracks: [
              {
                ...alac,
                encoding: {
                  player: "bonob+audio/alac",
                  mimeType: "audio/flac",
                },
                // todo: this doesnt seem right? why dont the ratings come back?
                rating: {
                  love: false,
                  stars: 0
                }
              },
              {
                ...m4a,
                encoding: {
                  player: "bonob+audio/m4a",
                  mimeType: "audio/opus",
                },
                rating: {
                  love: false,
                  stars: 0
                }
              },
              {
                ...mp3,
                encoding: {
                  player: "bonob",
                  mimeType: "audio/mp3",
                },
                rating: {
                  love: false,
                  stars: 0
                }
              },
            ]
          });

          expect(axios.get).toHaveBeenCalledWith(
            url.append({ pathname: "/rest/getAlbum" }).href(),
            {
              params: asURLSearchParams({
                ...authParamsPlusJson,
                id: album.id,
              }),
              headers,
            }
          );

          expect(customPlayers.encodingFor).toHaveBeenCalledTimes(3);
          expect(customPlayers.encodingFor).toHaveBeenNthCalledWith(1, {
            mimeType: "audio/alac",
          });
          expect(customPlayers.encodingFor).toHaveBeenNthCalledWith(2, {
            mimeType: "audio/m4a",
          });
          expect(customPlayers.encodingFor).toHaveBeenNthCalledWith(3, {
            mimeType: "audio/mp3",
          });
        });        
    });
  });  

  describe("stars and unstars", () => {
    const id = uuid();

    describe("staring a track", () => {
      describe("when ok", () => {
        beforeEach(() => {
          mockGET.mockImplementationOnce(() =>
            Promise.resolve(ok(subsonicResponse({ status: "ok" })))
          );
        });

        it("should return true", async () => {
          const result = await subsonic.star(credentials, { id });
  
          expect(result).toEqual(true);
          expect(axios.get).toHaveBeenCalledWith(
            url.append({ pathname: "/rest/star" }).href(),
            {
              params: asURLSearchParams({
                ...authParamsPlusJson,
                id
              }),
              headers,
            }
          );
        });
      });

      describe("when not ok", () => {
        beforeEach(() => {
          mockGET.mockImplementationOnce(() =>
            Promise.resolve(ok(subsonicResponse({ status: "not-ok" })))
          );
        });

        it("should return false", async () => {
          const result = await subsonic.star(credentials, { id });

          expect(result).toEqual(false);
        });
      });
    });
  });  

  describe("setting ratings", () => {
    const id = uuid();

    describe("when the rating is valid", () => {
      describe("when response is ok", () => {
        beforeEach(() => {
          mockGET.mockImplementationOnce(() =>
            Promise.resolve(ok(subsonicResponse({ status: "ok" })))
          );
        });

        it("should return true", async () => {
          const result = await subsonic.setRating(credentials, id, 4);
  
          expect(result).toEqual(true);
          expect(axios.get).toHaveBeenCalledWith(
            url.append({ pathname: "/rest/setRating" }).href(),
            {
              params: asURLSearchParams({
                ...authParamsPlusJson,
                id,
                rating: 4
              }),
              headers,
            }
          );
        });
      });

      describe("when response is not ok", () => {
        beforeEach(() => {
          mockGET.mockImplementationOnce(() =>
            Promise.resolve(ok(subsonicResponse({ status: "not-ok" })))
          );
        });

        it("should return false", async () => {
          const result = await subsonic.setRating(credentials, id, 2);
  
          expect(result).toEqual(false);
        });
      });
    });
  });   

  describe("scrobble", () => {
    const id = uuid();

    describe("with submission", () => {
      const submission = true;

      beforeEach(() => {
        mockGET.mockImplementationOnce(() =>
          Promise.resolve(ok(subsonicResponse({ status: "ok" })))
        );
      });

      it("should scrobble and return true", async () => {
        const result = await subsonic.scrobble(credentials, id, submission);

        expect(result).toEqual(true);
        expect(axios.get).toHaveBeenCalledWith(
          url.append({ pathname: "/rest/scrobble" }).href(),
          {
            params: asURLSearchParams({
              ...authParamsPlusJson,
              id,
              submission
            }),
            headers,
          }
        );
      });
    });

    describe("without submission", () => {
      const submission = false;

      beforeEach(() => {
        mockGET.mockImplementationOnce(() =>
          Promise.resolve(ok(subsonicResponse({ status: "ok" })))
        );
      });

      it("should scrobble and return true", async () => {
        const result = await subsonic.scrobble(credentials, id, submission);

        expect(result).toEqual(true);
        expect(axios.get).toHaveBeenCalledWith(
          url.append({ pathname: "/rest/scrobble" }).href(),
          {
            params: asURLSearchParams({
              ...authParamsPlusJson,
              id,
              submission
            }),
            headers,
          }
        );
      });
    });

    describe("when fails", () => {
      beforeEach(() => {
        mockGET.mockImplementationOnce(() =>
          Promise.resolve(ok(subsonicResponse({ status: "not-ok" })))
        );
      });

      it("should return false", async () => {
        const result = await subsonic.scrobble(credentials, id, false);

        expect(result).toEqual(false);
      });
    });
  });  
});
