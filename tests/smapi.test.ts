import crypto from "crypto";
import request from "supertest";
import { Client, createClientAsync } from "soap";
import { v4 as uuid } from "uuid";

import { DOMParserImpl } from "xmldom-ts";
import * as xpath from "xpath-ts";
import { randomInt } from "crypto";

import { LinkCodes } from "../src/link_codes";
import makeServer from "../src/server";
import { bonobService, SONOS_DISABLED, SONOS_LANG } from "../src/sonos";
import {
  STRINGS_ROUTE,
  getMetadataResult,
  PRESENTATION_MAP_ROUTE,
  SONOS_RECOMMENDED_IMAGE_SIZES,
  track,
  artist,
  album,
  defaultAlbumArtURI,
  defaultArtistArtURI,
  searchResult,
  iconArtURI,
  playlistAlbumArtURL,
  sonosifyMimeType,
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
  aPlaylist,
} from "./builders";
import { InMemoryMusicService } from "./in_memory_music_service";
import supersoap from "./supersoap";
import {
  albumToAlbumSummary,
  artistToArtistSummary,
  MusicService,
  playlistToPlaylistSummary,
} from "../src/music_service";
import { AccessTokens } from "../src/access_tokens";
import dayjs from "dayjs";
import url, { URLBuilder } from "../src/url_builder";
import { iconForGenre } from "../src/icon";

const parseXML = (value: string) => new DOMParserImpl().parseFromString(value);

describe("service config", () => {
  const bonobWithNoContextPath = url("http://localhost:1234");
  const bonobWithContextPath = url("http://localhost:5678/some-context-path");

  [bonobWithNoContextPath, bonobWithContextPath].forEach((bonobUrl) => {
    describe(bonobUrl.href(), () => {
      const server = makeServer(
        SONOS_DISABLED,
        aService({ name: "music land" }),
        bonobUrl,
        new InMemoryMusicService()
      );

      const stringsUrl = bonobUrl.append({ pathname: STRINGS_ROUTE });
      const presentationUrl = bonobUrl.append({
        pathname: PRESENTATION_MAP_ROUTE,
      });

      describe(STRINGS_ROUTE, () => {
        async function fetchStringsXml() {
          const res = await request(server).get(stringsUrl.path()).send();

          expect(res.status).toEqual(200);

          // removing the sonos xml ns as makes xpath queries with xpath-ts painful
          return parseXML(
            res.text.replace('xmlns="http://sonos.com/sonosapi"', "")
          );
        }

        it("should return xml for the strings", async () => {
          const xml = await fetchStringsXml();

          const sonosString = (id: string, lang: string) =>
            xpath.select(
              `string(/stringtables/stringtable[@xml:lang="${lang}"]/string[@stringId="${id}"])`,
              xml
            );

          expect(sonosString("AppLinkMessage", "en-US")).toEqual(
            "Linking sonos with music land"
          );
          expect(sonosString("AppLinkMessage", "nl-NL")).toEqual(
            "Sonos koppelen aan music land"
          );

          // no fr-FR translation, so use en-US
          expect(sonosString("AppLinkMessage", "fr-FR")).toEqual(
            "Linking sonos with music land"
          );
        });

        it("should return a section for all sonos supported languages", async () => {
          const xml = await fetchStringsXml();
          SONOS_LANG.forEach((lang) => {
            expect(
              xpath.select(
                `string(/stringtables/stringtable[@xml:lang="${lang}"]/string[@stringId="AppLinkMessage"])`,
                xml
              )
            ).toBeDefined();
          });
        });
      });

      describe(PRESENTATION_MAP_ROUTE, () => {
        it("should have an ArtWorkSizeMap for all sizes recommended by sonos", async () => {
          const res = await request(server).get(presentationUrl.path()).send();

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
            expect(imageSizeMap(size)).toEqual(`/size/${size}`);
          });
        });

        it("should have an BrowseIconSizeMap for all sizes recommended by sonos", async () => {
          const res = await request(server).get(presentationUrl.path()).send();

          expect(res.status).toEqual(200);

          // removing the sonos xml ns as makes xpath queries with xpath-ts painful
          const xml = parseXML(
            res.text.replace('xmlns="http://sonos.com/sonosapi"', "")
          );

          const imageSizeMap = (size: string) =>
            xpath.select(
              `string(/Presentation/PresentationMap[@type="BrowseIconSizeMap"]/Match/browseIconSizeMap/sizeEntry[@size="${size}"]/@substitution)`,
              xml
            );

          SONOS_RECOMMENDED_IMAGE_SIZES.forEach((size) => {
            expect(imageSizeMap(size)).toEqual(`/size/${size}`);
          });
        });
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
    const bonobUrl = url("http://localhost:4567/foo?access-token=1234");
    const someTrack = aTrack({
      id: uuid(),
      // audio/x-flac should be mapped to audio/flac
      mimeType: "audio/x-flac",
      name: "great song",
      duration: randomInt(1000),
      number: randomInt(100),
      album: anAlbum({
        name: "great album",
        id: uuid(),
        genre: { id: "genre101", name: "some genre" },
      }),
      artist: anArtist({ name: "great artist", id: uuid() }),
      coverArt:"coverArt:887766"
    });

    expect(track(bonobUrl, someTrack)).toEqual({
      itemType: "track",
      id: `track:${someTrack.id}`,
      mimeType: 'audio/flac',
      title: someTrack.name,

      trackMetadata: {
        album: someTrack.album.name,
        albumId: `album:${someTrack.album.id}`,
        albumArtist: someTrack.artist.name,
        albumArtistId: `artist:${someTrack.artist.id}`,
        albumArtURI: `http://localhost:4567/foo/art/${someTrack.coverArt}/size/180?access-token=1234`,
        artist: someTrack.artist.name,
        artistId: `artist:${someTrack.artist.id}`,
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
    const bonobUrl = url("http://localhost:9988/some-context-path?s=hello");
    const someAlbum = anAlbum({ id: "id123", name: "What a great album" });

    expect(album(bonobUrl, someAlbum)).toEqual({
      itemType: "album",
      id: `album:${someAlbum.id}`,
      title: someAlbum.name,
      albumArtURI: defaultAlbumArtURI(bonobUrl, someAlbum).href(),
      canPlay: true,
      artist: someAlbum.artistName,
      artistId: `artist:${someAlbum.artistId}`,
    });
  });
});

describe("sonosifyMimeType", () => {
  describe("when is audio/x-flac", () => {
    it("should be mapped to audio/flac", () => {
      expect(sonosifyMimeType("audio/x-flac")).toEqual("audio/flac");
    });
  });

  describe("when it is not audio/x-flac", () => {
    it("should be returned as is", () => {
      expect(sonosifyMimeType("audio/flac")).toEqual("audio/flac");
      expect(sonosifyMimeType("audio/mpeg")).toEqual("audio/mpeg");
      expect(sonosifyMimeType("audio/whoop")).toEqual("audio/whoop");
    });
  });
});

describe("playlistAlbumArtURL", () => {
  describe("when the playlist has no coverArt ids", () => {
    it("should return question mark icon", () => {
      const bonobUrl = url("http://localhost:1234/context-path?search=yes");
      const playlist = aPlaylist({
        entries: [aTrack({ coverArt: undefined }), aTrack({ coverArt: undefined })],
      });

      expect(playlistAlbumArtURL(bonobUrl, playlist).href()).toEqual(
        `http://localhost:1234/context-path/icon/error/size/legacy?search=yes`
      );
    });
  });

  describe("when the playlist has 2 distinct coverArt ids", () => {
    it("should return them on the url to the image", () => {
      const bonobUrl = url("http://localhost:1234/context-path?search=yes");
      const playlist = aPlaylist({
        entries: [
          aTrack({ coverArt: "1" }),
          aTrack({ coverArt: "2" }),
          aTrack({ coverArt: "1" }),
          aTrack({ coverArt: "2" }),
        ],
      });

      expect(playlistAlbumArtURL(bonobUrl, playlist).href()).toEqual(
        `http://localhost:1234/context-path/art/1&2/size/180?search=yes`
      );
    });
  });

  describe("when the playlist has 4 distinct albumIds", () => {
    it("should return them on the url to the image", () => {
      const bonobUrl = url("http://localhost:1234/context-path?search=yes");
      const playlist = aPlaylist({
        entries: [
          aTrack({ coverArt: "1" }),
          aTrack({ coverArt: "2" }),
          aTrack({ coverArt: "2" }),
          aTrack({ coverArt: "3" }),
          aTrack({ coverArt: "4" }),
        ],
      });

      expect(playlistAlbumArtURL(bonobUrl, playlist).href()).toEqual(
        `http://localhost:1234/context-path/art/1&2&3&4/size/180?search=yes`
      );
    });
  });

  describe("when the playlist has at least 9 distinct albumIds", () => {
    it("should return the first 9 of the ids on the url", () => {
      const bonobUrl = url("http://localhost:1234/context-path?search=yes");
      const playlist = aPlaylist({
        entries: [
          aTrack({ coverArt: "1" }),
          aTrack({ coverArt: "2" }),
          aTrack({ coverArt: "2" }),
          aTrack({ coverArt: "2" }),
          aTrack({ coverArt: "3" }),
          aTrack({ coverArt: "4" }),
          aTrack({ coverArt: "5" }),
          aTrack({ coverArt: "6" }),
          aTrack({ coverArt: "7" }),
          aTrack({ coverArt: "8" }),
          aTrack({ coverArt: "9" }),
          aTrack({ coverArt: "10" }),
          aTrack({ coverArt: "11" }),
        ],
      });

      expect(playlistAlbumArtURL(bonobUrl, playlist).href()).toEqual(
        `http://localhost:1234/context-path/art/1&2&3&4&5&6&7&8&9/size/180?search=yes`
      );
    });
  });
});

describe("defaultAlbumArtURI", () => {
  const bonobUrl = new URLBuilder("http://bonob.example.com:8080/context?search=yes");

  describe("when there is an album coverArt", () => {
    it("should use it in the image url", () => {
      expect(
        defaultAlbumArtURI(
          bonobUrl,
          anAlbum({ coverArt: "coverArt:123" })
        ).href()
      ).toEqual(
        "http://bonob.example.com:8080/context/art/coverArt:123/size/180?search=yes"
      );
    });
  });

  describe("when there is no album coverArt", () => {
    it("should return a vinly icon image", () => {
      expect(
        defaultAlbumArtURI(
          bonobUrl,
          anAlbum({ coverArt: undefined })
        ).href()
      ).toEqual(
        "http://bonob.example.com:8080/context/icon/vinyl/size/legacy?search=yes"
      );
    });
  });
});

describe("defaultArtistArtURI", () => {
  it("should create the correct URI", () => {
    const bonobUrl = url("http://localhost:1234/something?s=123");
    const artist = anArtist();

    expect(defaultArtistArtURI(bonobUrl, artist).href()).toEqual(
      `http://localhost:1234/something/art/artist:${artist.id}/size/180?s=123`
    );
  });
});

describe("api", () => {
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
    playlists: jest.fn(),
    playlist: jest.fn(),
    album: jest.fn(),
    albums: jest.fn(),
    tracks: jest.fn(),
    track: jest.fn(),
    searchArtists: jest.fn(),
    searchAlbums: jest.fn(),
    searchTracks: jest.fn(),
    createPlaylist: jest.fn(),
    addToPlaylist: jest.fn(),
    deletePlaylist: jest.fn(),
    removeFromPlaylist: jest.fn(),
    scrobble: jest.fn(),
  };
  const accessTokens = {
    mint: jest.fn(),
    authTokenFor: jest.fn(),
  };
  const clock = {
    now: jest.fn(),
  };

  const bonobUrlWithoutContextPath = url("http://localhost:222");
  const bonobUrlWithContextPath = url("http://localhost:111/path/to/bonob");

  [bonobUrlWithoutContextPath, bonobUrlWithContextPath].forEach((bonobUrl) => {
    describe(`bonob with url ${bonobUrl}`, () => {
      const authToken = `authToken-${uuid()}`;
      const accessToken = `accessToken-${uuid()}`;

      const bonobUrlWithAccessToken = bonobUrl.append({
        searchParams: { bat: accessToken },
      });

      const service = bonobService("test-api", 133, bonobUrl, "AppLink");
      const server = makeServer(
        SONOS_DISABLED,
        service,
        bonobUrl,
        musicService as unknown as MusicService,
        {
          linkCodes: () => linkCodes as unknown as LinkCodes,
          accessTokens: () => accessTokens as unknown as AccessTokens,
          clock,
        }
      );

      beforeEach(() => {
        jest.clearAllMocks();
        jest.resetAllMocks();
      });

      describe("soap api", () => {
        describe("getAppLink", () => {
          it("should do something", async () => {
            const ws = await createClientAsync(`${service.uri}?wsdl`, {
              endpoint: service.uri,
              httpClient: supersoap(server),
            });

            const linkCode = "theLinkCode8899";

            linkCodes.mint.mockReturnValue(linkCode);

            const result = await ws.getAppLinkAsync(getAppLinkMessage());

            expect(result[0]).toEqual({
              getAppLinkResult: {
                authorizeAccount: {
                  appUrlStringId: "AppLinkMessage",
                  deviceLink: {
                    regUrl: bonobUrl
                      .append({
                        pathname: "/login",
                        searchParams: { linkCode },
                      })
                      .href(),
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
                httpClient: supersoap(server),
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
                httpClient: supersoap(server),
              });

              await ws
                .getDeviceAuthTokenAsync({ linkCode })
                .then(() => {
                  fail("Shouldnt get here");
                })
                .catch((e: any) => {
                  expect(e.root.Envelope.Body.Fault).toEqual({
                    faultcode: "Client.NOT_LINKED_RETRY",
                    faultstring:
                      "Link Code not found yet, sonos app will keep polling until you log in to bonob",
                    detail: {
                      ExceptionInfo: "NOT_LINKED_RETRY",
                      SonosError: "5",
                    },
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
              httpClient: supersoap(server),
            });

            const result = await ws.getLastUpdateAsync({});

            expect(result[0]).toEqual({
              getLastUpdateResult: {
                autoRefreshEnabled: true,
                favorites: `${now.unix()}`,
                catalog: `${now.unix()}`,
                pollInterval: 60,
              },
            });
          });
        });

        describe("search", () => {
          describe("when no credentials header provided", () => {
            it("should return a fault of LoginUnsupported", async () => {
              const ws = await createClientAsync(`${service.uri}?wsdl`, {
                endpoint: service.uri,
                httpClient: supersoap(server),
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
                httpClient: supersoap(server),
              });

              ws.addSoapHeader({
                credentials: someCredentials("someAuthToken"),
              });
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
            let ws: Client;

            beforeEach(async () => {
              musicService.login.mockResolvedValue(musicLibrary);
              accessTokens.mint.mockReturnValue(accessToken);

              ws = await createClientAsync(`${service.uri}?wsdl`, {
                endpoint: service.uri,
                httpClient: supersoap(server),
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
                      album(bonobUrlWithAccessToken, albumToAlbumSummary(it))
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
                      artist(bonobUrlWithAccessToken, artistToArtistSummary(it))
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
                    mediaCollection: tracks.map((it) =>
                      album(bonobUrlWithAccessToken, it.album)
                    ),
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
                httpClient: supersoap(server),
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
                httpClient: supersoap(server),
              });

              ws.addSoapHeader({
                credentials: someCredentials("someAuthToken"),
              });
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
            let ws: Client;

            beforeEach(async () => {
              musicService.login.mockResolvedValue(musicLibrary);
              accessTokens.mint.mockReturnValue(accessToken);

              ws = await createClientAsync(`${service.uri}?wsdl`, {
                endpoint: service.uri,
                httpClient: supersoap(server),
              });
              ws.addSoapHeader({ credentials: someCredentials(authToken) });
            });

            describe("asking for the root container", () => {
              describe("when no accept-language header is present", () => {
                it("should return en-US", async () => {
                  const root = await ws.getMetadataAsync({
                    id: "root",
                    index: 0,
                    count: 100,
                  });
                  expect(root[0]).toEqual(
                    getMetadataResult({
                      mediaCollection: [
                        {
                          id: "artists",
                          title: "Artists",
                          albumArtURI: iconArtURI(bonobUrl, "artists").href(),
                          itemType: "container",
                        },
                        {
                          id: "albums",
                          title: "Albums",
                          albumArtURI: iconArtURI(bonobUrl, "albums").href(),
                          itemType: "albumList",
                        },
                        {
                          id: "playlists",
                          title: "Playlists",
                          albumArtURI: iconArtURI(bonobUrl, "playlists").href(),
                          itemType: "playlist",
                          attributes: {
                            readOnly: "false",
                            renameable: "false",
                            userContent: "true",
                          },
                        },
                        {
                          id: "genres",
                          title: "Genres",
                          albumArtURI: iconArtURI(bonobUrl, "genres").href(),
                          itemType: "container",
                        },
                        {
                          id: "randomAlbums",
                          title: "Random",
                          albumArtURI: iconArtURI(bonobUrl, "random").href(),
                          itemType: "albumList",
                        },
                        {
                          id: "starredAlbums",
                          title: "Starred",
                          albumArtURI: iconArtURI(bonobUrl, "starred").href(),
                          itemType: "albumList",
                        },
                        {
                          id: "recentlyAdded",
                          title: "Recently added",
                          albumArtURI: iconArtURI(
                            bonobUrl,
                            "recentlyAdded"
                          ).href(),
                          itemType: "albumList",
                        },
                        {
                          id: "recentlyPlayed",
                          title: "Recently played",
                          albumArtURI: iconArtURI(
                            bonobUrl,
                            "recentlyPlayed"
                          ).href(),
                          itemType: "albumList",
                        },
                        {
                          id: "mostPlayed",
                          title: "Most played",
                          albumArtURI: iconArtURI(
                            bonobUrl,
                            "mostPlayed"
                          ).href(),
                          itemType: "albumList",
                        },
                      ],
                      index: 0,
                      total: 9,
                    })
                  );
                });
              });

              describe("when an accept-language header is present with value nl-NL", () => {
                it("should return nl-NL", async () => {
                  ws.addHttpHeader("accept-language", "nl-NL, en-US;q=0.9");
                  const root = await ws.getMetadataAsync({
                    id: "root",
                    index: 0,
                    count: 100,
                  });
                  expect(root[0]).toEqual(
                    getMetadataResult({
                      mediaCollection: [
                        {
                          id: "artists",
                          title: "Artiesten",
                          albumArtURI: iconArtURI(bonobUrl, "artists").href(),
                          itemType: "container",
                        },
                        {
                          id: "albums",
                          title: "Albums",
                          albumArtURI: iconArtURI(bonobUrl, "albums").href(),
                          itemType: "albumList",
                        },
                        {
                          id: "playlists",
                          title: "Afspeellijsten",
                          albumArtURI: iconArtURI(bonobUrl, "playlists").href(),
                          itemType: "playlist",
                          attributes: {
                            readOnly: "false",
                            renameable: "false",
                            userContent: "true",
                          },
                        },
                        {
                          id: "genres",
                          title: "Genres",
                          albumArtURI: iconArtURI(bonobUrl, "genres").href(),
                          itemType: "container",
                        },
                        {
                          id: "randomAlbums",
                          title: "Willekeurig",
                          albumArtURI: iconArtURI(bonobUrl, "random").href(),
                          itemType: "albumList",
                        },
                        {
                          id: "starredAlbums",
                          title: "Favorieten",
                          albumArtURI: iconArtURI(bonobUrl, "starred").href(),
                          itemType: "albumList",
                        },
                        {
                          id: "recentlyAdded",
                          title: "Onlangs toegevoegd",
                          albumArtURI: iconArtURI(
                            bonobUrl,
                            "recentlyAdded"
                          ).href(),
                          itemType: "albumList",
                        },
                        {
                          id: "recentlyPlayed",
                          title: "Onlangs afgespeeld",
                          albumArtURI: iconArtURI(
                            bonobUrl,
                            "recentlyPlayed"
                          ).href(),
                          itemType: "albumList",
                        },
                        {
                          id: "mostPlayed",
                          title: "Meest afgespeeld",
                          albumArtURI: iconArtURI(
                            bonobUrl,
                            "mostPlayed"
                          ).href(),
                          itemType: "albumList",
                        },
                      ],
                      index: 0,
                      total: 9,
                    })
                  );
                });
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
                        albumArtURI: iconArtURI(
                          bonobUrl,
                          iconForGenre(genre.name)
                        ).href(),
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
                        albumArtURI: iconArtURI(
                          bonobUrl,
                          iconForGenre(genre.name)
                        ).href(),
                      })),
                      index: 1,
                      total: expectedGenres.length,
                    })
                  );
                });
              });
            });

            describe("asking for playlists", () => {
              const playlist1 = aPlaylist({ id: "1", name: "pl1" });
              const playlist2 = aPlaylist({ id: "2", name: "pl2" });
              const playlist3 = aPlaylist({ id: "3", name: "pl3" });
              const playlist4 = aPlaylist({ id: "4", name: "pl4" });

              const playlists = [playlist1, playlist2, playlist3, playlist4];

              beforeEach(() => {
                musicLibrary.playlists.mockResolvedValue(
                  playlists.map(playlistToPlaylistSummary)
                );
                musicLibrary.playlist.mockResolvedValueOnce(playlist1);
                musicLibrary.playlist.mockResolvedValueOnce(playlist2);
                musicLibrary.playlist.mockResolvedValueOnce(playlist3);
                musicLibrary.playlist.mockResolvedValueOnce(playlist4);
              });

              describe("asking for all playlists", () => {
                it("should return a collection of playlists", async () => {
                  const result = await ws.getMetadataAsync({
                    id: "playlists",
                    index: 0,
                    count: 100,
                  });
                  expect(result[0]).toEqual(
                    getMetadataResult({
                      mediaCollection: playlists.map((playlist) => ({
                        itemType: "playlist",
                        id: `playlist:${playlist.id}`,
                        title: playlist.name,
                        albumArtURI: playlistAlbumArtURL(
                          bonobUrlWithAccessToken,
                          playlist
                        ).href(),
                        canPlay: true,
                        attributes: {
                          readOnly: "false",
                          userContent: "false",
                          renameable: "false",
                        },
                      })),
                      index: 0,
                      total: playlists.length,
                    })
                  );
                });
              });

              describe("asking for a page of playlists", () => {
                it("should return just that page", async () => {
                  const result = await ws.getMetadataAsync({
                    id: `playlists`,
                    index: 1,
                    count: 2,
                  });
                  expect(result[0]).toEqual(
                    getMetadataResult({
                      mediaCollection: [playlists[1]!, playlists[2]!].map(
                        (playlist) => ({
                          itemType: "playlist",
                          id: `playlist:${playlist.id}`,
                          title: playlist.name,
                          albumArtURI: playlistAlbumArtURL(
                            bonobUrlWithAccessToken,
                            playlist
                          ).href(),
                          canPlay: true,
                          attributes: {
                            readOnly: "false",
                            userContent: "false",
                            renameable: "false",
                          },
                        })
                      ),
                      index: 1,
                      total: playlists.length,
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
                      mediaCollection: artistWithManyAlbums.albums.map(
                        (it) => ({
                          itemType: "album",
                          id: `album:${it.id}`,
                          title: it.name,
                          albumArtURI: defaultAlbumArtURI(
                            bonobUrlWithAccessToken,
                            it
                          ).href(),
                          canPlay: true,
                          artistId: `artist:${it.artistId}`,
                          artist: it.artistName,
                        })
                      ),
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
                        albumArtURI: defaultAlbumArtURI(
                          bonobUrlWithAccessToken,
                          it
                        ).href(),
                        canPlay: true,
                        artistId: `artist:${it.artistId}`,
                        artist: it.artistName,
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
                        albumArtURI: defaultArtistArtURI(
                          bonobUrlWithAccessToken,
                          it
                        ).href(),
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
                        albumArtURI: defaultArtistArtURI(
                          bonobUrlWithAccessToken,
                          it
                        ).href(),
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
              describe("when the artist has many, some in the library and some not", () => {
                const relatedArtist1 = anArtist();
                const relatedArtist2 = anArtist();
                const relatedArtist3 = anArtist();
                const relatedArtist4 = anArtist();
                const relatedArtist5 = anArtist();
                const relatedArtist6 = anArtist();

                const artist = anArtist({
                  similarArtists: [
                    { ...relatedArtist1, inLibrary: true },
                    { ...relatedArtist2, inLibrary: true },
                    { ...relatedArtist3, inLibrary: false },
                    { ...relatedArtist4, inLibrary: true },
                    { ...relatedArtist5, inLibrary: false },
                    { ...relatedArtist6, inLibrary: true },
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
                          relatedArtist4,
                          relatedArtist6,
                        ].map((it) => ({
                          itemType: "artist",
                          id: `artist:${it.id}`,
                          artistId: it.id,
                          title: it.name,
                          albumArtURI: defaultArtistArtURI(
                            bonobUrlWithAccessToken,
                            it
                          ).href(),
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
                        mediaCollection: [relatedArtist2, relatedArtist4].map(
                          (it) => ({
                            itemType: "artist",
                            id: `artist:${it.id}`,
                            artistId: it.id,
                            title: it.name,
                            albumArtURI: defaultArtistArtURI(
                              bonobUrlWithAccessToken,
                              it
                            ).href(),
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

              describe("when the artist some however none are in the library", () => {
                const relatedArtist1 = anArtist();
                const relatedArtist2 = anArtist();

                const artist = anArtist({
                  similarArtists: [
                    {
                      ...relatedArtist1,
                      inLibrary: false,
                    },
                    {
                      ...relatedArtist2,
                      inLibrary: false,
                    },
                  ],
                });

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
                        albumArtURI: defaultAlbumArtURI(
                          bonobUrlWithAccessToken,
                          it
                        ).href(),
                        canPlay: true,
                        artistId: `artist:${it.artistId}`,
                        artist: it.artistName,
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
                        albumArtURI: defaultAlbumArtURI(
                          bonobUrlWithAccessToken,
                          it
                        ).href(),
                        canPlay: true,
                        artistId: `artist:${it.artistId}`,
                        artist: it.artistName,
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
                        albumArtURI: defaultAlbumArtURI(
                          bonobUrlWithAccessToken,
                          it
                        ).href(),
                        canPlay: true,
                        artistId: `artist:${it.artistId}`,
                        artist: it.artistName,
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
                        albumArtURI: defaultAlbumArtURI(
                          bonobUrlWithAccessToken,
                          it
                        ).href(),
                        canPlay: true,
                        artistId: `artist:${it.artistId}`,
                        artist: it.artistName,
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
                        albumArtURI: defaultAlbumArtURI(
                          bonobUrlWithAccessToken,
                          it
                        ).href(),
                        canPlay: true,
                        artistId: `artist:${it.artistId}`,
                        artist: it.artistName,
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
                        albumArtURI: defaultAlbumArtURI(
                          bonobUrlWithAccessToken,
                          it
                        ).href(),
                        canPlay: true,
                        artistId: `artist:${it.artistId}`,
                        artist: it.artistName,
                      })),
                      index: 0,
                      total: 6,
                    })
                  );

                  expect(musicLibrary.albums).toHaveBeenCalledWith({
                    type: "alphabeticalByName",
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
                        albumArtURI: defaultAlbumArtURI(
                          bonobUrlWithAccessToken,
                          it
                        ).href(),
                        canPlay: true,
                        artistId: `artist:${it.artistId}`,
                        artist: it.artistName,
                      })),
                      index: 2,
                      total: 6,
                    })
                  );

                  expect(musicLibrary.albums).toHaveBeenCalledWith({
                    type: "alphabeticalByName",
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
                        albumArtURI: defaultAlbumArtURI(
                          bonobUrlWithAccessToken,
                          it
                        ).href(),
                        canPlay: true,
                        artistId: `artist:${it.artistId}`,
                        artist: it.artistName,
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
                        albumArtURI: defaultAlbumArtURI(
                          bonobUrlWithAccessToken,
                          it
                        ).href(),
                        canPlay: true,
                        artistId: `artist:${it.artistId}`,
                        artist: it.artistName,
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

            describe("asking for an album", () => {
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
                        track(bonobUrlWithAccessToken, it)
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
                        track(bonobUrlWithAccessToken, it)
                      ),
                      index: paging.index,
                      total: tracks.length,
                    })
                  );
                  expect(musicLibrary.tracks).toHaveBeenCalledWith(album.id);
                });
              });
            });

            describe("asking for a playlist", () => {
              const track1 = aTrack();
              const track2 = aTrack();
              const track3 = aTrack();
              const track4 = aTrack();
              const track5 = aTrack();

              const playlist = {
                id: uuid(),
                name: "playlist for test",
                entries: [track1, track2, track3, track4, track5],
              };

              beforeEach(() => {
                musicLibrary.playlist.mockResolvedValue(playlist);
              });

              describe("asking for all for a playlist", () => {
                it("should return them all", async () => {
                  const paging = {
                    index: 0,
                    count: 100,
                  };

                  const result = await ws.getMetadataAsync({
                    id: `playlist:${playlist.id}`,
                    ...paging,
                  });

                  expect(result[0]).toEqual(
                    getMetadataResult({
                      mediaMetadata: playlist.entries.map((it) =>
                        track(bonobUrlWithAccessToken, it)
                      ),
                      index: 0,
                      total: playlist.entries.length,
                    })
                  );
                  expect(musicLibrary.playlist).toHaveBeenCalledWith(
                    playlist.id
                  );
                });
              });

              describe("asking for a single page of a playlists entries", () => {
                const pageOfTracks = [track3, track4];

                it("should return only that page", async () => {
                  const paging = {
                    index: 2,
                    count: 2,
                  };

                  const result = await ws.getMetadataAsync({
                    id: `playlist:${playlist.id}`,
                    ...paging,
                  });

                  expect(result[0]).toEqual(
                    getMetadataResult({
                      mediaMetadata: pageOfTracks.map((it) =>
                        track(bonobUrlWithAccessToken, it)
                      ),
                      index: paging.index,
                      total: playlist.entries.length,
                    })
                  );
                  expect(musicLibrary.playlist).toHaveBeenCalledWith(
                    playlist.id
                  );
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
                httpClient: supersoap(server),
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
                httpClient: supersoap(server),
              });

              ws.addSoapHeader({
                credentials: someCredentials("someAuthToken"),
              });
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

            beforeEach(async () => {
              musicService.login.mockResolvedValue(musicLibrary);
              accessTokens.mint.mockReturnValue(accessToken);

              ws = await createClientAsync(`${service.uri}?wsdl`, {
                endpoint: service.uri,
                httpClient: supersoap(server),
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
                          album(bonobUrlWithAccessToken, it)
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
                          album(bonobUrlWithAccessToken, it)
                        ),
                      },
                    });
                  });
                });
              });

              describe("when it has similar artists, some in the library and some not", () => {
                const similar1 = anArtist();
                const similar2 = anArtist();
                const similar3 = anArtist();
                const similar4 = anArtist();

                const artist = anArtist({
                  similarArtists: [
                    { ...similar1, inLibrary: true },
                    { ...similar2, inLibrary: false },
                    { ...similar3, inLibrary: false },
                    { ...similar4, inLibrary: true },
                  ],
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

              describe("when none of the similar artists are in the library", () => {
                const relatedArtist1 = anArtist();
                const relatedArtist2 = anArtist();
                const artist = anArtist({
                  similarArtists: [
                    { ...relatedArtist1, inLibrary: false },
                    { ...relatedArtist2, inLibrary: false },
                  ],
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

            describe("asking for a track", () => {
              it("should return the track", async () => {
                const track = aTrack();

                musicLibrary.track.mockResolvedValue(track);

                const root = await ws.getExtendedMetadataAsync({
                  id: `track:${track.id}`,
                });

                expect(root[0]).toEqual({
                  getExtendedMetadataResult: {
                    mediaMetadata: {
                      id: `track:${track.id}`,
                      itemType: "track",
                      title: track.name,
                      mimeType: track.mimeType,
                      trackMetadata: {
                        artistId: `artist:${track.artist.id}`,
                        artist: track.artist.name,
                        albumId: `album:${track.album.id}`,
                        albumArtist: track.artist.name,
                        albumArtistId: `artist:${track.artist.id}`,
                        album: track.album.name,
                        genre: track.genre?.name,
                        genreId: track.genre?.id,
                        duration: track.duration,
                        albumArtURI: defaultAlbumArtURI(
                          bonobUrlWithAccessToken,
                          track
                        ).href(),
                        trackNumber: track.number,
                      },
                    },
                  },
                });
                expect(musicLibrary.track).toHaveBeenCalledWith(track.id);
              });
            });

            describe("asking for an album", () => {
              it("should return the album", async () => {
                const album = anAlbum();

                musicLibrary.album.mockResolvedValue(album);

                const root = await ws.getExtendedMetadataAsync({
                  id: `album:${album.id}`,
                });

                expect(root[0]).toEqual({
                  getExtendedMetadataResult: {
                    mediaCollection: {
                      attributes: {
                        readOnly: "true",
                        userContent: "false",
                        renameable: "false",
                      },
                      itemType: "album",
                      id: `album:${album.id}`,
                      title: album.name,
                      albumArtURI: defaultAlbumArtURI(
                        bonobUrlWithAccessToken,
                        album
                      ).href(),
                      canPlay: true,
                      artistId: `artist:${album.artistId}`,
                      artist: album.artistName,
                    },
                  },
                });
                expect(musicLibrary.album).toHaveBeenCalledWith(album.id);
              });
            });
          });
        });

        describe("getMediaURI", () => {
          describe("when no credentials header provided", () => {
            it("should return a fault of LoginUnsupported", async () => {
              const ws = await createClientAsync(`${service.uri}?wsdl`, {
                endpoint: service.uri,
                httpClient: supersoap(server),
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
                httpClient: supersoap(server),
              });

              ws.addSoapHeader({
                credentials: someCredentials("invalid token"),
              });
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
            let ws: Client;

            beforeEach(async () => {
              musicService.login.mockResolvedValue(musicLibrary);
              accessTokens.mint.mockReturnValue(accessToken);

              ws = await createClientAsync(`${service.uri}?wsdl`, {
                endpoint: service.uri,
                httpClient: supersoap(server),
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
                  getMediaURIResult: bonobUrl
                    .append({
                      pathname: `/stream/track/${trackId}`,
                    })
                    .href(),
                  httpHeaders: {
                    header: "bat",
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
                httpClient: supersoap(server),
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
                httpClient: supersoap(server),
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
            let ws: Client;

            const someTrack = aTrack();

            beforeEach(async () => {
              musicService.login.mockResolvedValue(musicLibrary);
              accessTokens.mint.mockReturnValue(accessToken);
              musicLibrary.track.mockResolvedValue(someTrack);

              ws = await createClientAsync(`${service.uri}?wsdl`, {
                endpoint: service.uri,
                httpClient: supersoap(server),
              });
              ws.addSoapHeader({ credentials: someCredentials(authToken) });
            });

            describe("asking for media metadata for a track", () => {
              it("should return it with auth header", async () => {
                const root = await ws.getMediaMetadataAsync({
                  id: `track:${someTrack.id}`,
                });

                expect(root[0]).toEqual({
                  getMediaMetadataResult: track(
                    bonobUrl.with({
                      searchParams: { bat: accessToken },
                    }),
                    someTrack
                  ),
                });
                expect(musicService.login).toHaveBeenCalledWith(authToken);
                expect(accessTokens.mint).toHaveBeenCalledWith(authToken);
                expect(musicLibrary.track).toHaveBeenCalledWith(someTrack.id);
              });
            });
          });
        });

        describe("createContainer", () => {
          let ws: Client;

          beforeEach(async () => {
            musicService.login.mockResolvedValue(musicLibrary);
            accessTokens.mint.mockReturnValue(accessToken);

            ws = await createClientAsync(`${service.uri}?wsdl`, {
              endpoint: service.uri,
              httpClient: supersoap(server),
            });
            ws.addSoapHeader({ credentials: someCredentials(authToken) });
          });

          describe("with only a title", () => {
            const title = "aNewPlaylist";
            const idOfNewPlaylist = uuid();

            it("should create a playlist", async () => {
              musicLibrary.createPlaylist.mockResolvedValue({
                id: idOfNewPlaylist,
                name: title,
              });

              const result = await ws.createContainerAsync({
                title,
              });

              expect(result[0]).toEqual({
                createContainerResult: {
                  id: `playlist:${idOfNewPlaylist}`,
                  updateId: null,
                },
              });
              expect(musicService.login).toHaveBeenCalledWith(authToken);
              expect(accessTokens.mint).toHaveBeenCalledWith(authToken);
              expect(musicLibrary.createPlaylist).toHaveBeenCalledWith(title);
            });
          });

          describe("with a title and a seed track", () => {
            const title = "aNewPlaylist2";
            const trackId = "track123";
            const idOfNewPlaylist = "playlistId";

            it("should create a playlist with the track", async () => {
              musicLibrary.createPlaylist.mockResolvedValue({
                id: idOfNewPlaylist,
                name: title,
              });
              musicLibrary.addToPlaylist.mockResolvedValue(true);

              const result = await ws.createContainerAsync({
                title,
                seedId: `track:${trackId}`,
              });

              expect(result[0]).toEqual({
                createContainerResult: {
                  id: `playlist:${idOfNewPlaylist}`,
                  updateId: null,
                },
              });
              expect(musicService.login).toHaveBeenCalledWith(authToken);
              expect(accessTokens.mint).toHaveBeenCalledWith(authToken);
              expect(musicLibrary.createPlaylist).toHaveBeenCalledWith(title);
              expect(musicLibrary.addToPlaylist).toHaveBeenCalledWith(
                idOfNewPlaylist,
                trackId
              );
            });
          });
        });

        describe("deleteContainer", () => {
          const id = "id123";

          let ws: Client;

          beforeEach(async () => {
            musicService.login.mockResolvedValue(musicLibrary);
            accessTokens.mint.mockReturnValue(accessToken);

            ws = await createClientAsync(`${service.uri}?wsdl`, {
              endpoint: service.uri,
              httpClient: supersoap(server),
            });
            ws.addSoapHeader({ credentials: someCredentials(authToken) });
          });

          it("should delete the playlist", async () => {
            musicLibrary.deletePlaylist.mockResolvedValue(true);

            const result = await ws.deleteContainerAsync({
              id,
            });

            expect(result[0]).toEqual({ deleteContainerResult: null });
            expect(musicService.login).toHaveBeenCalledWith(authToken);
            expect(accessTokens.mint).toHaveBeenCalledWith(authToken);
            expect(musicLibrary.deletePlaylist).toHaveBeenCalledWith(id);
          });
        });

        describe("addToContainer", () => {
          const trackId = "track123";
          const playlistId = "parent123";

          let ws: Client;

          beforeEach(async () => {
            musicService.login.mockResolvedValue(musicLibrary);
            accessTokens.mint.mockReturnValue(accessToken);

            ws = await createClientAsync(`${service.uri}?wsdl`, {
              endpoint: service.uri,
              httpClient: supersoap(server),
            });
            ws.addSoapHeader({ credentials: someCredentials(authToken) });
          });

          it("should delete the playlist", async () => {
            musicLibrary.addToPlaylist.mockResolvedValue(true);

            const result = await ws.addToContainerAsync({
              id: `track:${trackId}`,
              parentId: `parent:${playlistId}`,
            });

            expect(result[0]).toEqual({
              addToContainerResult: { updateId: null },
            });
            expect(musicService.login).toHaveBeenCalledWith(authToken);
            expect(accessTokens.mint).toHaveBeenCalledWith(authToken);
            expect(musicLibrary.addToPlaylist).toHaveBeenCalledWith(
              playlistId,
              trackId
            );
          });
        });

        describe("removeFromContainer", () => {
          let ws: Client;

          beforeEach(async () => {
            musicService.login.mockResolvedValue(musicLibrary);
            accessTokens.mint.mockReturnValue(accessToken);

            ws = await createClientAsync(`${service.uri}?wsdl`, {
              endpoint: service.uri,
              httpClient: supersoap(server),
            });
            ws.addSoapHeader({ credentials: someCredentials(authToken) });
          });

          describe("removing tracks from a playlist", () => {
            const playlistId = "parent123";

            it("should remove the track from playlist", async () => {
              musicLibrary.removeFromPlaylist.mockResolvedValue(true);

              const result = await ws.removeFromContainerAsync({
                id: `playlist:${playlistId}`,
                indices: `1,6,9`,
              });

              expect(result[0]).toEqual({
                removeFromContainerResult: { updateId: null },
              });
              expect(musicService.login).toHaveBeenCalledWith(authToken);
              expect(accessTokens.mint).toHaveBeenCalledWith(authToken);
              expect(musicLibrary.removeFromPlaylist).toHaveBeenCalledWith(
                playlistId,
                [1, 6, 9]
              );
            });
          });

          describe("removing a playlist", () => {
            const playlist1 = aPlaylist({ id: "p1" });
            const playlist2 = aPlaylist({ id: "p2" });
            const playlist3 = aPlaylist({ id: "p3" });
            const playlist4 = aPlaylist({ id: "p4" });
            const playlist5 = aPlaylist({ id: "p5" });

            it("should delete the playlist", async () => {
              musicLibrary.playlists.mockResolvedValue([
                playlist1,
                playlist2,
                playlist3,
                playlist4,
                playlist5,
              ]);
              musicLibrary.deletePlaylist.mockResolvedValue(true);

              const result = await ws.removeFromContainerAsync({
                id: `playlists`,
                indices: `0,2,4`,
              });

              expect(result[0]).toEqual({
                removeFromContainerResult: { updateId: null },
              });
              expect(musicService.login).toHaveBeenCalledWith(authToken);
              expect(accessTokens.mint).toHaveBeenCalledWith(authToken);
              expect(musicLibrary.deletePlaylist).toHaveBeenCalledTimes(3);
              expect(musicLibrary.deletePlaylist).toHaveBeenNthCalledWith(
                1,
                playlist1.id
              );
              expect(musicLibrary.deletePlaylist).toHaveBeenNthCalledWith(
                2,
                playlist3.id
              );
              expect(musicLibrary.deletePlaylist).toHaveBeenNthCalledWith(
                3,
                playlist5.id
              );
            });
          });
        });

        describe("setPlayedSeconds", () => {
          let ws: Client;

          beforeEach(async () => {
            musicService.login.mockResolvedValue(musicLibrary);
            accessTokens.mint.mockReturnValue(accessToken);

            ws = await createClientAsync(`${service.uri}?wsdl`, {
              endpoint: service.uri,
              httpClient: supersoap(server),
            });
            ws.addSoapHeader({ credentials: someCredentials(authToken) });
          });

          describe("when id is for a track", () => {
            const trackId = "123456";

            function itShouldScroble({
              trackId,
              secondsPlayed,
            }: {
              trackId: string;
              secondsPlayed: number;
            }) {
              it("should scrobble", async () => {
                musicLibrary.scrobble.mockResolvedValue(true);

                const result = await ws.setPlayedSecondsAsync({
                  id: `track:${trackId}`,
                  seconds: `${secondsPlayed}`,
                });

                expect(result[0]).toEqual({ setPlayedSecondsResult: null });
                expect(musicService.login).toHaveBeenCalledWith(authToken);
                expect(accessTokens.mint).toHaveBeenCalledWith(authToken);
                expect(musicLibrary.track).toHaveBeenCalledWith(trackId);
                expect(musicLibrary.scrobble).toHaveBeenCalledWith(trackId);
              });
            }

            function itShouldNotScroble({
              trackId,
              secondsPlayed,
            }: {
              trackId: string;
              secondsPlayed: number;
            }) {
              it("should scrobble", async () => {
                const result = await ws.setPlayedSecondsAsync({
                  id: `track:${trackId}`,
                  seconds: `${secondsPlayed}`,
                });

                expect(result[0]).toEqual({ setPlayedSecondsResult: null });
                expect(musicService.login).toHaveBeenCalledWith(authToken);
                expect(accessTokens.mint).toHaveBeenCalledWith(authToken);
                expect(musicLibrary.track).toHaveBeenCalledWith(trackId);
                expect(musicLibrary.scrobble).not.toHaveBeenCalled();
              });
            }

            describe("when the track length is 30 seconds", () => {
              beforeEach(() => {
                musicLibrary.track.mockResolvedValue(
                  aTrack({ id: trackId, duration: 30 })
                );
              });

              describe("when the played length is 30 seconds", () => {
                itShouldScroble({ trackId, secondsPlayed: 30 });
              });

              describe("when the played length is > 30 seconds", () => {
                itShouldScroble({ trackId, secondsPlayed: 90 });
              });

              describe("when the played length is < 30 seconds", () => {
                itShouldNotScroble({ trackId, secondsPlayed: 29 });
              });
            });

            describe("when the track length is > 30 seconds", () => {
              beforeEach(() => {
                musicLibrary.track.mockResolvedValue(
                  aTrack({ id: trackId, duration: 31 })
                );
              });

              describe("when the played length is 30 seconds", () => {
                itShouldScroble({ trackId, secondsPlayed: 30 });
              });

              describe("when the played length is > 30 seconds", () => {
                itShouldScroble({ trackId, secondsPlayed: 90 });
              });

              describe("when the played length is < 30 seconds", () => {
                itShouldNotScroble({ trackId, secondsPlayed: 29 });
              });
            });

            describe("when the track length is 29 seconds", () => {
              beforeEach(() => {
                musicLibrary.track.mockResolvedValue(
                  aTrack({ id: trackId, duration: 29 })
                );
              });

              describe("when the played length is 29 seconds", () => {
                itShouldScroble({ trackId, secondsPlayed: 30 });
              });

              describe("when the played length is > 29 seconds", () => {
                itShouldScroble({ trackId, secondsPlayed: 30 });
              });

              describe("when the played length is 10 seconds", () => {
                itShouldScroble({ trackId, secondsPlayed: 10 });
              });

              describe("when the played length is < 10 seconds", () => {
                itShouldNotScroble({ trackId, secondsPlayed: 9 });
              });
            });
          });

          describe("when the id is for something that isnt a track", () => {
            it("should not scrobble", async () => {
              const result = await ws.setPlayedSecondsAsync({
                id: `album:666`,
                seconds: "100",
              });

              expect(result[0]).toEqual({ setPlayedSecondsResult: null });
              expect(musicService.login).toHaveBeenCalledWith(authToken);
              expect(accessTokens.mint).toHaveBeenCalledWith(authToken);
              expect(musicLibrary.scrobble).not.toHaveBeenCalled();
            });
          });
        });
      });
    });
  });
});
