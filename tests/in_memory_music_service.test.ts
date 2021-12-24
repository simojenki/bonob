import { taskEither as TE } from "fp-ts";
import { pipe } from "fp-ts/lib/function";

import { InMemoryMusicService } from "./in_memory_music_service";
import {
  MusicLibrary,
  artistToArtistSummary,
  albumToAlbumSummary,
  Artist,
} from "../src/music_service";
import { v4 as uuid } from "uuid";
import {
  anArtist,
  anAlbum,
  aTrack,
  POP,
  ROCK,
  METAL,
  HIP_HOP,
  SKA,
} from "./builders";
import _ from "underscore";


describe("InMemoryMusicService", () => {
  const service = new InMemoryMusicService();

  describe("generateToken", () => {
    it("should be able to generate a token and then use it to log in", async () => {
      const credentials = { username: "bob", password: "smith" };

      service.hasUser(credentials);

      const token = await pipe(
        service.generateToken(credentials),
        TE.getOrElse(e => { throw e })
      )();

      expect(token.userId).toEqual(credentials.username);
      expect(token.nickname).toEqual(credentials.username);

      const musicLibrary = service.login(token.serviceToken);

      expect(musicLibrary).toBeDefined();
    });

    it("should fail with an exception if an invalid token is used", async () => {
      const credentials = { username: "bob", password: "smith" };

      service.hasUser(credentials);

      const token = await pipe(
        service.generateToken(credentials),
        TE.getOrElse(e => { throw e })
      )();

      service.clear();

      return expect(service.login(token.serviceToken)).rejects.toEqual(
        "Invalid auth token"
      );
    });
  });
  
  describe("Music Library", () => {
    const user = { username: "user100", password: "password100" };
    let musicLibrary: MusicLibrary;

    beforeEach(async () => {
      service.clear();

      service.hasUser(user);

      const token = await pipe(
        service.generateToken(user),
        TE.getOrElse(e => { throw e })
      )();

      musicLibrary = (await service.login(token.serviceToken)) as MusicLibrary;
    });

    const artistToArtistSummaryWithSortName = (artist: Artist) => ({
      ...artistToArtistSummary(artist),
      sortName: artist.name
    })

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
              artistToArtistSummaryWithSortName(artist1),
              artistToArtistSummaryWithSortName(artist2),
              artistToArtistSummaryWithSortName(artist3),
              artistToArtistSummaryWithSortName(artist4),
              artistToArtistSummaryWithSortName(artist5),
            ],
            total: 5,
          });
        });
      });

      describe("fetching the second page", () => {
        it("should provide an array of artists", async () => {
          expect(await musicLibrary.artists({ _index: 2, _count: 2 })).toEqual({
            results: [
              artistToArtistSummaryWithSortName(artist3),
              artistToArtistSummaryWithSortName(artist4),
            ],
            total: 5,
          });
        });
      });

      describe("fetching the last page", () => {
        it("should provide an array of artists", async () => {
          expect(await musicLibrary.artists({ _index: 4, _count: 2 })).toEqual({
            results: [artistToArtistSummaryWithSortName(artist5)],
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
          expect(await musicLibrary.artist(artist1.id!)).toEqual(artist1);
          expect(await musicLibrary.artist(artist2.id!)).toEqual(artist2);
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

    describe("tracks", () => {
      const artist1Album1 = anAlbum();
      const artist1Album2 = anAlbum();
      const artist1 = anArtist({ albums: [artist1Album1, artist1Album2] });

      const track1 = aTrack({ album: artist1Album1, artist: artist1 });
      const track2 = aTrack({ album: artist1Album1, artist: artist1 });
      const track3 = aTrack({ album: artist1Album2, artist: artist1 });
      const track4 = aTrack({ album: artist1Album2, artist: artist1 });

      beforeEach(() => {
        service.hasArtists(artist1);
        service.hasTracks(track1, track2, track3, track4);
      });

      describe("fetching tracks for an album", () => {
        it("should return only tracks on that album", async () => {
          expect(await musicLibrary.tracks(artist1Album1.id)).toEqual([
            { ...track1, rating: { love: false, stars: 0 } },
            { ...track2, rating: { love: false, stars: 0 } },
          ]);
        });
      });

      describe("fetching tracks for an album that doesnt exist", () => {
        it("should return empty array", async () => {
          expect(await musicLibrary.tracks("non existant album id")).toEqual(
            []
          );
        });
      });

      describe("fetching a single track", () => {
        describe("when it exists", () => {
          it("should return the track", async () => {
            expect(await musicLibrary.track(track3.id)).toEqual({ ...track3, rating: { love: false, stars: 0 } },);
          });
        });
      });
    });

    describe("albums", () => {
      const artist1_album1 = anAlbum({ genre: POP });
      const artist1_album2 = anAlbum({ genre: ROCK });
      const artist1_album3 = anAlbum({ genre: METAL });
      const artist1_album4 = anAlbum({ genre: POP });
      const artist1_album5 = anAlbum({ genre: POP });

      const artist2_album1 = anAlbum({ genre: METAL });

      const artist3_album1 = anAlbum({ genre: HIP_HOP });
      const artist3_album2 = anAlbum({ genre: POP });

      const artist1 = anArtist({
        name: "artist1",
        albums: [
          artist1_album1,
          artist1_album2,
          artist1_album3,
          artist1_album4,
          artist1_album5,
        ],
      });
      const artist2 = anArtist({ name: "artist2", albums: [artist2_album1] });
      const artist3 = anArtist({
        name: "artist3",
        albums: [artist3_album1, artist3_album2],
      });
      const artistWithNoAlbums = anArtist({ albums: [] });

      const allAlbums = [artist1, artist2, artist3, artistWithNoAlbums].flatMap(
        (it) => it.albums
      );
      const totalAlbumCount = allAlbums.length;

      beforeEach(() => {
        service.hasArtists(artist1, artist2, artist3, artistWithNoAlbums);
      });

      describe("fetching random albums", () => {
        describe("with no paging", () => {
          it("should return all albums for all the artists in a random order", async () => {
            const albums = await musicLibrary.albums({
              _index: 0,
              _count: 100,
              type: "random",
            });

            expect(albums.total).toEqual(totalAlbumCount);
            expect(albums.results.map((it) => it.id).sort()).toEqual(
              allAlbums.map((it) => it.id).sort()
            );
          });
        });

        describe("with no paging", () => {
          it("should return only a page of results", async () => {
            const albums = await musicLibrary.albums({
              _index: 2,
              _count: 3,
              type: "random",
            });

            expect(albums.total).toEqual(totalAlbumCount);
            expect(albums.results.length).toEqual(3);
            // cannot really assert the results and they will change every time
          });
        });
      });

      describe("fetching multiple albums", () => {
        describe("with no filtering", () => {
          describe("fetching all on one page", () => {
            describe("alphabeticalByArtist", () => {
              it("should return all the albums for all the artists", async () => {
                expect(
                  await musicLibrary.albums({
                    _index: 0,
                    _count: 100,
                    type: "alphabeticalByArtist",
                  })
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

            describe("alphabeticalByName", () => {
              it("should return all the albums for all the artists", async () => {
                expect(
                  await musicLibrary.albums({
                    _index: 0,
                    _count: 100,
                    type: "alphabeticalByName",
                  })
                ).toEqual({
                  results: _.sortBy(allAlbums, "name").map(albumToAlbumSummary),
                  total: totalAlbumCount,
                });
              });
            });
          });

          describe("fetching a page", () => {
            it("should return only that page", async () => {
              expect(
                await musicLibrary.albums({
                  _index: 4,
                  _count: 3,
                  type: "alphabeticalByArtist",
                })
              ).toEqual({
                results: [
                  albumToAlbumSummary(artist1_album5),
                  albumToAlbumSummary(artist2_album1),
                  albumToAlbumSummary(artist3_album1),
                ],
                total: totalAlbumCount,
              });
            });
          });

          describe("fetching the last page", () => {
            it("should return only that page", async () => {
              expect(
                await musicLibrary.albums({
                  _index: 6,
                  _count: 100,
                  type: "alphabeticalByArtist",
                })
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

        describe("filtering by genre", () => {
          describe("fetching all on one page", () => {
            it("should return all the albums of that genre for all the artists", async () => {
              expect(
                await musicLibrary.albums({
                  type: "byGenre",
                  genre: POP.id,
                  _index: 0,
                  _count: 100,
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
                    type: "byGenre",
                    genre: POP.id,
                    _index: 1,
                    _count: 2,
                  })
                ).toEqual({
                  results: [
                    albumToAlbumSummary(artist1_album4),
                    albumToAlbumSummary(artist1_album5),
                  ],
                  total: 4,
                });
              });
            });

            describe("can fetch the last page", () => {
              it("should return only the albums for the last page", async () => {
                expect(
                  await musicLibrary.albums({
                    type: "byGenre",
                    genre: POP.id,
                    _index: 3,
                    _count: 100,
                  })
                ).toEqual({
                  results: [albumToAlbumSummary(artist3_album2)],
                  total: 4,
                });
              });
            });
          });

          it("should return empty list if there are no albums for the genre", async () => {
            expect(
              await musicLibrary.albums({
                type: "byGenre",
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

      describe("fetching a single album", () => {
        describe("when it exists", () => {
          it("should provide an album", async () => {
            expect(await musicLibrary.album(artist1_album5.id)).toEqual(
              artist1_album5
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
    });

    describe("genres", () => {
      const artist1 = anArtist({
        albums: [
          anAlbum({ genre: POP }),
          anAlbum({ genre: ROCK }),
          anAlbum({ genre: POP }),
        ],
      });
      const artist2 = anArtist({
        albums: [
          anAlbum({ genre: HIP_HOP }),
          anAlbum({ genre: SKA }),
          anAlbum({ genre: POP }),
        ],
      });

      beforeEach(() => {
        service.hasArtists(artist1, artist2);
      });

      describe("fetching all in one page", () => {
        it("should provide an array of artists", async () => {
          expect(await musicLibrary.genres()).toEqual([
            HIP_HOP,
            SKA,
            POP,
            ROCK,
          ]);
        });
      });
    });
  });
});
