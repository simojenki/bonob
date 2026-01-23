import { v4 as uuid } from "uuid";
import { pipe } from "fp-ts/lib/function";
import { taskEither as TE, option as O, task as T } from "fp-ts";

import {
  Subsonic,
  t,
  asGenre,
  asURLSearchParams,
  CustomPlayers,
} from "../src/subsonic";

import axios from "axios";
jest.mock("axios");

import randomstring from "randomstring";
jest.mock("randomstring");

import {
  albumToAlbumSummary,
  asArtistAlbumPairs,
  Credentials,
  AlbumQuery,
} from "../src/music_service";
import {
  anAlbum,
  anArtist, aTrack,
} from "./builders";
import { b64Encode } from "../src/b64";
import { URLBuilder } from "../src/url_builder";

import {
  ok,
  getAlbumListJson, getAlbumJson,
  PING_OK,
} from "./subsonic.test.helpers";

describe("Subsonic", () => {
  const url = new URLBuilder("http://127.0.0.22:4567/some-context-path");
  const username = `user1-${uuid()}`;
  const password = `pass1-${uuid()}`;
  const salt = "saltysalty";

  const customPlayers = {
    encodingFor: jest.fn()
  };

  const subsonic = new Subsonic(
    url,
    customPlayers as unknown as CustomPlayers
  );

  const mockRandomstring = jest.fn();
  const mockGET = jest.fn();
  const mockPOST = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetAllMocks();

    randomstring.generate = mockRandomstring;
    axios.get = mockGET;
    axios.post = mockPOST;

    mockRandomstring.mockReturnValue(salt);
  });

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

  const tokenFor = (credentials: Credentials) => pipe(
    subsonic.generateToken(credentials),
    TE.fold(e => { throw e }, T.of)
  )

  const login = (credentials: Credentials) => tokenFor(credentials)().then((it) => subsonic.login(it.serviceToken))

  describe("getting albums", () => {
    describe("filtering", () => {
      const album1 = anAlbum({ id: "album1", genre: asGenre("Pop") });
      const album2 = anAlbum({ id: "album2", genre: asGenre("Rock") });
      const album3 = anAlbum({ id: "album3", genre: asGenre("Pop") });
      const album4 = anAlbum({ id: "album4", genre: asGenre("Pop") });
      const album5 = anAlbum({ id: "album5", genre: asGenre("Pop") });

      const artist = anArtist({
        albums: [album1, album2, album3, album4, album5],
      });

      describe("by genre", () => {
        beforeEach(() => {
          mockGET
            .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
            .mockImplementationOnce(() =>
              Promise.resolve(
                ok(
                  getAlbumListJson([
                    [artist, album1],
                    // album2 is not Pop
                    [artist, album3],
                  ])
                )
              )
            );
        });

        it("should map the 64 encoded genre back into the subsonic genre", async () => {
          const q: AlbumQuery = {
            _index: 0,
            _count: 100,
            genre: b64Encode("Pop"),
            type: "byGenre",
          };
          const result = await login({ username, password })
            .then((it) => it.albums(q));

          expect(result).toEqual({
            results: [album1, album3].map(albumToAlbumSummary),
            total: 2,
          });

          expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getAlbumList2' }).href(), {
            params: asURLSearchParams({
              ...authParamsPlusJson,
              type: "byGenre",
              genre: "Pop",
              size: 100,
              offset: 0,
            }),
            headers,
          });
        });
      });

      describe("by newest", () => {
        beforeEach(() => {
          mockGET
            .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
            .mockImplementationOnce(() =>
              Promise.resolve(
                ok(
                  getAlbumListJson([
                    [artist, album3],
                    [artist, album2],
                    [artist, album1],
                  ])
                )
              )
            );
        });

        it("should pass the filter to navidrome", async () => {
          const q: AlbumQuery = {
            _index: 0,
            _count: 100,
            type: "recentlyAdded",
          };
          const result = await login({ username, password })
            .then((it) => it.albums(q));

          expect(result).toEqual({
            results: [album3, album2, album1].map(albumToAlbumSummary),
            total: 3,
          });

          expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getAlbumList2' }).href(), {
            params: asURLSearchParams({
              ...authParamsPlusJson,
              type: "newest",
              size: 100,
              offset: 0,
            }),
            headers,
          });
        });
      });

      describe("by recently played", () => {
        beforeEach(() => {
          mockGET
            .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
            .mockImplementationOnce(() =>
              Promise.resolve(
                ok(
                  getAlbumListJson([
                    [artist, album3],
                    [artist, album2],
                    // album1 never played
                  ])
                )
              )
            );
        });

        it("should pass the filter to navidrome", async () => {
          const q: AlbumQuery = {
            _index: 0,
            _count: 100,
            type: "recentlyPlayed",
          };
          const result = await login({ username, password })
            .then((it) => it.albums(q));

          expect(result).toEqual({
            results: [album3, album2].map(albumToAlbumSummary),
            total: 2,
          });

          expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getAlbumList2' }).href(), {
            params: asURLSearchParams({
              ...authParamsPlusJson,
              type: "recent",
              size: 100,
              offset: 0,
            }),
            headers,
          });
        });
      });

      describe("by frequently played", () => {
        beforeEach(() => {
          mockGET
            .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
            .mockImplementationOnce(
              () =>
                // album1 never played
                Promise.resolve(ok(getAlbumListJson([[artist, album2]])))
              // album3 never played
            );
        });

        it("should pass the filter to navidrome", async () => {
          const q: AlbumQuery = { _index: 0, _count: 100, type: "mostPlayed" };
          const result = await login({ username, password })
            .then((it) => it.albums(q));

          expect(result).toEqual({
            results: [album2].map(albumToAlbumSummary),
            total: 1,
          });

          expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getAlbumList2' }).href(), {
            params: asURLSearchParams({
              ...authParamsPlusJson,
              type: "frequent",
              size: 100,
              offset: 0,
            }),
            headers,
          });
        });
      });

      describe("by starred", () => {
        beforeEach(() => {
          mockGET
            .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
            .mockImplementationOnce(
              () =>
                // album1 never played
                Promise.resolve(ok(getAlbumListJson([[artist, album2]])))
              // album3 never played
            );
        });

        it("should pass the filter to navidrome", async () => {
          const q: AlbumQuery = { _index: 0, _count: 100, type: "starred" };
          const result = await login({ username, password })
            .then((it) => it.albums(q));

          expect(result).toEqual({
            results: [album2].map(albumToAlbumSummary),
            total: 1,
          });

          expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getAlbumList2' }).href(), {
            params: asURLSearchParams({
              ...authParamsPlusJson,
              type: "highest",
              size: 100,
              offset: 0,
            }),
            headers,
          });
        });
      });
    });

    describe("when the artist has only 1 album", () => {
      const artist = anArtist({
        name: "one hit wonder",
        albums: [anAlbum({ genre: asGenre("Pop") })],
      });
      const artists = [artist];
      const albums = artists.flatMap((artist) => artist.albums);

      beforeEach(() => {
        mockGET
          .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
          .mockImplementationOnce(() =>
            Promise.resolve(ok(getAlbumListJson(asArtistAlbumPairs(artists))))
          );
      });

      it("should return the album", async () => {
        const q: AlbumQuery = {
          _index: 0,
          _count: 100,
          type: "alphabeticalByArtist",
        };
        const result = await login({ username, password })
          .then((it) => it.albums(q));

        expect(result).toEqual({
          results: albums,
          total: 1,
        });

        expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getAlbumList2' }).href(), {
          params: asURLSearchParams({
            ...authParamsPlusJson,
            type: "alphabeticalByArtist",
            size: 100,
            offset: 0,
          }),
          headers,
        });
      });
    });

    describe("when the only artist has no albums", () => {
      const artist = anArtist({
        name: "no hit wonder",
        albums: [],
      });
      const artists = [artist];
      const albums = artists.flatMap((artist) => artist.albums);

      beforeEach(() => {
        mockGET
          .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
          .mockImplementationOnce(() =>
            Promise.resolve(ok(getAlbumListJson(asArtistAlbumPairs(artists))))
          );
      });

      it("should return the album", async () => {
        const q: AlbumQuery = {
          _index: 0,
          _count: 100,
          type: "alphabeticalByArtist",
        };
        const result = await login({ username, password })
          .then((it) => it.albums(q));

        expect(result).toEqual({
          results: albums,
          total: 0,
        });

        expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getAlbumList2' }).href(), {
          params: asURLSearchParams({
            ...authParamsPlusJson,
            type: "alphabeticalByArtist",
            size: 100,
            offset: 0,
          }),
          headers,
        });
      });
    });

    describe("when there are 6 albums in total", () => {
      const genre1 = asGenre("genre1");
      const genre2 = asGenre("genre2");
      const genre3 = asGenre("genre3");

      const artist1 = anArtist({
        name: "abba",
        albums: [
          anAlbum({ name: "album1", genre: genre1 }),
          anAlbum({ name: "album2", genre: genre2 }),
          anAlbum({ name: "album3", genre: genre3 }),
        ],
      });
      const artist2 = anArtist({
        name: "babba",
        albums: [
          anAlbum({ name: "album4", genre: genre1 }),
          anAlbum({ name: "album5", genre: genre2 }),
          anAlbum({ name: "album6", genre: genre3 }),
        ],
      });
      const artists = [artist1, artist2];
      const albums = artists.flatMap((artist) => artist.albums);

      describe("querying for all of them", () => {
        it("should return all of them with corrent paging information", async () => {
          mockGET
            .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getAlbumListJson(asArtistAlbumPairs(artists))))
            );

          const q: AlbumQuery = {
            _index: 0,
            _count: 100,
            type: "alphabeticalByArtist",
          };
          const result = await login({ username, password })
            .then((it) => it.albums(q));

          expect(result).toEqual({
            results: albums,
            total: 6,
          });

          expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getAlbumList2' }).href(), {
            params: asURLSearchParams({
              ...authParamsPlusJson,
              type: "alphabeticalByArtist",
              size: 100,
              offset: 0,
            }),
            headers,
          });
        });
      });

      describe("querying for a page of them", () => {
        it("should return the page with the corrent paging information", async () => {
          mockGET
            .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
            .mockImplementationOnce(() =>
              Promise.resolve(
                ok(
                  getAlbumListJson([
                    [artist1, artist1.albums[2]!],
                    [artist2, artist2.albums[0]!],
                    // due to pre-fetch will get next 2 albums also
                    [artist2, artist2.albums[1]!],
                    [artist2, artist2.albums[2]!],
                  ], 6)
                )
              )
            );

          const q: AlbumQuery = {
            _index: 2,
            _count: 2,
            type: "alphabeticalByArtist",
          };
          const result = await login({ username, password })
            .then((it) => it.albums(q));

          expect(result).toEqual({
            results: [artist1.albums[2], artist2.albums[0], artist2.albums[1], artist2.albums[2]],
            total: 6,
          });

          expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getAlbumList2' }).href(), {
            params: asURLSearchParams({
              ...authParamsPlusJson,
              type: "alphabeticalByArtist",
              size: 2,
              offset: 2,
            }),
            headers,
          });
        });
      });
    });

    describe("when the number of albums reported by getArtists does not match that of getAlbums", () => {
      const genre = asGenre("lofi");

      const album1 = anAlbum({ name: "album1", genre });
      const album2 = anAlbum({ name: "album2", genre });
      const album3 = anAlbum({ name: "album3", genre });
      const album4 = anAlbum({ name: "album4", genre });
      const album5 = anAlbum({ name: "album5", genre });

      // the artists have 5 albums in the getArtists endpoint
      const artist1 = anArtist({
        albums: [album1, album2, album3, album4],
      });
      const artist2 = anArtist({
        albums: [album5],
      });

      describe("when the number of albums returned from getAlbums is less the number of albums in the getArtists endpoint", () => {
        describe("when the query comes back on 1 page", () => {
          beforeEach(() => {
            mockGET
              .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
              .mockImplementationOnce(() =>
                Promise.resolve(
                  ok(
                    getAlbumListJson([
                      [artist1, album1],
                      [artist1, album2],
                      [artist1, album3],
                      // album4 is missing from the albums end point for some reason
                      [artist2, album5],
                    ])
                  )
                )
              );
          });

          it("should return the page of albums, updating the total to be accurate", async () => {
            const q: AlbumQuery = {
              _index: 0,
              _count: 100,
              type: "alphabeticalByArtist",
            };
            const result = await login({ username, password })
              .then((it) => it.albums(q));

            expect(result).toEqual({
              results: [album1, album2, album3, album5],
              total: 4,
            });

            expect(axios.get).toHaveBeenCalledWith(
              url.append({ pathname: '/rest/getAlbumList2' }).href(),
              {
                params: asURLSearchParams({
                  ...authParamsPlusJson,
                  type: "alphabeticalByArtist",
                  size: 100,
                  offset: q._index,
                }),
                headers,
              }
            );
          });
        });

        describe("when the query is for the first page", () => {
          beforeEach(() => {
            mockGET
              .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
              .mockImplementationOnce(() =>
                Promise.resolve(
                  ok(
                    getAlbumListJson([
                      [artist1, album1],
                      [artist1, album2],
                    ], 4) // totalCount: 4 (more albums exist but only 2 returned for this page)
                  )
                )
              );
          });

          it("should return the first page of albums", async () => {
            const q: AlbumQuery = {
              _index: 0,
              _count: 2,
              type: "alphabeticalByArtist",
            };
            const result = await login({ username, password })
              .then((it) => it.albums(q));

            expect(result).toEqual({
              results: [album1, album2],
              total: 4,
            });

            expect(axios.get).toHaveBeenCalledWith(
              url.append({ pathname: '/rest/getAlbumList2' }).href(),
              {
                params: asURLSearchParams({
                  ...authParamsPlusJson,
                  type: "alphabeticalByArtist",
                  size: 2,
                  offset: q._index,
                }),
                headers,
              }
            );
          });
        });

        describe("when the query is for the last page only", () => {
          beforeEach(() => {
            mockGET
              .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
              .mockImplementationOnce(() =>
                Promise.resolve(
                  ok(
                    getAlbumListJson([
                      // album1 is on the first page
                      // album2 is on the first page
                      [artist1, album3],
                      // album4 is missing from the albums end point for some reason
                      [artist2, album5],
                    ], 4) // totalCount: 4 (total albums across all pages)
                  )
                )
              );
          });

          it("should return the last page of albums", async () => {
            const q: AlbumQuery = {
              _index: 2,
              _count: 100,
              type: "alphabeticalByArtist",
            };
            const result = await login({ username, password })
              .then((it) => it.albums(q));

            expect(result).toEqual({
              results: [album3, album5],
              total: 4,
            });

            expect(axios.get).toHaveBeenCalledWith(
              url.append({ pathname: '/rest/getAlbumList2' }).href(),
              {
                params: asURLSearchParams({
                  ...authParamsPlusJson,
                  type: "alphabeticalByArtist",
                  size: 100,
                  offset: q._index,
                }),
                headers,
              }
            );
          });
        });
      });

      describe("when the number of albums returned from getAlbums is more than the number of albums in the getArtists endpoint", () => {
        describe("when the query comes back on 1 page", () => {
          beforeEach(() => {
            mockGET
              .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
              .mockImplementationOnce(() =>
                Promise.resolve(
                  ok(
                    getAlbumListJson([[artist1, album1], [artist1, album2], [artist1, album3], [artist1, album4], [artist2, album5]], 5)
                  )
                )
              );
          });

          it("should return the page of albums, updating the total to be accurate", async () => {
            const q: AlbumQuery = {
              _index: 0,
              _count: 100,
              type: "alphabeticalByArtist",
            };
            const result = await login({ username, password })
              .then((it) => it.albums(q));

            expect(result).toEqual({
              results: [album1, album2, album3, album4, album5],
              total: 5,
            });

            expect(axios.get).toHaveBeenCalledWith(
              url.append({ pathname: '/rest/getAlbumList2' }).href(),
              {
                params: asURLSearchParams({
                  ...authParamsPlusJson,
                  type: "alphabeticalByArtist",
                  size: 100,
                  offset: q._index,
                }),
                headers,
              }
            );
          });
        });

        describe("when the query is for the first page", () => {
          beforeEach(() => {
            mockGET
              .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
              .mockImplementationOnce(() =>
                Promise.resolve(
                  ok(
                    getAlbumListJson([[artist1, album1], [artist1, album2]], 5)
                  )
                )
              );
          });

          it("should filter out the pre-fetched albums", async () => {
            const q: AlbumQuery = {
              _index: 0,
              _count: 2,
              type: "alphabeticalByArtist",
            };
            const result = await login({ username, password })
              .then((it) => it.albums(q));

            expect(result).toEqual({
              results: [album1, album2],
              total: 5,
            });

            expect(axios.get).toHaveBeenCalledWith(
              url.append({ pathname: '/rest/getAlbumList2' }).href(),
              {
                params: asURLSearchParams({
                  ...authParamsPlusJson,
                  type: "alphabeticalByArtist",
                  size: 2,
                  offset: q._index,
                }),
                headers,
              }
            );
          });
        });

        describe("when the query is for the last page only", () => {
          beforeEach(() => {
            mockGET
              .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
              .mockImplementationOnce(() =>
                Promise.resolve(
                  ok(
                    getAlbumListJson([[artist1, album3], [artist1, album4], [artist2, album5]], 5)
                  )
                )
              );
          });

          it("should return the last page of albums, updating the total to be accurate", async () => {
            const q: AlbumQuery = {
              _index: 2,
              _count: 100,
              type: "alphabeticalByArtist",
            };
            const result = await login({ username, password })
              .then((it) => it.albums(q));

            expect(result).toEqual({
              results: [album3, album4, album5],
              total: 5,
            });

            expect(axios.get).toHaveBeenCalledWith(
              url.append({ pathname: '/rest/getAlbumList2' }).href(),
              {
                params: asURLSearchParams({
                  ...authParamsPlusJson,
                  type: "alphabeticalByArtist",
                  size: 100,
                  offset: q._index,
                }),
                headers,
              }
            );
          });
        });
      });
    });
  });

  describe("getting an album", () => {
    beforeEach(() => {
      customPlayers.encodingFor.mockReturnValue(O.none);
    });

    describe("when it exists", () => {
      const genre = asGenre("Pop");

      const album = anAlbum({ genre });

      const artist = anArtist({ albums: [album] });

      const tracks = [
        aTrack({ artist, album, genre }),
        aTrack({ artist, album, genre }),
        aTrack({ artist, album, genre }),
        aTrack({ artist, album, genre }),
      ];

      beforeEach(() => {
        mockGET
          .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
          .mockImplementationOnce(() =>
            Promise.resolve(ok(getAlbumJson(artist, album, tracks)))
          );
      });

      it("should return the album", async () => {
        const result = await login({ username, password })
          .then((it) => it.album(album.id));

        expect(result).toEqual(album);

        expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: "/rest/getAlbum" }).href(), {
          params: asURLSearchParams({
            ...authParamsPlusJson,
            id: album.id,
          }),
          headers,
        });
      });
    });
  });
});