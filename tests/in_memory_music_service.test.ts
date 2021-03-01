import {
  InMemoryMusicService,
} from "./in_memory_music_service";
import { AuthSuccess, MusicLibrary } from "../src/music_service";
import { v4 as uuid } from "uuid";
import { BOB_MARLEY, MADONNA, BLONDIE } from './builders'

describe("InMemoryMusicService", () => {
  const service = new InMemoryMusicService();

  describe("generateToken", () => {
    it("should be able to generate a token and then use it to log in", () => {
      const credentials = { username: "bob", password: "smith" };

      service.hasUser(credentials);

      const token = service.generateToken(credentials) as AuthSuccess;

      expect(token.userId).toEqual(credentials.username);
      expect(token.nickname).toEqual(credentials.username);

      const musicLibrary = service.login(token.authToken);

      expect(musicLibrary).toBeDefined();
    });

    it("should fail with an exception if an invalid token is used", () => {
      const credentials = { username: "bob", password: "smith" };

      service.hasUser(credentials);

      const token = service.generateToken(credentials) as AuthSuccess;

      service.clear();

      expect(service.login(token.authToken)).toEqual({
        message: "Invalid auth token",
      });
    });
  });

  describe("Music Library", () => {
  

    const user = { username: "user100", password: "password100" };
    let musicLibrary: MusicLibrary;

    beforeEach(() => {
      service.clear();

      service.hasArtists(BOB_MARLEY, MADONNA, BLONDIE);
      service.hasUser(user);

      const token = service.generateToken(user) as AuthSuccess;
      musicLibrary = service.login(token.authToken) as MusicLibrary;
    });

    describe("artists", () => {
      it("should provide an array of artists", () => {
        expect(musicLibrary.artists()).toEqual([
          { id: BOB_MARLEY.id, name: BOB_MARLEY.name },
          { id: MADONNA.id, name: MADONNA.name },
          { id: BLONDIE.id, name: BLONDIE.name },
        ]);
      });
    });

    describe("artist", () => {
      describe("when it exists", () => {
        it("should provide an artist", () => {
          expect(musicLibrary.artist(MADONNA.id)).toEqual({
            id: MADONNA.id,
            name: MADONNA.name,
          });
          expect(musicLibrary.artist(BLONDIE.id)).toEqual({
            id: BLONDIE.id,
            name: BLONDIE.name,
          });
        });
      });

      describe("when it doesnt exist", () => {
        it("should provide an artist", () => {
          expect(() => musicLibrary.artist("-1")).toThrow(
            "No artist with id '-1'"
          );
        });
      });
    });

    describe("albums", () => {
      describe("fetching with no filtering", () => {
        it("should return all the albums for all the artists", () => {
          expect(musicLibrary.albums({})).toEqual([
            ...BOB_MARLEY.albums,
            ...BLONDIE.albums,
            ...MADONNA.albums,
          ]);
        });
      });

      describe("fetching for a single artist", () => {
        it("should return them all if the artist has some", () => {
          expect(musicLibrary.albums({ artistId: BLONDIE.id })).toEqual(
            BLONDIE.albums
          );
        });

        it("should return empty list of the artists does not have any", () => {
          expect(musicLibrary.albums({ artistId: MADONNA.id })).toEqual([]);
        });

        it("should return empty list if the artist id is not valid", () => {
          expect(musicLibrary.albums({ artistId: uuid() })).toEqual([]);
        });
      });

      describe("fetching with just index", () => {
        it("should return everything after", () => {
          expect(musicLibrary.albums({ _index: 2 })).toEqual([
            BOB_MARLEY.albums[2],
            BLONDIE.albums[0],
            BLONDIE.albums[1],
          ]);
        });
      });

      describe("fetching with just count", () => {
        it("should return first n items", () => {
          expect(musicLibrary.albums({ _count: 3 })).toEqual([
            BOB_MARLEY.albums[0],
            BOB_MARLEY.albums[1],
            BOB_MARLEY.albums[2],
          ]);
        });
      });

      describe("fetching with index and count", () => {
        it("should be able to return the first page", () => {
          expect(musicLibrary.albums({ _index: 0, _count: 2 })).toEqual([
            BOB_MARLEY.albums[0],
            BOB_MARLEY.albums[1],
          ]);
        });
        it("should be able to return the second page", () => {
          expect(musicLibrary.albums({ _index: 2, _count: 2 })).toEqual([
            BOB_MARLEY.albums[2],
            BLONDIE.albums[0],
          ]);
        });
        it("should be able to return the last page", () => {
          expect(musicLibrary.albums({ _index: 4, _count: 2 })).toEqual([
            BLONDIE.albums[1],
          ]);
        });
      });
    });
  });
});
