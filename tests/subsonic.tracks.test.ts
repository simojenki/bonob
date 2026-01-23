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
  getAlbumJson, getSongJson,
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

  describe("getting tracks", () => {
    describe("a single track", () => {
      const pop = asGenre("Pop");

      const album = anAlbum({ id: "album1", name: "Burnin", genre: pop });

      const artist = anArtist({
        id: "artist1",
        name: "Bob Marley",
        albums: [album],
      });

      describe("when there are no custom players", () => {
        beforeEach(() => {
          customPlayers.encodingFor.mockReturnValue(O.none);
        });

        describe("that is starred", () => {
          it("should return the track", async () => {
            const track = aTrack({
              artist: artistToArtistSummary(artist),
              album: albumToAlbumSummary(album),
              genre: pop,
              coverArt: album.coverArt,
              rating: {
                love: true,
                stars: 4,
              },
            });

            mockGET
              .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
              .mockImplementationOnce(() =>
                Promise.resolve(ok(getSongJson(track)))
              );

            const result = await login({ username, password })
              .then((it) => it.track(track.id));

            expect(result).toEqual({
              ...track,
              rating: { love: true, stars: 4 },
            });

            expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getSong' }).href(), {
              params: asURLSearchParams({
                ...authParamsPlusJson,
                id: track.id,
              }),
              headers,
            });
          });
        });

        describe("that is not starred", () => {
          it("should return the track", async () => {
            const track = aTrack({
              artist: artistToArtistSummary(artist),
              album: albumToAlbumSummary(album),
              genre: pop,
              coverArt: album.coverArt,
              rating: {
                love: false,
                stars: 0,
              },
            });

            mockGET
              .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
              .mockImplementationOnce(() =>
                Promise.resolve(ok(getSongJson(track)))
              );

            const result = await login({ username, password })
              .then((it) => it.track(track.id));

            expect(result).toEqual({
              ...track,
              rating: { love: false, stars: 0 },
            });

            expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getSong' }).href(), {
              params: asURLSearchParams({
                ...authParamsPlusJson,
                id: track.id,
              }),
              headers,
            });
          });
        });
      });
    });

    describe("for an album", () => {
      describe("when there are no custom players", () => {
        beforeEach(() => {
          customPlayers.encodingFor.mockReturnValue(O.none);
        });

        describe("when the album has multiple tracks, some of which are rated", () => {
          const hipHop = asGenre("Hip-Hop");
  
          const album = anAlbum({ id: "album1", name: "Burnin", genre: hipHop });
  
          const artist = anArtist({
            id: "artist1",
            name: "Bob Marley",
            albums: [album],
          });
  
          const track1 = aTrack({
            artist: artistToArtistSummary(artist),
            album: albumToAlbumSummary(album),
            genre: hipHop,
            rating: {
              love: true,
              stars: 3,
            },
          });
          const track2 = aTrack({
            artist: artistToArtistSummary(artist),
            album: albumToAlbumSummary(album),
            genre: hipHop,
            rating: {
              love: false,
              stars: 0,
            },
          });
          const track3 = aTrack({
            artist: artistToArtistSummary(artist),
            album: albumToAlbumSummary(album),
            genre: hipHop,
            rating: {
              love: true,
              stars: 5,
            },
          });
          const track4 = aTrack({
            artist: artistToArtistSummary(artist),
            album: albumToAlbumSummary(album),
            genre: hipHop,
            rating: {
              love: false,
              stars: 1,
            },
          });
  
          const tracks = [track1, track2, track3, track4];
  
          beforeEach(() => {
            mockGET
              .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
              .mockImplementationOnce(() =>
                Promise.resolve(ok(getAlbumJson(artist, album, tracks)))
              );
          });
  
          it("should return the album", async () => {
            const result = await login({ username, password })
              .then((it) => it.tracks(album.id));
  
            expect(result).toEqual([track1, track2, track3, track4]);
  
            expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: "/rest/getAlbum" }).href(), {
              params: asURLSearchParams({
                ...authParamsPlusJson,
                id: album.id,
              }),
              headers,
            });
          });
        });
  
        describe("when the album has only 1 track", () => {
          const flipFlop = asGenre("Flip-Flop");
  
          const album = anAlbum({
            id: "album1",
            name: "Burnin",
            genre: flipFlop,
          });
  
          const artist = anArtist({
            id: "artist1",
            name: "Bob Marley",
            albums: [album],
          });
  
          const track = aTrack({
            artist: artistToArtistSummary(artist),
            album: albumToAlbumSummary(album),
            genre: flipFlop,
          });
  
          const tracks = [track];
  
          beforeEach(() => {
            mockGET
              .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
              .mockImplementationOnce(() =>
                Promise.resolve(ok(getAlbumJson(artist, album, tracks)))
              );
          });
  
          it("should return the album", async () => {
            const result = await login({ username, password })
              .then((it) => it.tracks(album.id));
  
            expect(result).toEqual([track]);
  
            expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: "/rest/getAlbum" }).href(), {
              params: asURLSearchParams({
                ...authParamsPlusJson,
                id: album.id,
              }),
              headers,
            });
          });
        });
  
        describe("when the album has only no tracks", () => {
          const album = anAlbum({ id: "album1", name: "Burnin" });
  
          const artist = anArtist({
            id: "artist1",
            name: "Bob Marley",
            albums: [album],
          });
  
          const tracks: any[] = [];
  
          beforeEach(() => {
            mockGET
              .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
              .mockImplementationOnce(() =>
                Promise.resolve(ok(getAlbumJson(artist, album, tracks)))
              );
          });
  
          it("should empty array", async () => {
            const result = await login({ username, password })
              .then((it) => it.tracks(album.id));
  
            expect(result).toEqual([]);
  
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

      describe("when a custom player is configured for the mime type", () => {
        const hipHop = asGenre("Hip-Hop");
  
        const album = anAlbum({ id: "album1", name: "Burnin", genre: hipHop });
  
        const artist = anArtist({
          id: "artist1",
          name: "Bob Marley",
          albums: [album],
        });
  
        const alac = aTrack({
          artist: artistToArtistSummary(artist),
          album: albumToAlbumSummary(album),
          encoding: {
            player: "bonob",
            mimeType: "audio/alac"
          },
          genre: hipHop,
          rating: {
            love: true,
            stars: 3,
          },
        });
        const m4a = aTrack({
          artist: artistToArtistSummary(artist),
          album: albumToAlbumSummary(album),
          encoding: {
            player: "bonob",
            mimeType: "audio/m4a"
          },
          genre: hipHop,
          rating: {
            love: false,
            stars: 0,
          },
        });
        const mp3 = aTrack({
          artist: artistToArtistSummary(artist),
          album: albumToAlbumSummary(album),
          encoding: {
            player: "bonob",
            mimeType: "audio/mp3"
          },
          genre: hipHop,
          rating: {
            love: true,
            stars: 5,
          },
        });
  
        beforeEach(() => {
          customPlayers.encodingFor
            .mockReturnValueOnce(O.of({ player: "bonob+audio/alac", mimeType: "audio/flac" }))
            .mockReturnValueOnce(O.of({ player: "bonob+audio/m4a", mimeType: "audio/opus" }))
            .mockReturnValueOnce(O.none)
          
          mockGET
            .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getAlbumJson(artist, album, [alac, m4a, mp3])))
            );
        });
  
        it("should return the album with custom players applied", async () => {
          const result = await login({ username, password })
            .then((it) => it.tracks(album.id));
  
          expect(result).toEqual([
            {
              ...alac,
              encoding: { 
                player: "bonob+audio/alac", 
                mimeType: "audio/flac" 
              }
            },
            {
              ...m4a,
              encoding: { 
                player: "bonob+audio/m4a", 
                mimeType: "audio/opus" 
              }
            },
            {
              ...mp3,
              encoding: {
                player: "bonob",
                mimeType: "audio/mp3"
              }
            },
          ]);
  
          expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: "/rest/getAlbum" }).href(), {
            params: asURLSearchParams({
              ...authParamsPlusJson,
              id: album.id,
            }),
            headers,
          });
  
          expect(customPlayers.encodingFor).toHaveBeenCalledTimes(3);
          expect(customPlayers.encodingFor).toHaveBeenNthCalledWith(1, { mimeType: "audio/alac" })
          expect(customPlayers.encodingFor).toHaveBeenNthCalledWith(2, { mimeType: "audio/m4a" })
          expect(customPlayers.encodingFor).toHaveBeenNthCalledWith(3, { mimeType: "audio/mp3" })
        });
      });      
    });
  });
});