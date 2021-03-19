import crypto from "crypto";
import request from "supertest";
import { Client, createClientAsync } from "soap";
import { v4 as uuid } from "uuid";

import { DOMParserImpl } from "xmldom-ts";
import * as xpath from "xpath-ts";
import { randomInt } from "crypto";

import { InMemoryLinkCodes, LinkCodes } from "../src/link_codes";
import makeServer, { BONOB_ACCESS_TOKEN_HEADER } from "../src/server";
import { bonobService, SONOS_DISABLED } from "../src/sonos";
import {
  STRINGS_ROUTE,
  LOGIN_ROUTE,
  getMetadataResult,
  PRESENTATION_MAP_ROUTE,
  SONOS_RECOMMENDED_IMAGE_SIZES,
  track,
  album,
  defaultAlbumArtURI,
  defaultArtistArtURI,
} from "../src/smapi";

import {
  aService,
  getAppLinkMessage,
  someCredentials,
  anArtist,
  anAlbum,
  aTrack,
  POP,
  ROCK,
  PUNK, TRIP_HOP
} from "./builders";
import { InMemoryMusicService } from "./in_memory_music_service";
import supersoap from "./supersoap";
import { AuthSuccess } from "../src/music_service";
import { AccessTokens } from "../src/access_tokens";

const parseXML = (value: string) => new DOMParserImpl().parseFromString(value);

describe("service config", () => {
  const server = makeServer(
    SONOS_DISABLED,
    aService({ name: "music land" }),
    "http://localhost:1234",
    new InMemoryMusicService()
  );

  describe(STRINGS_ROUTE, () => {
    it("should return xml for the strings", async () => {
      const res = await request(server).get(STRINGS_ROUTE).send();

      expect(res.status).toEqual(200);

      // removing the sonos xml ns as makes xpath queries with xpath-ts painful
      const xml = parseXML(
        res.text.replace('xmlns="http://sonos.com/sonosapi"', "")
      );

      const sonosString = (id: string, lang: string) =>
        xpath.select(
          `string(/stringtables/stringtable[@xml:lang="${lang}"]/string[@stringId="${id}"])`,
          xml
        );

      expect(sonosString("AppLinkMessage", "en-US")).toEqual(
        "Linking sonos with music land"
      );
      expect(sonosString("AppLinkMessage", "fr-FR")).toEqual(
        "Lier les sonos à la music land"
      );
    });
  });

  describe(PRESENTATION_MAP_ROUTE, () => {
    it("should have an ArtWorkSizeMap for all sizes recommended by sonos", async () => {
      const res = await request(server).get(PRESENTATION_MAP_ROUTE).send();

      expect(res.status).toEqual(200);

      // removing the sonos xml ns as makes xpath queries with xpath-ts painful
      const xml = parseXML(
        res.text.replace('xmlns="http://sonos.com/sonosapi"', "")
      );

      const imageSizeMap = (size: string) =>
        xpath.select(
          `string(/Presentation/PresentationMap[@type="ArtWorkSizeMap"]/Match/imageSizeMap/sizeEntry[@size="${size}"]/@substitution)`,
          xml
        );

      SONOS_RECOMMENDED_IMAGE_SIZES.forEach((size) => {
        expect(imageSizeMap(size)).toEqual(`/art/size/${size}`);
      });
    });
  });
});

describe("getMetadataResult", () => {
  describe("when there are a no mediaCollections & no mediaMetadata", () => {
    it("should have zero count", () => {
      const result = getMetadataResult({
        index: 33,
        total: 99,
      });

      expect(result).toEqual({
        getMetadataResult: {
          count: 0,
          index: 33,
          total: 99,
        },
      });
    });
  });

  describe("when there are a number of mediaCollections", () => {
    it("should add correct counts", () => {
      const mediaCollection = [{}, {}];
      const result = getMetadataResult({
        mediaCollection,
        index: 22,
        total: 3,
      });

      expect(result).toEqual({
        getMetadataResult: {
          count: 2,
          index: 22,
          total: 3,
          mediaCollection,
        },
      });
    });
  });

  describe("when there are a number of mediaMetadata", () => {
    it("should add correct counts", () => {
      const mediaMetadata = [{}, {}];
      const result = getMetadataResult({
        mediaMetadata,
        index: 22,
        total: 3,
      });

      expect(result).toEqual({
        getMetadataResult: {
          count: 2,
          index: 22,
          total: 3,
          mediaMetadata,
        },
      });
    });
  });

  describe("when there are both a number of mediaMetadata & mediaCollections", () => {
    it("should sum the counts", () => {
      const mediaCollection = [{}, {}, {}];
      const mediaMetadata = [{}, {}];
      const result = getMetadataResult({
        mediaCollection,
        mediaMetadata,
        index: 22,
        total: 3,
      });

      expect(result).toEqual({
        getMetadataResult: {
          count: 5,
          index: 22,
          total: 3,
          mediaCollection,
          mediaMetadata,
        },
      });
    });
  });
});

describe("track", () => {
  it("should map into a sonos expected track", () => {
    const webAddress = "http://localhost:4567";
    const accessToken = uuid();
    const someTrack = aTrack({
      id: uuid(),
      mimeType: "audio/something",
      name: "great song",
      duration: randomInt(1000),
      number: randomInt(100),
      album: anAlbum({
        name: "great album",
        id: uuid(),
        genre: { id: "genre101", name: "some genre" },
      }),
      artist: anArtist({ name: "great artist", id: uuid() }),
    });

    expect(track(webAddress, accessToken, someTrack)).toEqual({
      itemType: "track",
      id: `track:${someTrack.id}`,
      mimeType: someTrack.mimeType,
      title: someTrack.name,

      trackMetadata: {
        album: someTrack.album.name,
        albumId: someTrack.album.id,
        albumArtist: someTrack.artist.name,
        albumArtistId: someTrack.artist.id,
        albumArtURI: `${webAddress}/album/${someTrack.album.id}/art/size/180?${BONOB_ACCESS_TOKEN_HEADER}=${accessToken}`,
        artist: someTrack.artist.name,
        artistId: someTrack.artist.id,
        duration: someTrack.duration,
        genre: someTrack.album.genre?.name,
        genreId: someTrack.album.genre?.id,
        trackNumber: someTrack.number,
      },
    });
  });
});

describe("album", () => {
  it("should map to a sonos album", () => {
    const webAddress = "http://localhost:9988";
    const accessToken = uuid();
    const someAlbum = anAlbum({ id: "id123", name: "What a great album" });

    expect(album(webAddress, accessToken, someAlbum)).toEqual({
      itemType: "album",
      id: `album:${someAlbum.id}`,
      title: someAlbum.name,
      albumArtURI: defaultAlbumArtURI(webAddress, accessToken, someAlbum),
      canPlay: true,
    });
  });
});

describe("defaultAlbumArtURI", () => {
  it("should create the correct URI", () => {
    const webAddress = "http://localhost:1234";
    const accessToken = uuid();
    const album = anAlbum();

    expect(defaultAlbumArtURI(webAddress, accessToken, album)).toEqual(
      `${webAddress}/album/${album.id}/art/size/180?${BONOB_ACCESS_TOKEN_HEADER}=${accessToken}`
    );
  });
});

describe("defaultArtistArtURI", () => {
  it("should create the correct URI", () => {
    const webAddress = "http://localhost:1234";
    const accessToken = uuid();
    const artist = anArtist();

    expect(defaultArtistArtURI(webAddress, accessToken, artist)).toEqual(
      `${webAddress}/artist/${artist.id}/art/size/180?${BONOB_ACCESS_TOKEN_HEADER}=${accessToken}`
    );
  });
});

class Base64AccessTokens implements AccessTokens {
  mint(authToken: string) {
    return Buffer.from(authToken).toString("base64");
  }
  authTokenFor(value: string) {
    return Buffer.from(value, "base64").toString("ascii");
  }
}

describe("api", () => {
  const rootUrl = "http://localhost:1234";
  const service = bonobService("test-api", 133, rootUrl, "AppLink");
  const musicService = new InMemoryMusicService();
  const linkCodes = new InMemoryLinkCodes();
  const accessTokens = new Base64AccessTokens();

  beforeEach(() => {
    musicService.clear();
    linkCodes.clear();
  });

  describe("pages", () => {
    const server = makeServer(
      SONOS_DISABLED,
      service,
      rootUrl,
      musicService,
      linkCodes,
      accessTokens
    );

    describe(LOGIN_ROUTE, () => {
      describe("when the credentials are valid", () => {
        it("should return 200 ok and have associated linkCode with user", async () => {
          const username = "jane";
          const password = "password100";
          const linkCode = linkCodes.mint();

          musicService.hasUser({ username, password });

          const res = await request(server)
            .post(LOGIN_ROUTE)
            .type("form")
            .send({ username, password, linkCode })
            .expect(200);

          expect(res.text).toContain("Login successful");

          const association = linkCodes.associationFor(linkCode);
          expect(association.nickname).toEqual(username);
        });
      });

      describe("when credentials are invalid", () => {
        it("should return 403 with message", async () => {
          const username = "userDoesntExist";
          const password = "password";
          const linkCode = linkCodes.mint();

          musicService.hasNoUsers();

          const res = await request(server)
            .post(LOGIN_ROUTE)
            .type("form")
            .send({ username, password, linkCode })
            .expect(403);

          expect(res.text).toContain(`Login failed! Invalid user:${username}`);
        });
      });

      describe("when linkCode is invalid", () => {
        it("should return 400 with message", async () => {
          const username = "jane";
          const password = "password100";
          const linkCode = "someLinkCodeThatDoesntExist";

          musicService.hasUser({ username, password });

          const res = await request(server)
            .post(LOGIN_ROUTE)
            .type("form")
            .send({ username, password, linkCode })
            .expect(400);

          expect(res.text).toContain("Invalid linkCode!");
        });
      });
    });
  });

  describe("soap api", () => {
    describe("getAppLink", () => {
      const mockLinkCodes = {
        mint: jest.fn(),
      };
      const server = makeServer(
        SONOS_DISABLED,
        service,
        rootUrl,
        musicService,
        (mockLinkCodes as unknown) as LinkCodes,
        accessTokens
      );

      it("should do something", async () => {
        const ws = await createClientAsync(`${service.uri}?wsdl`, {
          endpoint: service.uri,
          httpClient: supersoap(server, rootUrl),
        });

        const linkCode = "theLinkCode8899";

        mockLinkCodes.mint.mockReturnValue(linkCode);

        const result = await ws.getAppLinkAsync(getAppLinkMessage());

        expect(result[0]).toEqual({
          getAppLinkResult: {
            authorizeAccount: {
              appUrlStringId: "AppLinkMessage",
              deviceLink: {
                regUrl: `${rootUrl}/login?linkCode=${linkCode}`,
                linkCode: linkCode,
                showLinkCode: false,
              },
            },
          },
        });
      });
    });

    describe("getDeviceAuthToken", () => {
      const linkCodes = new InMemoryLinkCodes();
      const server = makeServer(
        SONOS_DISABLED,
        service,
        rootUrl,
        musicService,
        linkCodes,
        accessTokens
      );

      describe("when there is a linkCode association", () => {
        it("should return a device auth token", async () => {
          const linkCode = linkCodes.mint();
          const association = {
            authToken: "at",
            userId: "uid",
            nickname: "nn",
          };
          linkCodes.associate(linkCode, association);

          const ws = await createClientAsync(`${service.uri}?wsdl`, {
            endpoint: service.uri,
            httpClient: supersoap(server, rootUrl),
          });

          const result = await ws.getDeviceAuthTokenAsync({ linkCode });

          expect(result[0]).toEqual({
            getDeviceAuthTokenResult: {
              authToken: association.authToken,
              privateKey: "",
              userInfo: {
                nickname: association.nickname,
                userIdHashCode: crypto
                  .createHash("sha256")
                  .update(association.userId)
                  .digest("hex"),
              },
            },
          });
        });
      });

      describe("when there is no linkCode association", () => {
        it("should return a device auth token", async () => {
          const linkCode = "invalidLinkCode";

          const ws = await createClientAsync(`${service.uri}?wsdl`, {
            endpoint: service.uri,
            httpClient: supersoap(server, rootUrl),
          });

          await ws
            .getDeviceAuthTokenAsync({ linkCode })
            .then(() => {
              fail("Shouldnt get here");
            })
            .catch((e: any) => {
              expect(e.root.Envelope.Body.Fault).toEqual({
                faultcode: "Client.NOT_LINKED_RETRY",
                faultstring: "Link Code not found retry...",
                detail: { ExceptionInfo: "NOT_LINKED_RETRY", SonosError: "5" },
              });
            });
        });
      });
    });

    describe("getMetadata", () => {
      const server = makeServer(
        SONOS_DISABLED,
        service,
        rootUrl,
        musicService,
        linkCodes,
        accessTokens
      );

      describe("when no credentials header provided", () => {
        it("should return a fault of LoginUnsupported", async () => {
          const ws = await createClientAsync(`${service.uri}?wsdl`, {
            endpoint: service.uri,
            httpClient: supersoap(server, rootUrl),
          });

          await ws
            .getMetadataAsync({ id: "root", index: 0, count: 0 })
            .then(() => fail("shouldnt get here"))
            .catch((e: any) => {
              expect(e.root.Envelope.Body.Fault).toEqual({
                faultcode: "Client.LoginUnsupported",
                faultstring: "Missing credentials...",
              });
            });
        });
      });

      describe("when invalid credentials are provided", () => {
        it("should return a fault of LoginUnauthorized", async () => {
          const username = "userThatGetsDeleted";
          const password = "password1";
          musicService.hasUser({ username, password });
          const token = (await musicService.generateToken({
            username,
            password,
          })) as AuthSuccess;
          musicService.hasNoUsers();

          const ws = await createClientAsync(`${service.uri}?wsdl`, {
            endpoint: service.uri,
            httpClient: supersoap(server, rootUrl),
          });

          ws.addSoapHeader({ credentials: someCredentials(token.authToken) });
          await ws
            .getMetadataAsync({ id: "root", index: 0, count: 0 })
            .then(() => fail("shouldnt get here"))
            .catch((e: any) => {
              expect(e.root.Envelope.Body.Fault).toEqual({
                faultcode: "Client.LoginUnauthorized",
                faultstring: "Credentials not found...",
              });
            });
        });
      });

      describe("when valid credentials are provided", () => {
        const username = "validUser";
        const password = "validPassword";
        let token: AuthSuccess;
        let ws: Client;
        let accessToken: string;

        beforeEach(async () => {
          musicService.hasUser({ username, password });
          token = (await musicService.generateToken({
            username,
            password,
          })) as AuthSuccess;

          accessToken = accessTokens.mint(token.authToken);

          ws = await createClientAsync(`${service.uri}?wsdl`, {
            endpoint: service.uri,
            httpClient: supersoap(server, rootUrl),
          });
          ws.addSoapHeader({ credentials: someCredentials(token.authToken) });
        });

        describe("asking for the root container", () => {
          it("should return it", async () => {
            const root = await ws.getMetadataAsync({
              id: "root",
              index: 0,
              count: 100,
            });
            expect(root[0]).toEqual(
              getMetadataResult({
                mediaCollection: [
                  { itemType: "container", id: "artists", title: "Artists" },
                  { itemType: "container", id: "albums", title: "Albums" },
                  { itemType: "container", id: "genres", title: "Genres" },
                ],
                index: 0,
                total: 3,
              })
            );
          });
        });

        describe("asking for a genres", () => {
          const artist1 = anArtist({
            albums: [
              anAlbum({ genre: POP }),
              anAlbum({ genre: ROCK }),
            ],
          });
          const artist2 = anArtist({
            albums: [
              anAlbum({ genre: TRIP_HOP }),
              anAlbum({ genre: PUNK }),
              anAlbum({ genre: POP }),
            ],
          });

          const expectedGenres = [POP, PUNK, ROCK, TRIP_HOP];

          beforeEach(() => {
            musicService.hasArtists(artist1, artist2);
          });

          describe("asking for all genres", () => {
            it("should return a collection of genres", async () => {
              const result = await ws.getMetadataAsync({
                id: `genres`,
                index: 0,
                count: 100,
              });
              expect(result[0]).toEqual(
                getMetadataResult({
                  mediaCollection: expectedGenres.map((genre) => ({
                    itemType: "container",
                    id: `genre:${genre.id}`,
                    title: genre.name,
                  })),
                  index: 0,
                  total: expectedGenres.length,
                })
              );
            });
          });

          describe("asking for a page of genres", () => {
            it("should return just that page", async () => {
              const result = await ws.getMetadataAsync({
                id: `genres`,
                index: 1,
                count: 2,
              });
              expect(result[0]).toEqual(
                getMetadataResult({
                  mediaCollection: [PUNK, ROCK].map((genre) => ({
                    itemType: "container",
                    id: `genre:${genre.id}`,
                    title: genre.name,
                  })),
                  index: 1,
                  total: expectedGenres.length,
                })
              );
            });
          });
        });

        describe("asking for a single artist", () => {
          const artistWithManyAlbums = anArtist({
            albums: [anAlbum(), anAlbum(), anAlbum(), anAlbum(), anAlbum()],
          });

          beforeEach(() => {
            musicService.hasArtists(artistWithManyAlbums);
          });

          describe("asking for all albums", () => {
            it("should return a collection of albums", async () => {
              const result = await ws.getMetadataAsync({
                id: `artist:${artistWithManyAlbums.id}`,
                index: 0,
                count: 100,
              });
              expect(result[0]).toEqual(
                getMetadataResult({
                  mediaCollection: artistWithManyAlbums.albums.map((it) => ({
                    itemType: "album",
                    id: `album:${it.id}`,
                    title: it.name,
                    albumArtURI: defaultAlbumArtURI(rootUrl, accessToken, it),
                    canPlay: true,
                  })),
                  index: 0,
                  total: artistWithManyAlbums.albums.length,
                })
              );
            });
          });

          describe("asking for a page of albums", () => {
            it("should return just that page", async () => {
              const result = await ws.getMetadataAsync({
                id: `artist:${artistWithManyAlbums.id}`,
                index: 2,
                count: 2,
              });
              expect(result[0]).toEqual(
                getMetadataResult({
                  mediaCollection: [
                    artistWithManyAlbums.albums[2]!,
                    artistWithManyAlbums.albums[3]!,
                  ].map((it) => ({
                    itemType: "album",
                    id: `album:${it.id}`,
                    title: it.name,
                    albumArtURI: defaultAlbumArtURI(rootUrl, accessToken, it),
                    canPlay: true,
                  })),
                  index: 2,
                  total: artistWithManyAlbums.albums.length,
                })
              );
            });
          });
        });

        describe("asking for artists", () => {
          const artists = [
            anArtist(),
            anArtist(),
            anArtist(),
            anArtist(),
            anArtist(),
          ];

          beforeEach(() => {
            musicService.hasArtists(...artists);
          });

          describe("asking for all artists", () => {
            it("should return them all", async () => {
              const result = await ws.getMetadataAsync({
                id: "artists",
                index: 0,
                count: 100,
              });
              expect(result[0]).toEqual(
                getMetadataResult({
                  mediaCollection: artists.map((it) => ({
                    itemType: "artist",
                    id: `artist:${it.id}`,
                    artistId: it.id,
                    title: it.name,
                    albumArtURI: defaultArtistArtURI(rootUrl, accessToken, it),
                  })),
                  index: 0,
                  total: artists.length,
                })
              );
            });
          });

          describe("asking for a page of artists", () => {
            it("should return it", async () => {
              const result = await ws.getMetadataAsync({
                id: "artists",
                index: 1,
                count: 3,
              });
              expect(result[0]).toEqual(
                getMetadataResult({
                  mediaCollection: [artists[1]!, artists[2]!, artists[3]!].map(
                    (it) => ({
                      itemType: "artist",
                      id: `artist:${it.id}`,
                      artistId: it.id,
                      title: it.name,
                      albumArtURI: defaultArtistArtURI(
                        rootUrl,
                        accessToken,
                        it
                      ),
                    })
                  ),
                  index: 1,
                  total: artists.length,
                })
              );
            });
          });
        });

        describe("asking for relatedArtists", () => {
          describe("when the artist has many", () => {
            const relatedArtist1 = anArtist();
            const relatedArtist2 = anArtist();
            const relatedArtist3 = anArtist();
            const relatedArtist4 = anArtist();

            const artist = anArtist({
              similarArtists: [
                relatedArtist1,
                relatedArtist2,
                relatedArtist3,
                relatedArtist4,
              ],
            });

            beforeEach(() => {
              musicService.hasArtists(
                artist,
                relatedArtist1,
                relatedArtist2,
                relatedArtist3,
                relatedArtist4
              );
            });

            describe("when they fit on one page", () => {
              it("should return them", async () => {
                const result = await ws.getMetadataAsync({
                  id: `relatedArtists:${artist.id}`,
                  index: 0,
                  count: 100,
                });
                expect(result[0]).toEqual(
                  getMetadataResult({
                    mediaCollection: [
                      relatedArtist1,
                      relatedArtist2,
                      relatedArtist3,
                      relatedArtist4,
                    ].map((it) => ({
                      itemType: "artist",
                      id: `artist:${it.id}`,
                      artistId: it.id,
                      title: it.name,
                      albumArtURI: defaultArtistArtURI(
                        rootUrl,
                        accessToken,
                        it
                      ),
                    })),
                    index: 0,
                    total: 4,
                  })
                );
              });
            });

            describe("when they dont fit on one page", () => {
              it("should return them", async () => {
                const result = await ws.getMetadataAsync({
                  id: `relatedArtists:${artist.id}`,
                  index: 1,
                  count: 2,
                });
                expect(result[0]).toEqual(
                  getMetadataResult({
                    mediaCollection: [relatedArtist2, relatedArtist3].map(
                      (it) => ({
                        itemType: "artist",
                        id: `artist:${it.id}`,
                        artistId: it.id,
                        title: it.name,
                        albumArtURI: defaultArtistArtURI(
                          rootUrl,
                          accessToken,
                          it
                        ),
                      })
                    ),
                    index: 1,
                    total: 4,
                  })
                );
              });
            });
          });

          describe("when the artist has none", () => {
            const artist = anArtist({ similarArtists: [] });

            beforeEach(() => {
              musicService.hasArtists(artist);
            });

            it("should return an empty list", async () => {
              const result = await ws.getMetadataAsync({
                id: `relatedArtists:${artist.id}`,
                index: 0,
                count: 100,
              });
              expect(result[0]).toEqual(
                getMetadataResult({
                  index: 0,
                  total: 0,
                })
              );
            });
          });
        });

        describe("asking for albums", () => {
          const artist1 = anArtist({
            albums: [anAlbum(), anAlbum(), anAlbum()],
          });
          const artist2 = anArtist({
            albums: [anAlbum(), anAlbum()],
          });
          const artist3 = anArtist({
            albums: [],
          });
          const artist4 = anArtist({
            albums: [anAlbum()],
          });

          beforeEach(() => {
            musicService.hasArtists(artist1, artist2, artist3, artist4);
          });

          describe("asking for all albums", () => {
            it("should return them all", async () => {
              const result = await ws.getMetadataAsync({
                id: "albums",
                index: 0,
                count: 100,
              });
              expect(result[0]).toEqual(
                getMetadataResult({
                  mediaCollection: [artist1, artist2, artist3, artist4]
                    .flatMap((it) => it.albums)
                    .map((it) => ({
                      itemType: "album",
                      id: `album:${it.id}`,
                      title: it.name,
                      albumArtURI: defaultAlbumArtURI(rootUrl, accessToken, it),
                      canPlay: true,
                    })),
                  index: 0,
                  total: 6,
                })
              );
            });
          });

          describe("asking for a page of albums", () => {
            it("should return only that page", async () => {
              const result = await ws.getMetadataAsync({
                id: "albums",
                index: 2,
                count: 3,
              });
              expect(result[0]).toEqual(
                getMetadataResult({
                  mediaCollection: [
                    artist1.albums[2]!,
                    artist2.albums[0]!,
                    artist2.albums[1]!,
                  ].map((it) => ({
                    itemType: "album",
                    id: `album:${it.id}`,
                    title: it.name,
                    albumArtURI: defaultAlbumArtURI(rootUrl, accessToken, it),
                    canPlay: true,
                  })),
                  index: 2,
                  total: 6,
                })
              );
            });
          });
        });

        describe("asking for tracks", () => {
          describe("for an album", () => {
            const album = anAlbum();
            const artist = anArtist({
              albums: [album],
            });

            const track1 = aTrack({ artist, album, number: 1 });
            const track2 = aTrack({ artist, album, number: 2 });
            const track3 = aTrack({ artist, album, number: 3 });
            const track4 = aTrack({ artist, album, number: 4 });
            const track5 = aTrack({ artist, album, number: 5 });

            beforeEach(() => {
              musicService.hasArtists(artist);
              musicService.hasTracks(track1, track2, track3, track4, track5);
            });

            describe("asking for all albums", () => {
              it("should return them all", async () => {
                const result = await ws.getMetadataAsync({
                  id: `album:${album.id}`,
                  index: 0,
                  count: 100,
                });
                expect(result[0]).toEqual(
                  getMetadataResult({
                    mediaMetadata: [
                      track1,
                      track2,
                      track3,
                      track4,
                      track5,
                    ].map((it) =>
                      track(rootUrl, accessTokens.mint(token.authToken), it)
                    ),
                    index: 0,
                    total: 5,
                  })
                );
              });
            });

            describe("asking for a single page of tracks", () => {
              it("should return only that page", async () => {
                const result = await ws.getMetadataAsync({
                  id: `album:${album.id}`,
                  index: 2,
                  count: 2,
                });
                expect(result[0]).toEqual(
                  getMetadataResult({
                    mediaMetadata: [track3, track4].map((it) =>
                      track(rootUrl, accessTokens.mint(token.authToken), it)
                    ),
                    index: 2,
                    total: 5,
                  })
                );
              });
            });
          });
        });
      });
    });

    describe("getExtendedMetadata", () => {
      const server = makeServer(
        SONOS_DISABLED,
        service,
        rootUrl,
        musicService,
        linkCodes,
        accessTokens
      );

      describe("when no credentials header provided", () => {
        it("should return a fault of LoginUnsupported", async () => {
          const ws = await createClientAsync(`${service.uri}?wsdl`, {
            endpoint: service.uri,
            httpClient: supersoap(server, rootUrl),
          });

          await ws
            .getExtendedMetadataAsync({ id: "root", index: 0, count: 0 })
            .then(() => fail("shouldnt get here"))
            .catch((e: any) => {
              expect(e.root.Envelope.Body.Fault).toEqual({
                faultcode: "Client.LoginUnsupported",
                faultstring: "Missing credentials...",
              });
            });
        });
      });

      describe("when invalid credentials are provided", () => {
        it("should return a fault of LoginUnauthorized", async () => {
          const username = "userThatGetsDeleted";
          const password = "password1";
          musicService.hasUser({ username, password });
          const token = (await musicService.generateToken({
            username,
            password,
          })) as AuthSuccess;
          musicService.hasNoUsers();

          const ws = await createClientAsync(`${service.uri}?wsdl`, {
            endpoint: service.uri,
            httpClient: supersoap(server, rootUrl),
          });

          ws.addSoapHeader({ credentials: someCredentials(token.authToken) });
          await ws
            .getExtendedMetadataAsync({ id: "root", index: 0, count: 0 })
            .then(() => fail("shouldnt get here"))
            .catch((e: any) => {
              expect(e.root.Envelope.Body.Fault).toEqual({
                faultcode: "Client.LoginUnauthorized",
                faultstring: "Credentials not found...",
              });
            });
        });
      });

      describe("when valid credentials are provided", () => {
        const username = "validUser";
        const password = "validPassword";
        let token: AuthSuccess;
        let ws: Client;

        beforeEach(async () => {
          musicService.hasUser({ username, password });
          token = (await musicService.generateToken({
            username,
            password,
          })) as AuthSuccess;

          ws = await createClientAsync(`${service.uri}?wsdl`, {
            endpoint: service.uri,
            httpClient: supersoap(server, rootUrl),
          });
          ws.addSoapHeader({ credentials: someCredentials(token.authToken) });
        });

        describe("asking for an artist", () => {
          describe("when it has similar artists", () => {
            const similar1 = anArtist();
            const similar2 = anArtist();

            const artist = anArtist({
              similarArtists: [similar1, similar2],
              albums: [],
            });

            beforeEach(() => {
              musicService.hasArtists(artist);
            });

            it("should return a RELATED_ARTISTS browse option", async () => {
              const root = await ws.getExtendedMetadataAsync({
                id: `artist:${artist.id}`,
                index: 0,
                count: 100,
              });
              expect(root[0]).toEqual({
                getExtendedMetadataResult: {
                  count: "0",
                  index: "0",
                  total: "0",
                  relatedBrowse: [
                    {
                      id: `relatedArtists:${artist.id}`,
                      type: "RELATED_ARTISTS",
                    },
                  ],
                },
              });
            });
          });

          describe("when it has no similar artists", () => {
            const artist = anArtist({
              similarArtists: [],
              albums: [],
            });

            beforeEach(() => {
              musicService.hasArtists(artist);
            });

            it("should not return a RELATED_ARTISTS browse option", async () => {
              const root = await ws.getExtendedMetadataAsync({
                id: `artist:${artist.id}`,
                index: 0,
                count: 100,
              });
              expect(root[0]).toEqual({
                getExtendedMetadataResult: {
                  count: "0",
                  index: "0",
                  total: "0",
                },
              });
            });
          });
        });
      });
    });

    describe("getMediaURI", () => {
      const accessTokenMint = jest.fn();

      const server = makeServer(
        SONOS_DISABLED,
        service,
        rootUrl,
        musicService,
        linkCodes,
        ({
          mint: accessTokenMint,
        } as unknown) as AccessTokens
      );

      describe("when no credentials header provided", () => {
        it("should return a fault of LoginUnsupported", async () => {
          const ws = await createClientAsync(`${service.uri}?wsdl`, {
            endpoint: service.uri,
            httpClient: supersoap(server, rootUrl),
          });

          await ws
            .getMediaURIAsync({ id: "track:123" })
            .then(() => fail("shouldnt get here"))
            .catch((e: any) => {
              expect(e.root.Envelope.Body.Fault).toEqual({
                faultcode: "Client.LoginUnsupported",
                faultstring: "Missing credentials...",
              });
            });
        });
      });

      describe("when invalid credentials are provided", () => {
        it("should return a fault of LoginUnauthorized", async () => {
          const username = "userThatGetsDeleted";
          const password = "password1";
          musicService.hasUser({ username, password });
          const token = (await musicService.generateToken({
            username,
            password,
          })) as AuthSuccess;
          musicService.hasNoUsers();

          const ws = await createClientAsync(`${service.uri}?wsdl`, {
            endpoint: service.uri,
            httpClient: supersoap(server, rootUrl),
          });

          ws.addSoapHeader({ credentials: someCredentials(token.authToken) });
          await ws
            .getMediaURIAsync({ id: "track:123" })
            .then(() => fail("shouldnt get here"))
            .catch((e: any) => {
              expect(e.root.Envelope.Body.Fault).toEqual({
                faultcode: "Client.LoginUnauthorized",
                faultstring: "Credentials not found...",
              });
            });
        });
      });

      describe("when valid credentials are provided", () => {
        const username = "validUser";
        const password = "validPassword";
        let token: AuthSuccess;
        let ws: Client;
        const accessToken = "temporaryAccessToken";

        beforeEach(async () => {
          musicService.hasUser({ username, password });
          token = (await musicService.generateToken({
            username,
            password,
          })) as AuthSuccess;
          ws = await createClientAsync(`${service.uri}?wsdl`, {
            endpoint: service.uri,
            httpClient: supersoap(server, rootUrl),
          });
          ws.addSoapHeader({ credentials: someCredentials(token.authToken) });

          accessTokenMint.mockReturnValue(accessToken);
        });

        describe("asking for a URI to stream a track", () => {
          it("should return it with auth header", async () => {
            const trackId = uuid();

            const root = await ws.getMediaURIAsync({
              id: `track:${trackId}`,
            });
            expect(root[0]).toEqual({
              getMediaURIResult: `${rootUrl}/stream/track/${trackId}`,
              httpHeaders: {
                header: BONOB_ACCESS_TOKEN_HEADER,
                value: accessToken,
              },
            });
          });
        });
      });
    });

    describe("getMediaMetadata", () => {
      const server = makeServer(
        SONOS_DISABLED,
        service,
        rootUrl,
        musicService,
        linkCodes,
        accessTokens
      );

      describe("when no credentials header provided", () => {
        it("should return a fault of LoginUnsupported", async () => {
          const ws = await createClientAsync(`${service.uri}?wsdl`, {
            endpoint: service.uri,
            httpClient: supersoap(server, rootUrl),
          });

          await ws
            .getMediaMetadataAsync({ id: "track:123" })
            .then(() => fail("shouldnt get here"))
            .catch((e: any) => {
              expect(e.root.Envelope.Body.Fault).toEqual({
                faultcode: "Client.LoginUnsupported",
                faultstring: "Missing credentials...",
              });
            });
        });
      });

      describe("when invalid credentials are provided", () => {
        it("should return a fault of LoginUnauthorized", async () => {
          const username = "userThatGetsDeleted";
          const password = "password1";
          musicService.hasUser({ username, password });
          const token = (await musicService.generateToken({
            username,
            password,
          })) as AuthSuccess;
          musicService.hasNoUsers();

          const ws = await createClientAsync(`${service.uri}?wsdl`, {
            endpoint: service.uri,
            httpClient: supersoap(server, rootUrl),
          });

          ws.addSoapHeader({ credentials: someCredentials(token.authToken) });
          await ws
            .getMediaMetadataAsync({ id: "track:123" })
            .then(() => fail("shouldnt get here"))
            .catch((e: any) => {
              expect(e.root.Envelope.Body.Fault).toEqual({
                faultcode: "Client.LoginUnauthorized",
                faultstring: "Credentials not found...",
              });
            });
        });
      });

      describe("when valid credentials are provided", () => {
        const username = "validUser";
        const password = "validPassword";
        let token: AuthSuccess;
        let ws: Client;

        const album = anAlbum();
        const artist = anArtist({
          albums: [album],
        });
        const someTrack = aTrack();

        beforeEach(async () => {
          musicService.hasUser({ username, password });
          token = (await musicService.generateToken({
            username,
            password,
          })) as AuthSuccess;
          ws = await createClientAsync(`${service.uri}?wsdl`, {
            endpoint: service.uri,
            httpClient: supersoap(server, rootUrl),
          });
          ws.addSoapHeader({ credentials: someCredentials(token.authToken) });

          musicService.hasArtists(artist);
          musicService.hasTracks(someTrack);
        });

        describe("asking for media metadata for a track", () => {
          it("should return it with auth header", async () => {
            const root = await ws.getMediaMetadataAsync({
              id: `track:${someTrack.id}`,
            });
            expect(root[0]).toEqual({
              getMediaMetadataResult: track(
                rootUrl,
                accessTokens.mint(token.authToken),
                someTrack
              ),
            });
          });
        });
      });
    });
  });
});
