import crypto from "crypto";
import request from "supertest";
import { Client, createClientAsync } from "soap";
import { v4 as uuid } from "uuid";

import { DOMParserImpl } from "xmldom-ts";
import * as xpath from "xpath-ts";
import { randomInt } from "crypto";

import { LinkCodes } from "../src/link_codes";
import makeServer, { BONOB_ACCESS_TOKEN_HEADER } from "../src/server";
import { bonobService, SONOS_DISABLED } from "../src/sonos";
import {
  STRINGS_ROUTE,
  LOGIN_ROUTE,
  getMetadataResult,
  PRESENTATION_MAP_ROUTE,
  SONOS_RECOMMENDED_IMAGE_SIZES,
  track,
  artist,
  album,
  defaultAlbumArtURI,
  defaultArtistArtURI,
  searchResult,
} from "../src/smapi";

import {
  aService,
  getAppLinkMessage,
  anArtist,
  anAlbum,
  aTrack,
  someCredentials,
  POP,
  ROCK,
  TRIP_HOP,
  PUNK,
} from "./builders";
import { InMemoryMusicService } from "./in_memory_music_service";
import supersoap from "./supersoap";
import {
  albumToAlbumSummary,
  artistToArtistSummary,
  MusicService,
} from "../src/music_service";
import { AccessTokens } from "../src/access_tokens";
import dayjs from "dayjs";

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
      artist: someAlbum.artistName,
      artistId: someAlbum.artistId
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

describe("api", () => {
  const rootUrl = "http://localhost:1234";
  const service = bonobService("test-api", 133, rootUrl, "AppLink");
  const musicService = {
    generateToken: jest.fn(),
    login: jest.fn(),
  };
  const linkCodes = {
    mint: jest.fn(),
    has: jest.fn(),
    associate: jest.fn(),
    associationFor: jest.fn(),
  };
  const musicLibrary = {
    artists: jest.fn(),
    artist: jest.fn(),
    genres: jest.fn(),
    albums: jest.fn(),
    tracks: jest.fn(),
    track: jest.fn(),
    searchArtists: jest.fn(),
    searchAlbums: jest.fn(),
    searchTracks: jest.fn(),
  };
  const accessTokens = {
    mint: jest.fn(),
    authTokenFor: jest.fn(),
  };
  const clock = {
    now: jest.fn(),
  };

  const server = makeServer(
    SONOS_DISABLED,
    service,
    rootUrl,
    (musicService as unknown) as MusicService,
    (linkCodes as unknown) as LinkCodes,
    (accessTokens as unknown) as AccessTokens,
    clock
  );

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetAllMocks();
  });

  describe("pages", () => {
    describe(LOGIN_ROUTE, () => {
      describe("when the credentials are valid", () => {
        it("should return 200 ok and have associated linkCode with user", async () => {
          const username = "jane";
          const password = "password100";
          const linkCode = `linkCode-${uuid()}`;
          const authToken = {
            authToken: `authtoken-${uuid()}`,
            userId: `${username}-uid`,
            nickname: `${username}-nickname`,
          };

          linkCodes.has.mockReturnValue(true);
          musicService.generateToken.mockResolvedValue(authToken);
          linkCodes.associate.mockReturnValue(true);

          const res = await request(server)
            .post(LOGIN_ROUTE)
            .type("form")
            .send({ username, password, linkCode })
            .expect(200);

          expect(res.text).toContain("Login successful");

          expect(musicService.generateToken).toHaveBeenCalledWith({
            username,
            password,
          });
          expect(linkCodes.has).toHaveBeenCalledWith(linkCode);
          expect(linkCodes.associate).toHaveBeenCalledWith(linkCode, authToken);
        });
      });

      describe("when credentials are invalid", () => {
        it("should return 403 with message", async () => {
          const username = "userDoesntExist";
          const password = "password";
          const linkCode = uuid();
          const message = `Invalid user:${username}`;

          linkCodes.has.mockReturnValue(true);
          musicService.generateToken.mockResolvedValue({ message });

          const res = await request(server)
            .post(LOGIN_ROUTE)
            .type("form")
            .send({ username, password, linkCode })
            .expect(403);

          expect(res.text).toContain(`Login failed! ${message}`);
        });
      });

      describe("when linkCode is invalid", () => {
        it("should return 400 with message", async () => {
          const username = "jane";
          const password = "password100";
          const linkCode = "someLinkCodeThatDoesntExist";

          linkCodes.has.mockReturnValue(false);

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
      it("should do something", async () => {
        const ws = await createClientAsync(`${service.uri}?wsdl`, {
          endpoint: service.uri,
          httpClient: supersoap(server, rootUrl),
        });

        const linkCode = "theLinkCode8899";

        linkCodes.mint.mockReturnValue(linkCode);

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
      describe("when there is a linkCode association", () => {
        it("should return a device auth token", async () => {
          const linkCode = uuid();
          const association = {
            authToken: "authToken",
            userId: "uid",
            nickname: "nick",
          };
          linkCodes.associationFor.mockReturnValue(association);

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
          expect(linkCodes.associationFor).toHaveBeenCalledWith(linkCode);
        });
      });

      describe("when there is no linkCode association", () => {
        it("should return a device auth token", async () => {
          const linkCode = "invalidLinkCode";
          linkCodes.associationFor.mockReturnValue(undefined);

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

    describe("getLastUpdate", () => {
      it("should return a result with some timestamps", async () => {
        const now = dayjs();
        clock.now.mockReturnValue(now);

        const ws = await createClientAsync(`${service.uri}?wsdl`, {
          endpoint: service.uri,
          httpClient: supersoap(server, rootUrl),
        });

        const result = await ws.getLastUpdateAsync({});

        expect(result[0]).toEqual({
          getLastUpdateResult: {
            favorites: `${now.unix()}`,
            catalog: `${now.unix()}`,
            pollInterval: 120,
          },
        });
      });
    });

    describe("search", () => {
      describe("when no credentials header provided", () => {
        it("should return a fault of LoginUnsupported", async () => {
          const ws = await createClientAsync(`${service.uri}?wsdl`, {
            endpoint: service.uri,
            httpClient: supersoap(server, rootUrl),
          });

          await ws
            .getMetadataAsync({ id: "search", index: 0, count: 0 })
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
          musicService.login.mockRejectedValue("fail!");

          const ws = await createClientAsync(`${service.uri}?wsdl`, {
            endpoint: service.uri,
            httpClient: supersoap(server, rootUrl),
          });

          ws.addSoapHeader({ credentials: someCredentials("someAuthToken") });
          await ws
            .getMetadataAsync({ id: "search", index: 0, count: 0 })
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
        const authToken = `authToken-${uuid()}`;
        const accessToken = `accessToken-${uuid()}`;
        let ws: Client;

        beforeEach(async () => {
          musicService.login.mockResolvedValue(musicLibrary);
          accessTokens.mint.mockReturnValue(accessToken);

          ws = await createClientAsync(`${service.uri}?wsdl`, {
            endpoint: service.uri,
            httpClient: supersoap(server, rootUrl),
          });
          ws.addSoapHeader({ credentials: someCredentials(authToken) });
        });

        describe("searching for albums", () => {
          const album1 = anAlbum();
          const album2 = anAlbum();
          const albums = [album1, album2];

          beforeEach(() => {
            musicLibrary.searchAlbums.mockResolvedValue([
              albumToAlbumSummary(album1),
              albumToAlbumSummary(album2),
            ]);
          });

          it("should return the albums", async () => {
            const term = "whoop";

            const result = await ws.searchAsync({
              id: "albums",
              term,
            });
            expect(result[0]).toEqual(
              searchResult({
                mediaCollection: albums.map((it) =>
                  album(rootUrl, accessToken, albumToAlbumSummary(it))
                ),
                index: 0,
                total: 2,
              })
            );
            expect(musicLibrary.searchAlbums).toHaveBeenCalledWith(term);
          });
        });

        describe("searching for artists", () => {
          const artist1 = anArtist();
          const artist2 = anArtist();
          const artists = [artist1, artist2];

          beforeEach(() => {
            musicLibrary.searchArtists.mockResolvedValue([
              artistToArtistSummary(artist1),
              artistToArtistSummary(artist2),
            ]);
          });

          it("should return the artists", async () => {
            const term = "whoopie";

            const result = await ws.searchAsync({
              id: "artists",
              term,
            });
            expect(result[0]).toEqual(
              searchResult({
                mediaCollection: artists.map((it) =>
                  artist(rootUrl, accessToken, artistToArtistSummary(it))
                ),
                index: 0,
                total: 2,
              })
            );
            expect(musicLibrary.searchArtists).toHaveBeenCalledWith(term);
          });
        });

        describe("searching for tracks", () => {
          const track1 = aTrack();
          const track2 = aTrack();
          const tracks = [track1, track2];

          beforeEach(() => {
            musicLibrary.searchTracks.mockResolvedValue([track1, track2]);
          });

          it("should return the tracks", async () => {
            const term = "whoopie";

            const result = await ws.searchAsync({
              id: "tracks",
              term,
            });
            expect(result[0]).toEqual(
              searchResult({
                mediaCollection: tracks.map((it) => album(rootUrl, accessToken, it.album)),
                index: 0,
                total: 2,
              })
            );
            expect(musicLibrary.searchTracks).toHaveBeenCalledWith(term);
          });
        });
      });
    });

    describe("getMetadata", () => {
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
          musicService.login.mockRejectedValue("fail!");

          const ws = await createClientAsync(`${service.uri}?wsdl`, {
            endpoint: service.uri,
            httpClient: supersoap(server, rootUrl),
          });

          ws.addSoapHeader({ credentials: someCredentials("someAuthToken") });
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
        const authToken = `authToken-${uuid()}`;
        const accessToken = `accessToken-${uuid()}`;
        let ws: Client;

        beforeEach(async () => {
          musicService.login.mockResolvedValue(musicLibrary);
          accessTokens.mint.mockReturnValue(accessToken);

          ws = await createClientAsync(`${service.uri}?wsdl`, {
            endpoint: service.uri,
            httpClient: supersoap(server, rootUrl),
          });
          ws.addSoapHeader({ credentials: someCredentials(authToken) });
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
                  { itemType: "albumList", id: "albums", title: "Albums" },
                  { itemType: "container", id: "genres", title: "Genres" },
                  {
                    itemType: "albumList",
                    id: "randomAlbums",
                    title: "Random",
                  },
                  {
                    itemType: "albumList",
                    id: "starredAlbums",
                    title: "Starred",
                  },
                  {
                    itemType: "albumList",
                    id: "recentlyAdded",
                    title: "Recently Added",
                  },
                  {
                    itemType: "albumList",
                    id: "recentlyPlayed",
                    title: "Recently Played",
                  },
                  {
                    itemType: "albumList",
                    id: "mostPlayed",
                    title: "Most Played",
                  },
                ],
                index: 0,
                total: 8,
              })
            );
          });
        });

        describe("asking for the search container", () => {
          it("should return it", async () => {
            const root = await ws.getMetadataAsync({
              id: "search",
              index: 0,
              count: 100,
            });
            expect(root[0]).toEqual(
              getMetadataResult({
                mediaCollection: [
                  { itemType: "search", id: "artists", title: "Artists" },
                  { itemType: "search", id: "albums", title: "Albums" },
                  { itemType: "search", id: "tracks", title: "Tracks" },
                ],
                index: 0,
                total: 3,
              })
            );
          });
        });

        describe("asking for a genres", () => {
          const expectedGenres = [POP, PUNK, ROCK, TRIP_HOP];

          beforeEach(() => {
            musicLibrary.genres.mockResolvedValue(expectedGenres);
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
            musicLibrary.artist.mockResolvedValue(artistWithManyAlbums);
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
                    artistId: it.artistId,
                    artist: it.artistName
                  })),
                  index: 0,
                  total: artistWithManyAlbums.albums.length,
                })
              );
              expect(musicLibrary.artist).toHaveBeenCalledWith(
                artistWithManyAlbums.id
              );
              expect(accessTokens.mint).toHaveBeenCalledWith(authToken);
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
                    artistId: it.artistId,
                    artist: it.artistName
                  })),
                  index: 2,
                  total: artistWithManyAlbums.albums.length,
                })
              );
              expect(musicLibrary.artist).toHaveBeenCalledWith(
                artistWithManyAlbums.id
              );
              expect(accessTokens.mint).toHaveBeenCalledWith(authToken);
            });
          });
        });

        describe("asking for artists", () => {
          const artistSummaries = [
            anArtist(),
            anArtist(),
            anArtist(),
            anArtist(),
            anArtist(),
          ].map(artistToArtistSummary);

          describe("asking for all artists", () => {
            it("should return them all", async () => {
              const index = 0;
              const count = 100;

              musicLibrary.artists.mockResolvedValue({
                results: artistSummaries,
                total: artistSummaries.length,
              });

              const result = await ws.getMetadataAsync({
                id: "artists",
                index,
                count,
              });

              expect(result[0]).toEqual(
                getMetadataResult({
                  mediaCollection: artistSummaries.map((it) => ({
                    itemType: "artist",
                    id: `artist:${it.id}`,
                    artistId: it.id,
                    title: it.name,
                    albumArtURI: defaultArtistArtURI(rootUrl, accessToken, it),
                  })),
                  index: 0,
                  total: artistSummaries.length,
                })
              );
              expect(musicLibrary.artists).toHaveBeenCalledWith({
                _index: index,
                _count: count,
              });
              expect(accessTokens.mint).toHaveBeenCalledWith(authToken);
            });
          });

          describe("asking for a page of artists", () => {
            const index = 1;
            const count = 3;

            it("should return it", async () => {
              const someArtists = [
                artistSummaries[1]!,
                artistSummaries[2]!,
                artistSummaries[3]!,
              ];
              musicLibrary.artists.mockResolvedValue({
                results: someArtists,
                total: artistSummaries.length,
              });

              const result = await ws.getMetadataAsync({
                id: "artists",
                index,
                count,
              });

              expect(result[0]).toEqual(
                getMetadataResult({
                  mediaCollection: someArtists.map((it) => ({
                    itemType: "artist",
                    id: `artist:${it.id}`,
                    artistId: it.id,
                    title: it.name,
                    albumArtURI: defaultArtistArtURI(rootUrl, accessToken, it),
                  })),
                  index: 1,
                  total: artistSummaries.length,
                })
              );
              expect(musicLibrary.artists).toHaveBeenCalledWith({
                _index: index,
                _count: count,
              });
              expect(accessTokens.mint).toHaveBeenCalledWith(authToken);
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
              musicLibrary.artist.mockResolvedValue(artist);
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
                expect(musicLibrary.artist).toHaveBeenCalledWith(artist.id);
                expect(accessTokens.mint).toHaveBeenCalledWith(authToken);
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
                expect(musicLibrary.artist).toHaveBeenCalledWith(artist.id);
                expect(accessTokens.mint).toHaveBeenCalledWith(authToken);
              });
            });
          });

          describe("when the artist has none", () => {
            const artist = anArtist({ similarArtists: [] });

            beforeEach(() => {
              musicLibrary.artist.mockResolvedValue(artist);
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
              expect(musicLibrary.artist).toHaveBeenCalledWith(artist.id);
              expect(accessTokens.mint).toHaveBeenCalledWith(authToken);
            });
          });
        });

        describe("asking for albums", () => {
          const pop1 = anAlbum({ genre: POP });
          const pop2 = anAlbum({ genre: POP });
          const pop3 = anAlbum({ genre: POP });
          const pop4 = anAlbum({ genre: POP });
          const rock1 = anAlbum({ genre: ROCK });
          const rock2 = anAlbum({ genre: ROCK });

          const allAlbums = [pop1, pop2, pop3, pop4, rock1, rock2];
          const popAlbums = [pop1, pop2, pop3, pop4];

          describe("asking for random albums", () => {
            const randomAlbums = [pop2, rock1, pop1];

            beforeEach(() => {
              musicLibrary.albums.mockResolvedValue({
                results: randomAlbums,
                total: allAlbums.length,
              });
            });

            it("should return some", async () => {
              const paging = {
                index: 0,
                count: 100,
              };

              const result = await ws.getMetadataAsync({
                id: "randomAlbums",
                ...paging,
              });

              expect(result[0]).toEqual(
                getMetadataResult({
                  mediaCollection: randomAlbums.map((it) => ({
                    itemType: "album",
                    id: `album:${it.id}`,
                    title: it.name,
                    albumArtURI: defaultAlbumArtURI(rootUrl, accessToken, it),
                    canPlay: true,
                    artistId: it.artistId,
                    artist: it.artistName
                  })),
                  index: 0,
                  total: 6,
                })
              );

              expect(musicLibrary.albums).toHaveBeenCalledWith({
                type: "random",
                _index: paging.index,
                _count: paging.count,
              });
            });
          });

          describe("asking for starred albums", () => {
            const albums = [rock2, rock1, pop2];

            beforeEach(() => {
              musicLibrary.albums.mockResolvedValue({
                results: albums,
                total: allAlbums.length,
              });
            });

            it("should return some", async () => {
              const paging = {
                index: 0,
                count: 100,
              };

              const result = await ws.getMetadataAsync({
                id: "starredAlbums",
                ...paging,
              });

              expect(result[0]).toEqual(
                getMetadataResult({
                  mediaCollection: albums.map((it) => ({
                    itemType: "album",
                    id: `album:${it.id}`,
                    title: it.name,
                    albumArtURI: defaultAlbumArtURI(rootUrl, accessToken, it),
                    canPlay: true,
                    artistId: it.artistId,
                    artist: it.artistName
                  })),
                  index: 0,
                  total: 6,
                })
              );

              expect(musicLibrary.albums).toHaveBeenCalledWith({
                type: "starred",
                _index: paging.index,
                _count: paging.count,
              });
            });
          });

          describe("asking for recently played albums", () => {
            const recentlyPlayed = [rock2, rock1, pop2];

            beforeEach(() => {
              musicLibrary.albums.mockResolvedValue({
                results: recentlyPlayed,
                total: allAlbums.length,
              });
            });

            it("should return some", async () => {
              const paging = {
                index: 0,
                count: 100,
              };

              const result = await ws.getMetadataAsync({
                id: "recentlyPlayed",
                ...paging,
              });

              expect(result[0]).toEqual(
                getMetadataResult({
                  mediaCollection: recentlyPlayed.map((it) => ({
                    itemType: "album",
                    id: `album:${it.id}`,
                    title: it.name,
                    albumArtURI: defaultAlbumArtURI(rootUrl, accessToken, it),
                    canPlay: true,
                    artistId: it.artistId,
                    artist: it.artistName
                  })),
                  index: 0,
                  total: 6,
                })
              );

              expect(musicLibrary.albums).toHaveBeenCalledWith({
                type: "recent",
                _index: paging.index,
                _count: paging.count,
              });
            });
          });

          describe("asking for most played albums", () => {
            const mostPlayed = [rock2, rock1, pop2];

            beforeEach(() => {
              musicLibrary.albums.mockResolvedValue({
                results: mostPlayed,
                total: allAlbums.length,
              });
            });

            it("should return some", async () => {
              const paging = {
                index: 0,
                count: 100,
              };

              const result = await ws.getMetadataAsync({
                id: "mostPlayed",
                ...paging,
              });

              expect(result[0]).toEqual(
                getMetadataResult({
                  mediaCollection: mostPlayed.map((it) => ({
                    itemType: "album",
                    id: `album:${it.id}`,
                    title: it.name,
                    albumArtURI: defaultAlbumArtURI(rootUrl, accessToken, it),
                    canPlay: true,
                    artistId: it.artistId,
                    artist: it.artistName
                  })),
                  index: 0,
                  total: 6,
                })
              );

              expect(musicLibrary.albums).toHaveBeenCalledWith({
                type: "frequent",
                _index: paging.index,
                _count: paging.count,
              });
            });
          });

          describe("asking for recently added albums", () => {
            const recentlyAdded = [pop4, pop3, pop2];

            beforeEach(() => {
              musicLibrary.albums.mockResolvedValue({
                results: recentlyAdded,
                total: allAlbums.length,
              });
            });

            it("should return some", async () => {
              const paging = {
                index: 0,
                count: 100,
              };

              const result = await ws.getMetadataAsync({
                id: "recentlyAdded",
                ...paging,
              });

              expect(result[0]).toEqual(
                getMetadataResult({
                  mediaCollection: recentlyAdded.map((it) => ({
                    itemType: "album",
                    id: `album:${it.id}`,
                    title: it.name,
                    albumArtURI: defaultAlbumArtURI(rootUrl, accessToken, it),
                    canPlay: true,
                    artistId: it.artistId,
                    artist: it.artistName
                  })),
                  index: 0,
                  total: 6,
                })
              );

              expect(musicLibrary.albums).toHaveBeenCalledWith({
                type: "newest",
                _index: paging.index,
                _count: paging.count,
              });
            });
          });

          describe("asking for all albums", () => {
            beforeEach(() => {
              musicLibrary.albums.mockResolvedValue({
                results: allAlbums,
                total: allAlbums.length,
              });
            });

            it("should return them all", async () => {
              const paging = {
                index: 0,
                count: 100,
              };

              const result = await ws.getMetadataAsync({
                id: "albums",
                ...paging,
              });

              expect(result[0]).toEqual(
                getMetadataResult({
                  mediaCollection: allAlbums.map((it) => ({
                    itemType: "album",
                    id: `album:${it.id}`,
                    title: it.name,
                    albumArtURI: defaultAlbumArtURI(rootUrl, accessToken, it),
                    canPlay: true,
                    artistId: it.artistId,
                    artist: it.artistName
                  })),
                  index: 0,
                  total: 6,
                })
              );

              expect(musicLibrary.albums).toHaveBeenCalledWith({
                type: "alphabeticalByArtist",
                _index: paging.index,
                _count: paging.count,
              });
            });
          });

          describe("asking for a page of albums", () => {
            const pageOfAlbums = [pop3, pop4, rock1];

            it("should return only that page", async () => {
              const paging = {
                index: 2,
                count: 3,
              };

              musicLibrary.albums.mockResolvedValue({
                results: pageOfAlbums,
                total: allAlbums.length,
              });

              const result = await ws.getMetadataAsync({
                id: "albums",
                ...paging,
              });

              expect(result[0]).toEqual(
                getMetadataResult({
                  mediaCollection: pageOfAlbums.map((it) => ({
                    itemType: "album",
                    id: `album:${it.id}`,
                    title: it.name,
                    albumArtURI: defaultAlbumArtURI(rootUrl, accessToken, it),
                    canPlay: true,
                    artistId: it.artistId,
                    artist: it.artistName
                  })),
                  index: 2,
                  total: 6,
                })
              );

              expect(musicLibrary.albums).toHaveBeenCalledWith({
                type: "alphabeticalByArtist",
                _index: paging.index,
                _count: paging.count,
              });
            });
          });

          describe("asking for all albums for a genre", () => {
            it("should return albums for the genre", async () => {
              const paging = {
                index: 0,
                count: 100,
              };

              musicLibrary.albums.mockResolvedValue({
                results: popAlbums,
                total: popAlbums.length,
              });

              const result = await ws.getMetadataAsync({
                id: `genre:${POP.id}`,
                ...paging,
              });

              expect(result[0]).toEqual(
                getMetadataResult({
                  mediaCollection: [pop1, pop2, pop3, pop4].map((it) => ({
                    itemType: "album",
                    id: `album:${it.id}`,
                    title: it.name,
                    albumArtURI: defaultAlbumArtURI(rootUrl, accessToken, it),
                    canPlay: true,
                    artistId: it.artistId,
                    artist: it.artistName
                  })),
                  index: 0,
                  total: 4,
                })
              );

              expect(musicLibrary.albums).toHaveBeenCalledWith({
                type: "byGenre",
                genre: POP.id,
                _index: paging.index,
                _count: paging.count,
              });
            });
          });

          describe("asking for a page of albums for a genre", () => {
            const pageOfPop = [pop1, pop2];

            it("should return albums for the genre", async () => {
              const paging = {
                index: 0,
                count: 2,
              };

              musicLibrary.albums.mockResolvedValue({
                results: pageOfPop,
                total: popAlbums.length,
              });

              const result = await ws.getMetadataAsync({
                id: `genre:${POP.id}`,
                ...paging,
              });

              expect(result[0]).toEqual(
                getMetadataResult({
                  mediaCollection: pageOfPop.map((it) => ({
                    itemType: "album",
                    id: `album:${it.id}`,
                    title: it.name,
                    albumArtURI: defaultAlbumArtURI(rootUrl, accessToken, it),
                    canPlay: true,
                    artistId: it.artistId,
                    artist: it.artistName
                  })),
                  index: 0,
                  total: 4,
                })
              );

              expect(musicLibrary.albums).toHaveBeenCalledWith({
                type: "byGenre",
                genre: POP.id,
                _index: paging.index,
                _count: paging.count,
              });
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

            const tracks = [track1, track2, track3, track4, track5];

            beforeEach(() => {
              musicLibrary.tracks.mockResolvedValue(tracks);
            });

            describe("asking for all for an album", () => {
              it("should return them all", async () => {
                const paging = {
                  index: 0,
                  count: 100,
                };

                const result = await ws.getMetadataAsync({
                  id: `album:${album.id}`,
                  ...paging,
                });

                expect(result[0]).toEqual(
                  getMetadataResult({
                    mediaMetadata: tracks.map((it) =>
                      track(rootUrl, accessToken, it)
                    ),
                    index: 0,
                    total: tracks.length,
                  })
                );
                expect(musicLibrary.tracks).toHaveBeenCalledWith(album.id);
              });
            });

            describe("asking for a single page of tracks", () => {
              const pageOfTracks = [track3, track4];

              it("should return only that page", async () => {
                const paging = {
                  index: 2,
                  count: 2,
                };

                const result = await ws.getMetadataAsync({
                  id: `album:${album.id}`,
                  ...paging,
                });

                expect(result[0]).toEqual(
                  getMetadataResult({
                    mediaMetadata: pageOfTracks.map((it) =>
                      track(rootUrl, accessToken, it)
                    ),
                    index: paging.index,
                    total: tracks.length,
                  })
                );
                expect(musicLibrary.tracks).toHaveBeenCalledWith(album.id);
              });
            });
          });
        });
      });
    });

    describe("getExtendedMetadata", () => {
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
          musicService.login.mockRejectedValue("booom!");

          const ws = await createClientAsync(`${service.uri}?wsdl`, {
            endpoint: service.uri,
            httpClient: supersoap(server, rootUrl),
          });

          ws.addSoapHeader({ credentials: someCredentials("someAuthToken") });
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
        let ws: Client;
        const authToken = `authToken-${uuid()}`;
        const accessToken = `accessToken-${uuid()}`;

        beforeEach(async () => {
          musicService.login.mockResolvedValue(musicLibrary);
          accessTokens.mint.mockReturnValue(accessToken);

          ws = await createClientAsync(`${service.uri}?wsdl`, {
            endpoint: service.uri,
            httpClient: supersoap(server, rootUrl),
          });
          ws.addSoapHeader({ credentials: someCredentials(authToken) });
        });

        describe("asking for an artist", () => {
          describe("when it has some albums", () => {
            const album1 = anAlbum();
            const album2 = anAlbum();
            const album3 = anAlbum();

            const artist = anArtist({
              similarArtists: [],
              albums: [album1, album2, album3],
            });

            beforeEach(() => {
              musicLibrary.artist.mockResolvedValue(artist);
            });

            describe("when all albums fit on a page", () => {
              it("should return the albums", async () => {
                const paging = {
                  index: 0,
                  count: 100,
                };

                const root = await ws.getExtendedMetadataAsync({
                  id: `artist:${artist.id}`,
                  ...paging,
                });

                expect(root[0]).toEqual({
                  getExtendedMetadataResult: {
                    count: "3",
                    index: "0",
                    total: "3",
                    mediaCollection: artist.albums.map((it) =>
                      album(rootUrl, accessToken, it)
                    ),
                  },
                });
              });
            });

            describe("getting a page of albums", () => {
              it("should return only that page", async () => {
                const paging = {
                  index: 1,
                  count: 2,
                };

                const root = await ws.getExtendedMetadataAsync({
                  id: `artist:${artist.id}`,
                  ...paging,
                });

                expect(root[0]).toEqual({
                  getExtendedMetadataResult: {
                    count: "2",
                    index: "1",
                    total: "3",
                    mediaCollection: [album2, album3].map((it) =>
                      album(rootUrl, accessToken, it)
                    ),
                  },
                });
              });
            });
          });

          describe("when it has similar artists", () => {
            const similar1 = anArtist();
            const similar2 = anArtist();

            const artist = anArtist({
              similarArtists: [similar1, similar2],
              albums: [],
            });

            beforeEach(() => {
              musicLibrary.artist.mockResolvedValue(artist);
            });

            it("should return a RELATED_ARTISTS browse option", async () => {
              const paging = {
                index: 0,
                count: 100,
              };

              const root = await ws.getExtendedMetadataAsync({
                id: `artist:${artist.id}`,
                ...paging,
              });

              expect(root[0]).toEqual({
                getExtendedMetadataResult: {
                  // artist has no albums
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
              musicLibrary.artist.mockResolvedValue(artist);
            });

            it("should not return a RELATED_ARTISTS browse option", async () => {
              const root = await ws.getExtendedMetadataAsync({
                id: `artist:${artist.id}`,
                index: 0,
                count: 100,
              });
              expect(root[0]).toEqual({
                getExtendedMetadataResult: {
                  // artist has no albums
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
          musicService.login.mockRejectedValue("Credentials not found");

          const ws = await createClientAsync(`${service.uri}?wsdl`, {
            endpoint: service.uri,
            httpClient: supersoap(server, rootUrl),
          });

          ws.addSoapHeader({ credentials: someCredentials("invalid token") });
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
        const authToken = `authToken-${uuid()}`;
        let ws: Client;
        const accessToken = `temporaryAccessToken-${uuid()}`;

        beforeEach(async () => {
          musicService.login.mockResolvedValue(musicLibrary);
          accessTokens.mint.mockReturnValue(accessToken);

          ws = await createClientAsync(`${service.uri}?wsdl`, {
            endpoint: service.uri,
            httpClient: supersoap(server, rootUrl),
          });
          ws.addSoapHeader({ credentials: someCredentials(authToken) });
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

            expect(musicService.login).toHaveBeenCalledWith(authToken);
            expect(accessTokens.mint).toHaveBeenCalledWith(authToken);
          });
        });
      });
    });

    describe("getMediaMetadata", () => {
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
          musicService.login.mockRejectedValue("Credentials not found!!");

          const ws = await createClientAsync(`${service.uri}?wsdl`, {
            endpoint: service.uri,
            httpClient: supersoap(server, rootUrl),
          });

          ws.addSoapHeader({
            credentials: someCredentials("some invalid token"),
          });
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
        const authToken = `authToken-${uuid()}`;
        const accessToken = `accessToken-${uuid()}`;
        let ws: Client;

        const someTrack = aTrack();

        beforeEach(async () => {
          musicService.login.mockResolvedValue(musicLibrary);
          accessTokens.mint.mockReturnValue(accessToken);
          musicLibrary.track.mockResolvedValue(someTrack);

          ws = await createClientAsync(`${service.uri}?wsdl`, {
            endpoint: service.uri,
            httpClient: supersoap(server, rootUrl),
          });
          ws.addSoapHeader({ credentials: someCredentials(authToken) });
        });

        describe("asking for media metadata for a track", () => {
          it("should return it with auth header", async () => {
            const root = await ws.getMediaMetadataAsync({
              id: `track:${someTrack.id}`,
            });

            expect(root[0]).toEqual({
              getMediaMetadataResult: track(rootUrl, accessToken, someTrack),
            });
            expect(musicService.login).toHaveBeenCalledWith(authToken);
            expect(accessTokens.mint).toHaveBeenCalledWith(authToken);
            expect(musicLibrary.track).toHaveBeenCalledWith(someTrack.id);
          });
        });
      });
    });
  });
});
