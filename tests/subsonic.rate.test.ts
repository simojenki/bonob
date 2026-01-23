import { v4 as uuid } from "uuid";
import { pipe } from "fp-ts/lib/function";
import { option as O, taskEither as TE, task as T } from "fp-ts";

import {
  Subsonic,
  t,
  asURLSearchParams,
  CustomPlayers,
} from "../src/subsonic";

import axios from "axios";
jest.mock("axios");

import randomstring from "randomstring";
jest.mock("randomstring");

import {
  albumToAlbumSummary,
  Credentials,
  Rating,
} from "../src/music_service";
import {
  anAlbum,
  anArtist,
  aTrack,
  POP,
} from "./builders";
import { URLBuilder } from "../src/url_builder";

import {
  ok,
  getSongJson,
  getAlbumJson,
  EMPTY,
  FAILURE,
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

  describe("rate", () => {
    const trackId = uuid();

    const rate = (trackId: string, rating: Rating) =>
      login({ username, password })
        .then((it) => it.rate(trackId, rating));

    const artist = anArtist();
    const album = anAlbum({ id: "album1", name: "Burnin", genre: POP });

    beforeEach(() => {
      customPlayers.encodingFor.mockReturnValue(O.none);
    });

    describe("rating a track", () => {
      describe("loving a track that isnt already loved", () => {
        it("should mark the track as loved", async () => {
          const track = aTrack({
            id: trackId,
            artist,
            album: albumToAlbumSummary(album),
            rating: { love: false, stars: 0 },
          });

          mockGET
            .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getSongJson(track)))
            )
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getAlbumJson(artist, album, [])))
            )
            .mockImplementationOnce(() => Promise.resolve(ok(EMPTY)));

          const result = await rate(trackId, { love: true, stars: 0 });

          expect(result).toEqual(true);

          expect(mockGET).toHaveBeenCalledWith(url.append({ pathname: '/rest/star' }).href(), {
            params: asURLSearchParams({
              ...authParamsPlusJson,
              id: trackId,
            }),
            headers,
          });
        });
      });

      describe("unloving a track that is loved", () => {
        it("should mark the track as loved", async () => {
          const track = aTrack({
            id: trackId,
            artist,
            album: albumToAlbumSummary(album),
            rating: { love: true, stars: 0 },
          });

          mockGET
            .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getSongJson(track)))
            )
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getAlbumJson(artist, album, [])))
            )
            .mockImplementationOnce(() => Promise.resolve(ok(EMPTY)));

          const result = await rate(trackId, { love: false, stars: 0 });

          expect(result).toEqual(true);

          expect(mockGET).toHaveBeenCalledWith(url.append({ pathname: '/rest/unstar' }).href(), {
            params: asURLSearchParams({
              ...authParamsPlusJson,
              id: trackId,
            }),
            headers,
          });
        });
      });

      describe("loving a track that is already loved", () => {
        it("shouldn't do anything", async () => {
          const track = aTrack({
            id: trackId,
            artist,
            album: albumToAlbumSummary(album),
            rating: { love: true, stars: 0 },
          });

          mockGET
            .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getSongJson(track)))
            );

          const result = await rate(trackId, { love: true, stars: 0 });

          expect(result).toEqual(true);

          expect(mockGET).toHaveBeenCalledTimes(2);
        });
      });

      describe("rating a track with a different rating", () => {
        it("should add the new rating", async () => {
          const track = aTrack({
            id: trackId,
            artist,
            album: albumToAlbumSummary(album),
            rating: { love: false, stars: 0 },
          });

          mockGET
            .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getSongJson(track)))
            )
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getAlbumJson(artist, album, [])))
            )
            .mockImplementationOnce(() => Promise.resolve(ok(EMPTY)));

          const result = await rate(trackId, { love: false, stars: 3 });

          expect(result).toEqual(true);

          expect(mockGET).toHaveBeenCalledWith(url.append({ pathname: '/rest/setRating' }).href(), {
            params: asURLSearchParams({
              ...authParamsPlusJson,
              id: trackId,
              rating: 3,
            }),
            headers,
          });
        });
      });

      describe("rating a track with the same rating it already has", () => {
        it("shouldn't do anything", async () => {
          const track = aTrack({
            id: trackId,
            artist,
            album: albumToAlbumSummary(album),
            rating: { love: true, stars: 3 },
          });

          mockGET
            .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getSongJson(track)))
            );

          const result = await rate(trackId, { love: true, stars: 3 });

          expect(result).toEqual(true);

          expect(mockGET).toHaveBeenCalledTimes(2);
        });
      });

      describe("loving and rating a track", () => {
        it("should return true", async () => {
          const track = aTrack({
            id: trackId,
            artist,
            album: albumToAlbumSummary(album),
            rating: { love: true, stars: 3 },
          });

          mockGET
            .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getSongJson(track)))
            )
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getAlbumJson(artist, album, [])))
            )
            .mockImplementationOnce(() => Promise.resolve(ok(EMPTY)))
            .mockImplementationOnce(() => Promise.resolve(ok(EMPTY)));

          const result = await rate(trackId, { love: false, stars: 5 });

          expect(result).toEqual(true);

          expect(mockGET).toHaveBeenCalledWith(url.append({ pathname: '/rest/unstar' }).href(), {
            params: asURLSearchParams({
              ...authParamsPlusJson,
              id: trackId,
            }),
            headers,
          });
          expect(mockGET).toHaveBeenCalledWith(url.append({ pathname: '/rest/setRating' }).href(), {
            params: asURLSearchParams({
              ...authParamsPlusJson,
              id: trackId,
              rating: 5,
            }),
            headers,
          });
        });
      });

      describe("invalid star values", () => {
        describe("stars of -1", () => {
          it("should return false", async () => {
            mockGET.mockImplementationOnce(() => Promise.resolve(ok(PING_OK)));

            const result = await rate(trackId, { love: true, stars: -1 });
            expect(result).toEqual(false);
          });
        });

        describe("stars of 6", () => {
          it("should return false", async () => {
            mockGET.mockImplementationOnce(() => Promise.resolve(ok(PING_OK)));

            const result = await rate(trackId, { love: true, stars: -1 });
            expect(result).toEqual(false);
          });
        });
      });

      describe("when fails", () => {
        it("should return false", async () => {
          mockGET
            .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
            .mockImplementationOnce(() => Promise.resolve(ok(FAILURE)))
            .mockImplementationOnce(() => Promise.resolve(ok(EMPTY)));

          const result = await rate(trackId, { love: true, stars: 0 });

          expect(result).toEqual(false);
        });
      });
    });
  });
});
