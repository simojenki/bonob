import { v4 as uuid } from "uuid";
import { pipe } from "fp-ts/lib/function";
import { option as O, taskEither as TE, task as T } from "fp-ts";

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
  artistToArtistSummary,
  Credentials,
} from "../src/music_service";
import {
  anAlbum,
  anArtist,
  aTrack,
} from "./builders";
import { URLBuilder } from "../src/url_builder";

import {
  ok,
  getSimilarSongsJson,
  error,
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

  const headers = {
    "User-Agent": "bonob",
  };

  const tokenFor = (credentials: Credentials) => pipe(
    subsonic.generateToken(credentials),
    TE.fold(e => { throw e }, T.of)
  )

  const login = (credentials: Credentials) => tokenFor(credentials)().then((it) => subsonic.login(it.serviceToken))

  describe("similarSongs", () => {
    beforeEach(() => {
      customPlayers.encodingFor.mockReturnValue(O.none);
    });

    describe("when there is one similar songs", () => {
      it("should return it", async () => {
        const id = "idWithTracks";
        const pop = asGenre("Pop");

        const album1 = anAlbum({ id: "album1", name: "Burnin", genre: pop });
        const artist1 = anArtist({
          id: "artist1",
          name: "Bob Marley",
          albums: [album1],
        });

        const track1 = aTrack({
          id: "track1",
          artist: artistToArtistSummary(artist1),
          album: albumToAlbumSummary(album1),
          genre: pop,
          coverArt: album1.coverArt,
        });

        mockGET
          .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
          .mockImplementationOnce(() =>
            Promise.resolve(ok(getSimilarSongsJson([track1])))
          );

          const result = await login({ username, password })
            .then((it) => it.similarSongs(id));

        expect(result).toEqual([track1]);

        expect(mockGET).toHaveBeenCalledWith(url.append({ pathname: '/rest/getSimilarSongs2' }).href(), {
          params: asURLSearchParams({
            ...authParams,
            f: "json",
            id,
            count: 50,
          }),
          headers,
        });
      });
    });

    describe("when there are similar songs", () => {
      it("should return them", async () => {
        const id = "idWithTracks";
        const pop = asGenre("Pop");

        const album1 = anAlbum({ id: "album1", name: "Burnin", genre: pop });
        const artist1 = anArtist({
          id: "artist1",
          name: "Bob Marley",
          albums: [album1],
        });

        const album2 = anAlbum({ id: "album2", name: "Walking", genre: pop });
        const artist2 = anArtist({
          id: "artist2",
          name: "Bob Jane",
          albums: [album2],
        });

        const track1 = aTrack({
          id: "track1",
          artist: artistToArtistSummary(artist1),
          album: albumToAlbumSummary(album1),
          genre: pop,
          coverArt: album1.coverArt,
        });
        const track2 = aTrack({
          id: "track2",
          artist: artistToArtistSummary(artist2),
          album: albumToAlbumSummary(album2),
          genre: pop,
          coverArt: album2.coverArt,
        });
        const track3 = aTrack({
          id: "track3",
          artist: artistToArtistSummary(artist1),
          album: albumToAlbumSummary(album1),
          genre: pop,
          coverArt: album1.coverArt,
        });

        mockGET
          .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
          .mockImplementationOnce(() =>
            Promise.resolve(ok(getSimilarSongsJson([track1, track2, track3])))
          );

          const result = await login({ username, password })
          .then((it) => it.similarSongs(id));

        expect(result).toEqual([track1, track2, track3]);

        expect(mockGET).toHaveBeenCalledWith(url.append({ pathname: '/rest/getSimilarSongs2' }).href(), {
          params: asURLSearchParams({
            ...authParams,
            f: "json",
            id,
            count: 50,
          }),
          headers,
        });
      });
    });

    describe("when there are no similar songs", () => {
      it("should return []", async () => {
        const id = "idWithNoTracks";

        mockGET
          .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
          .mockImplementationOnce(() =>
            Promise.resolve(ok(getSimilarSongsJson([])))
          );

          const result = await login({ username, password })
          .then((it) => it.similarSongs(id));

        expect(result).toEqual([]);

        expect(mockGET).toHaveBeenCalledWith(url.append({ pathname: '/rest/getSimilarSongs2' }).href(), {
          params: asURLSearchParams({
            ...authParams,
            f: "json",
            id,
            count: 50,
          }),
          headers,
        });
      });
    });

    describe("when the id doesnt exist", () => {
      it("should fail", async () => {
        const id = "idThatHasAnError";

        mockGET
          .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
          .mockImplementationOnce(() =>
            Promise.resolve(ok(error("70", "data not found")))
          );

        return expect(
          login({ username, password })
            .then((it) => it.similarSongs(id))
        ).rejects.toEqual("Subsonic error:data not found");
      });
    });
  });
});
