import { v4 as uuid } from "uuid";
import { pipe } from "fp-ts/lib/function";
import { taskEither as TE, task as T } from "fp-ts";

import {
  Subsonic,
  t,
  asGenre,
  asURLSearchParams,
  CustomPlayers,
  DODGY_IMAGE_NAME,
} from "../src/subsonic";

import axios from "axios";
jest.mock("axios");

import randomstring from "randomstring";
jest.mock("randomstring");

import {
  Credentials,
  Album,
  Artist,
} from "../src/music_service";
import {
  anAlbum,
  anArtist,
  aSimilarArtist,
} from "./builders";
import { URLBuilder } from "../src/url_builder";

import {
  ok,
  PING_OK,
  getArtistJson,
  getArtistInfoJson,
  asArtistsJson,
  
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

  describe("getting an artist", () => {
    describe("when the artist exists", () => {
      describe("and has many similar artists", () => {
        const album1: Album = anAlbum({ genre: asGenre("Pop") });

        const album2: Album = anAlbum({ genre: asGenre("Pop") });

        const artist: Artist = anArtist({
          albums: [album1, album2],
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
            .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getArtistJson(artist)))
            )
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getArtistInfoJson(artist)))
            );
        });

        it("should return the similar artists", async () => {
          const result: Artist = await login({ username, password })
            .then((it) => it.artist(artist.id!));

          expect(result).toEqual({
            id: `${artist.id}`,
            name: artist.name,
            image: { system:"subsonic", resource:`art:${artist.id}` },
            albums: artist.albums,
            similarArtists: artist.similarArtists,
          });

          expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getArtist' }).href(), {
            params: asURLSearchParams({
              ...authParamsPlusJson,
              id: artist.id,
            }),
            headers,
          });

          expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getArtistInfo2' }).href(), {
            params: asURLSearchParams({
              ...authParamsPlusJson,
              id: artist.id,
              count: 50,
              includeNotPresent: true,
            }),
            headers,
          });
        });
      });

      describe("and has one similar artist", () => {
        const album1: Album = anAlbum({ genre: asGenre("G1") });

        const album2: Album = anAlbum({ genre: asGenre("G2") });

        const artist: Artist = anArtist({
          albums: [album1, album2],
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
            .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getArtistJson(artist)))
            )
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getArtistInfoJson(artist)))
            );
        });

        it("should return the similar artists", async () => {
          const result: Artist = await login({ username, password })
            .then((it) => it.artist(artist.id!));

          expect(result).toEqual({
            id: artist.id,
            name: artist.name,
            image: { system:"subsonic", resource:`art:${artist.id}` },
            albums: artist.albums,
            similarArtists: artist.similarArtists,
          });

          expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getArtist' }).href(), {
            params: asURLSearchParams({
              ...authParamsPlusJson,
              id: artist.id,
            }),
            headers,
          });

          expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getArtistInfo2' }).href(), {
            params: asURLSearchParams({
              ...authParamsPlusJson,
              id: artist.id,
              count: 50,
              includeNotPresent: true,
            }),
            headers,
          });
        });
      });

      describe("and has no similar artists", () => {
        const album1: Album = anAlbum({ genre: asGenre("Jock") });

        const album2: Album = anAlbum({ genre: asGenre("Mock") });

        const artist: Artist = anArtist({
          albums: [album1, album2],
          similarArtists: [],
        });

        beforeEach(() => {
          mockGET
            .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getArtistJson(artist)))
            )
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getArtistInfoJson(artist)))
            );
        });

        it("should return the similar artists", async () => {
          const result: Artist = await login({ username, password })
            .then((it) => it.artist(artist.id!));

          expect(result).toEqual({
            id: artist.id,
            name: artist.name,
            image: { system:"subsonic", resource: `art:${artist.id}` },
            albums: artist.albums,
            similarArtists: artist.similarArtists,
          });

          expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getArtist' }).href(), {
            params: asURLSearchParams({
              ...authParamsPlusJson,
              id: artist.id,
            }),
            headers,
          });

          expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getArtistInfo2' }).href(), {
            params: asURLSearchParams({
              ...authParamsPlusJson,
              id: artist.id,
              count: 50,
              includeNotPresent: true,
            }),
            headers,
          });
        });
      });

      describe("and has dodgy looking artist image uris", () => {
        const artist: Artist = anArtist({
          albums: [],
          similarArtists: [],
        });

        const dodgyImageUrl = `http://localhost:1234/${DODGY_IMAGE_NAME}`;

        beforeEach(() => {
          mockGET
            .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getArtistJson(artist, { artistImageUrl: dodgyImageUrl })))
            )
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getArtistInfoJson(artist, { smallImageUrl: dodgyImageUrl, mediumImageUrl: dodgyImageUrl, largeImageUrl: dodgyImageUrl})))
            );
        });

        it("should return remove the dodgy looking image uris and return urn for artist:id", async () => {
          const result: Artist = await login({ username, password })
            .then((it) => it.artist(artist.id!));

          expect(result).toEqual({
            id: artist.id,
            name: artist.name,
            image: {
              system: "subsonic",
              resource: `art:${artist.id}`,
            },
            albums: artist.albums,
            similarArtists: [],
          });

          expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getArtist' }).href(), {
            params: asURLSearchParams({
              ...authParamsPlusJson,
              id: artist.id,
            }),
            headers,
          });

          expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getArtistInfo2' }).href(), {
            params: asURLSearchParams({
              ...authParamsPlusJson,
              id: artist.id,
              count: 50,
              includeNotPresent: true,
            }),
            headers,
          });
        });
      });

      describe("and has a good external image uri from getArtist route", () => {
        const artist: Artist = anArtist({
          albums: [],
          similarArtists: [],
        });

        const dodgyImageUrl = `http://localhost:1234/${DODGY_IMAGE_NAME}`;

        beforeEach(() => {
          mockGET
            .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getArtistJson(artist, { artistImageUrl: 'http://example.com:1234/good/looking/image.png' })))
            )
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getArtistInfoJson(artist, { smallImageUrl: dodgyImageUrl, mediumImageUrl: dodgyImageUrl, largeImageUrl: dodgyImageUrl })))
            );
        });

        it("should use the external url", async () => {
          const result: Artist = await login({ username, password })
            .then((it) => it.artist(artist.id!));

          expect(result).toEqual({
            id: artist.id,
            name: artist.name,
            image: { system: "external", resource: 'http://example.com:1234/good/looking/image.png' },
            albums: artist.albums,
            similarArtists: [],
          });

          expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getArtist' }).href(), {
            params: asURLSearchParams({
              ...authParamsPlusJson,
              id: artist.id,
            }),
            headers,
          });

          expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getArtistInfo2' }).href(), {
            params: asURLSearchParams({
              ...authParamsPlusJson,
              id: artist.id,
              count: 50,
              includeNotPresent: true,
            }),
            headers,
          });
        });
      });      

      describe("and has a good large external image uri from getArtistInfo route", () => {
        const artist: Artist = anArtist({
          albums: [],
          similarArtists: [],
        });

        const dodgyImageUrl = `http://localhost:1234/${DODGY_IMAGE_NAME}`;

        beforeEach(() => {
          mockGET
            .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getArtistJson(artist, { artistImageUrl: dodgyImageUrl })))
            )
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getArtistInfoJson(artist, { smallImageUrl: dodgyImageUrl, mediumImageUrl: dodgyImageUrl, largeImageUrl: 'http://example.com:1234/good/large/image.png' })))
            );
        });

        it("should use the external url", async () => {
          const result: Artist = await login({ username, password })
            .then((it) => it.artist(artist.id!));

          expect(result).toEqual({
            id: artist.id,
            name: artist.name,
            image: { system: "external", resource: 'http://example.com:1234/good/large/image.png' },
            albums: artist.albums,
            similarArtists: [],
          });

          expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getArtist' }).href(), {
            params: asURLSearchParams({
              ...authParamsPlusJson,
              id: artist.id,
            }),
            headers,
          });

          expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getArtistInfo2' }).href(), {
            params: asURLSearchParams({
              ...authParamsPlusJson,
              id: artist.id,
              count: 50,
              includeNotPresent: true,
            }),
            headers,
          });
        });
      });   
      

      describe("and has a good medium external image uri from getArtistInfo route", () => {
        const artist: Artist = anArtist({
          albums: [],
          similarArtists: [],
        });

        const dodgyImageUrl = `http://localhost:1234/${DODGY_IMAGE_NAME}`;

        beforeEach(() => {
          mockGET
            .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getArtistJson(artist, { artistImageUrl: dodgyImageUrl })))
            )
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getArtistInfoJson(artist, { smallImageUrl: dodgyImageUrl, mediumImageUrl: 'http://example.com:1234/good/medium/image.png', largeImageUrl: dodgyImageUrl })))
            );
        });

        it("should use the external url", async () => {
          const result: Artist = await login({ username, password })
            .then((it) => it.artist(artist.id!));

          expect(result).toEqual({
            id: artist.id,
            name: artist.name,
            image: { system:"external", resource: 'http://example.com:1234/good/medium/image.png' },
            albums: artist.albums,
            similarArtists: [],
          });

          expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getArtist' }).href(), {
            params: asURLSearchParams({
              ...authParamsPlusJson,
              id: artist.id,
            }),
            headers,
          });

          expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getArtistInfo2' }).href(), {
            params: asURLSearchParams({
              ...authParamsPlusJson,
              id: artist.id,
              count: 50,
              includeNotPresent: true,
            }),
            headers,
          });
        });
      });       

      describe("and has multiple albums", () => {
        const album1: Album = anAlbum({ genre: asGenre("Pop") });

        const album2: Album = anAlbum({ genre: asGenre("Flop") });

        const artist: Artist = anArtist({
          albums: [album1, album2],
          similarArtists: [],
        });

        beforeEach(() => {
          mockGET
            .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getArtistJson(artist)))
            )
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getArtistInfoJson(artist)))
            );
        });

        it("should return it", async () => {
          const result: Artist = await login({ username, password })
            .then((it) => it.artist(artist.id!));

          expect(result).toEqual({
            id: artist.id,
            name: artist.name,
            image: artist.image,
            albums: artist.albums,
            similarArtists: [],
          });

          expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getArtist' }).href(), {
            params: asURLSearchParams({
              ...authParamsPlusJson,
              id: artist.id,
            }),
            headers,
          });

          expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getArtistInfo2' }).href(), {
            params: asURLSearchParams({
              ...authParamsPlusJson,
              id: artist.id,
              count: 50,
              includeNotPresent: true,
            }),
            headers,
          });
        });
      });

      describe("and has only 1 album", () => {
        const album: Album = anAlbum({ genre: asGenre("Pop") });

        const artist: Artist = anArtist({
          albums: [album],
          similarArtists: [],
        });

        beforeEach(() => {
          mockGET
            .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getArtistJson(artist)))
            )
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getArtistInfoJson(artist)))
            );
        });

        it("should return it", async () => {
          const result: Artist = await login({ username, password })
            .then((it) => it.artist(artist.id!));

          expect(result).toEqual({
            id: artist.id,
            name: artist.name,
            image: artist.image,
            albums: artist.albums,
            similarArtists: [],
          });

          expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getArtist' }).href(), {
            params: asURLSearchParams({
              ...authParamsPlusJson,
              id: artist.id,
            }),
            headers,
          });

          expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getArtistInfo2' }).href(), {
            params: asURLSearchParams({
              ...authParamsPlusJson,
              id: artist.id,
              count: 50,
              includeNotPresent: true,
            }),
            headers,
          });
        });
      });

      describe("and has no albums", () => {
        const artist: Artist = anArtist({
          albums: [],
          similarArtists: [],
        });

        beforeEach(() => {
          mockGET
            .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getArtistJson(artist)))
            )
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getArtistInfoJson(artist)))
            );
        });

        it("should return it", async () => {
          const result: Artist = await login({ username, password })
            .then((it) => it.artist(artist.id!));

          expect(result).toEqual({
            id: artist.id,
            name: artist.name,
            image: artist.image,
            albums: [],
            similarArtists: [],
          });

          expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getArtist' }).href(), {
            params: asURLSearchParams({
              ...authParamsPlusJson,
              id: artist.id,
            }),
            headers,
          });

          expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getArtistInfo2' }).href(), {
            params: asURLSearchParams({
              ...authParamsPlusJson,
              id: artist.id,
              count: 50,
              includeNotPresent: true,
            }),
            headers,
          });
        });
      });
    });
  });

  describe("getting artists", () => {
    describe("when there are indexes, but no artists", () => {
      beforeEach(() => {
        mockGET
          .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
          .mockImplementationOnce(() =>
            Promise.resolve(
              ok(
                asArtistsJson([], 0)
              )
            )
          );
      });

      it("should return empty", async () => {
        const artists = await login({ username, password })
          .then((it) => it.artists({ _index: 0, _count: 100 }));

        expect(artists).toEqual({
          results: [],
          total: 0,
        });
      });
    });

    describe("when there no indexes and no artists", () => {
      beforeEach(() => {
        mockGET
          .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
          .mockImplementationOnce(() =>
            Promise.resolve(
              ok(
                asArtistsJson([], 0)
              )
            )
          );
      });

      it("should return empty", async () => {
        const artists = await login({ username, password })
          .then((it) => it.artists({ _index: 0, _count: 100 }));

        expect(artists).toEqual({
          results: [],
          total: 0,
        });
      });
    });

    describe("when there is one index and one artist", () => {
      const artist1 = anArtist({albums:[anAlbum(), anAlbum(), anAlbum(), anAlbum()]});

      const artistListJson = asArtistsJson([artist1], 1);

      describe("when it all fits on one page", () => {
        beforeEach(() => {
          mockGET
            .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
            .mockImplementationOnce(() => Promise.resolve(ok(artistListJson)));
        });

        it("should return the single artist", async () => {
          const artists = await login({ username, password })
            .then((it) => it.artists({ _index: 0, _count: 100 }));

          const expectedResults = [{
            id: artist1.id,
            name: artist1.name,
            albumCount: 4,
            image: { system: "subsonic", resource: "art:" + artist1.id }
          }];

          expect(artists).toEqual({
            results: expectedResults,
            total: 1,
          });

          expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: "/rest/getArtistList" }).href(), {
            params: asURLSearchParams({ ...authParamsPlusJson, type: "alphabeticalByName", size: 100, offset: 0 }),
            headers,
          });
        });
      });
    });

    describe("when there are artists", () => {
      const artist1 = anArtist({ name: "A Artist", albums:[anAlbum()] });
      const artist2 = anArtist({ name: "B Artist" });
      const artist3 = anArtist({ name: "C Artist" });
      const artist4 = anArtist({ name: "D Artist" });
      const artists = [artist1, artist2, artist3, artist4];

      describe("when no paging is in effect", () => {
        beforeEach(() => {
          mockGET
            .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
            .mockImplementationOnce(() =>
              Promise.resolve(ok(asArtistsJson(artists)))
            );
        });

        it("should return all the artists", async () => {
          const artists = await login({ username, password })
            .then((it) => it.artists({ _index: 0, _count: 100 }));

          const expectedResults = [artist1, artist2, artist3, artist4].map(
            (it) => ({
              id: it.id,
              name: it.name,
              albumCount: it.albums.length,
              image: it.image,
            })
          );

          expect(artists).toEqual({
            results: expectedResults,
            total: 4,
          });

          expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: "/rest/getArtistList" }).href(), {
            params: asURLSearchParams({ ...authParamsPlusJson, type: "alphabeticalByName", size: 100, offset: 0 }),
            headers,
          });
        });
      });

      describe("when paging specified", () => {
        beforeEach(() => {
          mockGET
            .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
            .mockImplementationOnce(() =>
              Promise.resolve(ok(asArtistsJson([artist2, artist3], 4)))
            );
        });

        it("should return only the correct page of artists", async () => {
          const artists = await login({ username, password })
            .then((it) => it.artists({ _index: 1, _count: 2 }));

          const expectedResults = [artist2, artist3].map((it) => ({
            id: it.id,
            name: it.name,
            albumCount: it.albums.length,
            image: it.image,
          }));

          expect(artists).toEqual({ results: expectedResults, total: 4 });

          expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: "/rest/getArtistList" }).href(), {
            params: asURLSearchParams({ ...authParamsPlusJson, type: "alphabeticalByName", size: 2, offset: 1 }),
            headers,
          });
        });
      });
    });
  });

});
