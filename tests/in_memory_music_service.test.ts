import { InMemoryMusicService } from "./in_memory_music_service";
import {
  AuthSuccess,
  MusicLibrary,
  artistToArtistSummary,
  albumToAlbumSummary,
} from "../src/music_service";
import { v4 as uuid } from "uuid";
import { anArtist, anAlbum } from "./builders";

describe("InMemoryMusicService", () => {
  const service = new InMemoryMusicService();

  describe("generateToken", () => {
    it("should be able to generate a token and then use it to log in", async () => {
      const credentials = { username: "bob", password: "smith" };

      service.hasUser(credentials);

      const token = (await service.generateToken(credentials)) as AuthSuccess;

      expect(token.userId).toEqual(credentials.username);
      expect(token.nickname).toEqual(credentials.username);

      const musicLibrary = service.login(token.authToken);

      expect(musicLibrary).toBeDefined();
    });

    it("should fail with an exception if an invalid token is used", async () => {
      const credentials = { username: "bob", password: "smith" };

      service.hasUser(credentials);

      const token = (await service.generateToken(credentials)) as AuthSuccess;

      service.clear();

      return expect(service.login(token.authToken)).rejects.toEqual(
        "Invalid auth token"
      );
    });
  });

  describe("artistToArtistSummary", () => {
    it("should map fields correctly", () => {
      const artist = anArtist({
        id: uuid(),
        name: "The Artist",
        image: {
          small: "/path/to/small/jpg",
          medium: "/path/to/medium/jpg",
          large: "/path/to/large/jpg",
        },
      });
      expect(artistToArtistSummary(artist)).toEqual({
        id: artist.id,
        name: artist.name,
        image: artist.image,
      });
    });
  });

  describe("Music Library", () => {
    const user = { username: "user100", password: "password100" };
    let musicLibrary: MusicLibrary;

    beforeEach(async () => {
      service.clear();

      service.hasUser(user);

      const token = (await service.generateToken(user)) as AuthSuccess;
      musicLibrary = (await service.login(token.authToken)) as MusicLibrary;
    });

    describe("artists", () => {
      const artist1 = anArtist();
      const artist2 = anArtist();
      const artist3 = anArtist();
      const artist4 = anArtist();
      const artist5 = anArtist();

      beforeEach(() => {
        service.hasArtists(artist1, artist2, artist3, artist4, artist5);
      });

      describe("fetching all in one page", () => {
        it("should provide an array of artists", async () => {
          expect(
            await musicLibrary.artists({ _index: 0, _count: 100 })
          ).toEqual({
            results: [
              artistToArtistSummary(artist1),
              artistToArtistSummary(artist2),
              artistToArtistSummary(artist3),
              artistToArtistSummary(artist4),
              artistToArtistSummary(artist5),
            ],
            total: 5,
          });
        });
      });

      describe("fetching the second page", () => {
        it("should provide an array of artists", async () => {
          expect(await musicLibrary.artists({ _index: 2, _count: 2 })).toEqual({
            results: [
              artistToArtistSummary(artist3),
              artistToArtistSummary(artist4),
            ],
            total: 5,
          });
        });
      });

      describe("fetching the last page", () => {
        it("should provide an array of artists", async () => {
          expect(await musicLibrary.artists({ _index: 4, _count: 2 })).toEqual({
            results: [artistToArtistSummary(artist5)],
            total: 5,
          });
        });
      });
    });

    describe("artist", () => {
      const artist1 = anArtist({ id: uuid(), name: "Artist 1" });
      const artist2 = anArtist({ id: uuid(), name: "Artist 2" });

      beforeEach(() => {
        service.hasArtists(artist1, artist2);
      });

      describe("when it exists", () => {
        it("should provide an artist", async () => {
          expect(await musicLibrary.artist(artist1.id)).toEqual(artist1);
          expect(await musicLibrary.artist(artist2.id)).toEqual(artist2);
        });
      });

      describe("when it doesnt exist", () => {
        it("should blow up", async () => {
          return expect(musicLibrary.artist("-1")).rejects.toEqual(
            "No artist with id '-1'"
          );
        });
      });
    });

    describe("album", () => {
      describe("when it exists", () => {
        const albumToLookFor = anAlbum({ id: "albumToLookFor" });
        const artist1 = anArtist({ albums: [anAlbum(), anAlbum(), anAlbum()] });
        const artist2 = anArtist({
          albums: [anAlbum(), albumToLookFor, anAlbum()],
        });

        beforeEach(() => {
          service.hasArtists(artist1, artist2);
        });

        it("should provide an artist", async () => {
          expect(await musicLibrary.album(albumToLookFor.id)).toEqual(
            albumToLookFor
          );
        });
      });

      describe("when it doesnt exist", () => {
        it("should blow up", async () => {
          return expect(musicLibrary.album("-1")).rejects.toEqual(
            "No album with id '-1'"
          );
        });
      });
    });

    describe("albums", () => {
      const artist1_album1 = anAlbum({ genre: "Pop" });
      const artist1_album2 = anAlbum({ genre: "Rock" });
      const artist1_album3 = anAlbum({ genre: "Metal" });
      const artist1_album4 = anAlbum({ genre: "Pop" });
      const artist1_album5 = anAlbum({ genre: "Pop" });

      const artist2_album1 = anAlbum({ genre: "Metal" });

      const artist3_album1 = anAlbum({ genre: "Hip-Hop" });
      const artist3_album2 = anAlbum({ genre: "Pop" });

      const totalAlbumCount = 8;

      const artist1 = anArtist({
        albums: [
          artist1_album1,
          artist1_album2,
          artist1_album3,
          artist1_album4,
          artist1_album5,
        ],
      });
      const artist2 = anArtist({ albums: [artist2_album1] });
      const artist3 = anArtist({ albums: [artist3_album1, artist3_album2] });
      const artistWithNoAlbums = anArtist({ albums: [] });

      beforeEach(() => {
        service.hasArtists(artist1, artist2, artist3, artistWithNoAlbums);
      });

      describe("with no filtering", () => {
        describe("fetching all on one page", () => {
          it("should return all the albums for all the artists", async () => {
            expect(
              await musicLibrary.albums({ _index: 0, _count: 100 })
            ).toEqual({
              results: [
                albumToAlbumSummary(artist1_album1),
                albumToAlbumSummary(artist1_album2),
                albumToAlbumSummary(artist1_album3),
                albumToAlbumSummary(artist1_album4),
                albumToAlbumSummary(artist1_album5),

                albumToAlbumSummary(artist2_album1),

                albumToAlbumSummary(artist3_album1),
                albumToAlbumSummary(artist3_album2),
              ],
              total: totalAlbumCount,
            });
          });
        });

        describe("fetching a page", () => {
          it("should return only that page", async () => {
            expect(await musicLibrary.albums({ _index: 4, _count: 3 })).toEqual(
              {
                results: [
                  albumToAlbumSummary(artist1_album5),
                  albumToAlbumSummary(artist2_album1),
                  albumToAlbumSummary(artist3_album1),
                ],
                total: totalAlbumCount,
              }
            );
          });
        });

        describe("fetching the last page", () => {
          it("should return only that page", async () => {
            expect(
              await musicLibrary.albums({ _index: 6, _count: 100 })
            ).toEqual({
              results: [
                albumToAlbumSummary(artist3_album1),
                albumToAlbumSummary(artist3_album2),
              ],
              total: totalAlbumCount,
            });
          });
        });
      });

      describe("filtering by artist", () => {
        describe("fetching all", () => {
          it("should return all artist albums", async () => {
            expect(
              await musicLibrary.albums({
                artistId: artist3.id,
                _index: 0,
                _count: 100,
              })
            ).toEqual({
              results: [
                albumToAlbumSummary(artist3_album1),
                albumToAlbumSummary(artist3_album2),
              ],
              total: artist3.albums.length,
            });
          });
        });

        describe("when the artist has more albums than a single page", () => {
          describe("can fetch a single page", () => {
            it("should return only the albums for that page", async () => {
              expect(
                await musicLibrary.albums({
                  artistId: artist1.id,
                  _index: 1,
                  _count: 3,
                })
              ).toEqual({
                results: [
                  albumToAlbumSummary(artist1_album2),
                  albumToAlbumSummary(artist1_album3),
                  albumToAlbumSummary(artist1_album4),
                ],
                total: artist1.albums.length,
              });
            });
          });

          describe("can fetch the last page", () => {
            it("should return only the albums for the last page", async () => {
              expect(
                await musicLibrary.albums({
                  artistId: artist1.id,
                  _index: 4,
                  _count: 100,
                })
              ).toEqual({
                results: [albumToAlbumSummary(artist1_album5)],
                total: artist1.albums.length,
              });
            });
          });
        });

        it("should return empty list if the artists does not have any", async () => {
          expect(
            await musicLibrary.albums({
              artistId: artistWithNoAlbums.id,
              _index: 0,
              _count: 100,
            })
          ).toEqual({
            results: [],
            total: 0,
          });
        });

        it("should return empty list if the artist id is not valid", async () => {
          expect(
            await musicLibrary.albums({
              artistId: uuid(),
              _index: 0,
              _count: 100,
            })
          ).toEqual({
            results: [],
            total: 0,
          });
        });
      });

      describe("filtering by genre", () => {
        describe("fetching all on one page", () => {
          it.only("should return all the albums of that genre for all the artists", async () => {
            expect(
              await musicLibrary.albums({
                _index: 0,
                _count: 100,
                genre: "Pop",
              })
            ).toEqual({
              results: [
                albumToAlbumSummary(artist1_album1),
                albumToAlbumSummary(artist1_album4),
                albumToAlbumSummary(artist1_album5),
                albumToAlbumSummary(artist3_album2),
              ],
              total: 4,
            });
          });
        });

        describe("when the genre has more albums than a single page", () => {
          describe("can fetch a single page", () => {
            it("should return only the albums for that page", async () => {
              expect(
                await musicLibrary.albums({
                  genre: "Pop",
                  _index: 1,
                  _count: 3,
                })
              ).toEqual({
                results: [
                  albumToAlbumSummary(artist1_album1),
                  albumToAlbumSummary(artist1_album4),
                  albumToAlbumSummary(artist1_album5),
                  albumToAlbumSummary(artist3_album2),
                ],
                total: 4,
              });
            });
          });

          describe("can fetch the last page", () => {
            it("should return only the albums for the last page", async () => {
              expect(
                await musicLibrary.albums({
                  artistId: artist1.id,
                  _index: 4,
                  _count: 100,
                })
              ).toEqual({
                results: [albumToAlbumSummary(artist1_album5)],
                total: artist1.albums.length,
              });
            });
          });
        });

        it("should return empty list if there are no albums for the genre", async () => {
          expect(
            await musicLibrary.albums({
              genre: "genre with no albums",
              _index: 0,
              _count: 100,
            })
          ).toEqual({
            results: [],
            total: 0,
          });
        });
      });
    });

    describe("genres", () => {
      const artist1 = anArtist({ albums: [anAlbum({ genre: "Pop" }),     anAlbum({ genre: "Rock" }), anAlbum({ genre: "Pop" })] });
      const artist2 = anArtist({ albums: [anAlbum({ genre: "Hip-Hop" }), anAlbum({ genre: "Rap" }), anAlbum({ genre: "Pop" })] });

      beforeEach(() => {
        service.hasArtists(artist1, artist2);
      });

      describe("fetching all in one page", () => {
        it("should provide an array of artists", async () => {
          expect(
            await musicLibrary.genres()
          ).toEqual([
            "Hip-Hop",
            "Pop",
            "Rap",
            "Rock"
          ]);
        });
      });
    });
  });
});
