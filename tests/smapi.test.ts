import crypto from "crypto";
import request from "supertest";
import { Client, createClientAsync } from "soap";
import { v4 as uuid } from "uuid";
import { either as E, taskEither as TE } from "fp-ts";
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
  coverArtURI,
  searchResult,
  iconArtURI,
  sonosifyMimeType,
  ratingAsInt,
  ratingFromInt,
  internetRadioStation
} from "../src/smapi";

import { keys as i8nKeys } from "../src/i8n";
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
  Y2024,
  Y2023,
  Y1969,
  aPlaylist,
  aRadioStation,
} from "./builders";
import { InMemoryMusicService } from "./in_memory_music_service";
import supersoap from "./supersoap";
import {
  albumToAlbumSummary,
  artistToArtistSummary,
  MusicService,
  playlistToPlaylistSummary,
} from "../src/music_service";
import { APITokens } from "../src/api_tokens";
import dayjs from "dayjs";
import url, { URLBuilder } from "../src/url_builder";
import { iconForGenre } from "../src/icon";
import { formatForURL } from "../src/burn";
import { FixedClock } from "../src/clock";
import { ExpiredTokenError, InvalidTokenError, SmapiAuthTokens, SmapiToken, ToSmapiFault } from "../src/smapi_auth";

const parseXML = (value: string) => new DOMParserImpl().parseFromString(value);

describe("rating to and from ints", () => {
  describe("ratingAsInt", () => {
    [
      { rating: { love: false, stars: 0 }, expectedValue: 100 },
      { rating: { love: true, stars: 0 }, expectedValue: 101 },
      { rating: { love: false, stars: 1 }, expectedValue: 110 },
      { rating: { love: true, stars: 1 }, expectedValue: 111 },
      { rating: { love: false, stars: 2 }, expectedValue: 120 },
      { rating: { love: true, stars: 2 }, expectedValue: 121 },
      { rating: { love: false, stars: 3 }, expectedValue: 130 },
      { rating: { love: true, stars: 3 }, expectedValue: 131 },
      { rating: { love: false, stars: 4 }, expectedValue: 140 },
      { rating: { love: true, stars: 4 }, expectedValue: 141 },
      { rating: { love: false, stars: 5 }, expectedValue: 150 },
      { rating: { love: true, stars: 5 }, expectedValue: 151 },
    ].forEach(({ rating, expectedValue }) => {
      it(`should map ${JSON.stringify(
        rating
      )} to a ${expectedValue} and back`, () => {
        const actualValue = ratingAsInt(rating);
        expect(actualValue).toEqual(expectedValue);
        expect(ratingFromInt(actualValue)).toEqual(rating);
      });
    });
  });
});

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

      async function fetchStringsXml() {
        const res = await request(server).get(stringsUrl.path()).send();

        expect(res.status).toEqual(200);

        // removing the sonos xml ns as makes xpath queries with xpath-ts painful
        return parseXML(
          res.text.replace('xmlns="http://sonos.com/sonosapi"', "")
        );
      }

      describe(STRINGS_ROUTE, () => {
        it("should return xml for the strings", async () => {
          const xml: Document = await fetchStringsXml();

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

          // no pt-BR translation, so use en-US
          expect(sonosString("AppLinkMessage", "pt-BR")).toEqual(
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
        async function presentationMapXml() {
          const res = await request(server).get(presentationUrl.path()).send();
          expect(res.status).toEqual(200);
          // removing the sonos xml ns as makes xpath queries with xpath-ts painful
          return parseXML(
            res.text.replace('xmlns="http://sonos.com/sonosapi"', "")
          );
        }

        it("should have a PageSize of specified", async () => {
          const xml = await presentationMapXml();

          const pageSize = xpath.select(
            `string(/Presentation/BrowseOptions/@PageSize)`,
            xml
          );

          expect(pageSize).toEqual("30");
        });

        it("should have an ArtWorkSizeMap for all sizes recommended by sonos", async () => {
          const xml = await presentationMapXml();

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
          const xml = await presentationMapXml();

          const imageSizeMap = (size: string) =>
            xpath.select(
              `string(/Presentation/PresentationMap[@type="BrowseIconSizeMap"]/Match/browseIconSizeMap/sizeEntry[@size="${size}"]/@substitution)`,
              xml
            );

          SONOS_RECOMMENDED_IMAGE_SIZES.forEach((size) => {
            expect(imageSizeMap(size)).toEqual(`/size/${size}`);
          });
        });

        describe("NowPlayingRatings", () => {
          it("should have Matches with propname = rating", async () => {
            const xml = await presentationMapXml();

            const matchElements = xpath.select(
              `/Presentation/PresentationMap[@type="NowPlayingRatings"]/Match`,
              xml
            ) as Element[];

            expect(matchElements.length).toBe(12);

            matchElements.forEach((match) => {
              expect(match.getAttributeNode("propname")?.value).toEqual(
                "rating"
              );
            });
          });

          it("should have Rating stringIds that are in strings.xml", async () => {
            const xml = await presentationMapXml();

            const ratingElements = xpath.select(
              `/Presentation/PresentationMap[@type="NowPlayingRatings"]/Match/Ratings/Rating`,
              xml
            ) as Element[];

            expect(ratingElements.length).toBeGreaterThan(1);

            ratingElements.forEach((rating) => {
              const OnSuccessStringId =
                rating.getAttributeNode("OnSuccessStringId")!.value;
              const StringId = rating.getAttributeNode("StringId")!.value;

              expect(i8nKeys()).toContain(OnSuccessStringId);
              expect(i8nKeys()).toContain(StringId);
            });
          });

          it("should have Rating Ids that are valid ratings as ints", async () => {
            const xml = await presentationMapXml();

            const ratingElements = xpath.select(
              `/Presentation/PresentationMap[@type="NowPlayingRatings"]/Match/Ratings/Rating`,
              xml
            ) as Element[];

            expect(ratingElements.length).toBeGreaterThan(1);

            ratingElements.forEach((ratingElement) => {
              const rating = ratingFromInt(
                Math.abs(
                  Number.parseInt(ratingElement.getAttributeNode("Id")!.value)
                )
              );
              expect(rating.love).toBeDefined();
              expect(rating.stars).toBeGreaterThanOrEqual(0);
              expect(rating.stars).toBeLessThanOrEqual(5);
            });
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
      encoding: {
        player: "something",
        mimeType: "audio/x-flac"
      },
      name: "great song",
      duration: randomInt(1000),
      number: randomInt(100),
      album: anAlbum({
        name: "great album",
        id: uuid(),
        genre: { id: "genre101", name: "some genre" },
      }),
      artist: anArtist({ name: "great artist", id: uuid() }),
      coverArt: { system: "subsonic", resource: "887766" },
      rating: {
        love: true,
        stars: 5,
      },
    });

    expect(track(bonobUrl, someTrack)).toEqual({
      itemType: "track",
      id: `track:${someTrack.id}`,
      mimeType: "audio/flac",
      title: someTrack.name,

      trackMetadata: {
        album: someTrack.album.name,
        albumId: `album:${someTrack.album.id}`,
        albumArtist: someTrack.artist.name,
        albumArtistId: `artist:${someTrack.artist.id}`,
        albumArtURI: `http://localhost:4567/foo/art/${encodeURIComponent(
          formatForURL(someTrack.coverArt!)
        )}/size/180?access-token=1234`,
        artist: someTrack.artist.name,
        artistId: `artist:${someTrack.artist.id}`,
        duration: someTrack.duration,
        genre: someTrack.album.genre?.name,
        genreId: someTrack.album.genre?.id,
        trackNumber: someTrack.number,
      },
      dynamic: {
        property: [
          {
            name: "rating",
            value: `${ratingAsInt(someTrack.rating)}`,
          },
        ],
      },
    });
  });

  describe("when there is no artistId from subsonic", () => {
    it("should not send an artist id to sonos", () => {
      const bonobUrl = url("http://localhost:4567/foo?access-token=1234");
      const someTrack = aTrack({
        id: uuid(),
        // audio/x-flac should be mapped to audio/flac
        encoding: {
          player: "something",
          mimeType: "audio/x-flac"
        },
        name: "great song",
        duration: randomInt(1000),
        number: randomInt(100),
        album: anAlbum({
          name: "great album",
          id: uuid(),
          genre: { id: "genre101", name: "some genre" },
        }),
        artist: anArtist({ name: "great artist", id: undefined }),
        coverArt: { system: "subsonic", resource: "887766" },
        rating: {
          love: true,
          stars: 5,
        },
      });

      expect(track(bonobUrl, someTrack)).toEqual({
        itemType: "track",
        id: `track:${someTrack.id}`,
        mimeType: "audio/flac",
        title: someTrack.name,

        trackMetadata: {
          album: someTrack.album.name,
          albumId: `album:${someTrack.album.id}`,
          albumArtist: someTrack.artist.name,
          albumArtistId: undefined,
          albumArtURI: `http://localhost:4567/foo/art/${encodeURIComponent(
            formatForURL(someTrack.coverArt!)
          )}/size/180?access-token=1234`,
          artist: someTrack.artist.name,
          artistId: undefined,
          duration: someTrack.duration,
          genre: someTrack.album.genre?.name,
          genreId: someTrack.album.genre?.id,
          trackNumber: someTrack.number,
        },
        dynamic: {
          property: [
            {
              name: "rating",
              value: `${ratingAsInt(someTrack.rating)}`,
            },
          ],
        },
      });
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
      albumArtURI: coverArtURI(bonobUrl, someAlbum).href(),
      canPlay: true,
      artist: someAlbum.artistName,
      artistId: `artist:${someAlbum.artistId}`,
    });
  });
});

describe("internetRadioStation", () => {
  it("should map to a sonos internet stream", () => {
    const station = aRadioStation()
    expect(internetRadioStation(station)).toEqual({
      itemType: "stream",
      id: `internetRadioStation:${station.id}`,
      title: station.name,
      mimeType: "audio/mpeg"
    })
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


describe("coverArtURI", () => {
  const bonobUrl = new URLBuilder(
    "http://bonob.example.com:8080/context?search=yes"
  );

  describe("when there is an album coverArt", () => {
    describe("from subsonic", () => {
      it("should use it", () => {
        const coverArt = { system: "subsonic", resource: "12345" };
        expect(
          coverArtURI(bonobUrl, anAlbum({ coverArt })).href()
        ).toEqual(
          `http://bonob.example.com:8080/context/art/${encodeURIComponent(
            formatForURL(coverArt)
          )}/size/180?search=yes`
        );
      });
    });

    describe("that is external", () => {
      it("should use encrypt it", () => {
        const coverArt = {
          system: "external",
          resource: "http://example.com/someimage.jpg",
        };
        expect(
          coverArtURI(bonobUrl, anAlbum({ coverArt })).href()
        ).toEqual(
          `http://bonob.example.com:8080/context/art/${encodeURIComponent(
            formatForURL(coverArt)
          )}/size/180?search=yes`
        );
      });
    });
  });

  describe("when there is no album coverArt", () => {
    it("should return a vinly icon image", () => {
      expect(
        coverArtURI(bonobUrl, anAlbum({ coverArt: undefined })).href()
      ).toEqual(
        "http://bonob.example.com:8080/context/icon/vinyl/size/legacy?search=yes"
      );
    });
  });
});

describe("wsdl api", () => {
  const musicService = {
    generateToken: jest.fn(),
    refreshToken: jest.fn(),
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
    years: jest.fn(),
    year: jest.fn(),
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
    nowPlaying: jest.fn(),
    rate: jest.fn(),
    radioStation: jest.fn(),
    radioStations: jest.fn(),
  };
  const apiTokens = {
    mint: jest.fn(),
    authTokenFor: jest.fn(),
  };

  const smapiAuthTokens = {
    issue: jest.fn(() => ({ token: `default-smapiToken-${uuid()}`, key: `default-smapiKey-${uuid()}` })),
    verify: jest.fn<E.Either<ToSmapiFault, string>, []>(() => E.right(`default-serviceToken-${uuid()}`)),
  };

  const clock = new FixedClock();

  const bonobUrlWithoutContextPath = url("http://localhost:222");
  const bonobUrlWithContextPath = url("http://localhost:111/path/to/bonob");

  [bonobUrlWithoutContextPath, bonobUrlWithContextPath].forEach((bonobUrl) => {
    describe(`bonob with url ${bonobUrl}`, () => {
      const serviceToken = `serviceToken-${uuid()}`;
      const apiToken = `apiToken-${uuid()}`;
      const smapiAuthToken: SmapiToken = {
        token: `smapiAuthToken.token-${uuid()}`,
        key: `smapiAuthToken.key-${uuid()}`
      };

      const bonobUrlWithAccessToken = bonobUrl.append({
        searchParams: { bat: apiToken },
      });

      const service = bonobService("test-api", 133, bonobUrl, "AppLink");
      const server = makeServer(
        SONOS_DISABLED,
        service,
        bonobUrl,
        musicService as unknown as MusicService,
        {
          linkCodes: () => linkCodes as unknown as LinkCodes,
          apiTokens: () => apiTokens as unknown as APITokens,
          clock,
          smapiAuthTokens: smapiAuthTokens as unknown as SmapiAuthTokens,
        }
      );

      beforeEach(() => {
        jest.clearAllMocks();
        jest.resetAllMocks();
      });

      function setupAuthenticatedRequest(ws: Client) {
        musicService.login.mockResolvedValue(musicLibrary);
        smapiAuthTokens.verify.mockReturnValue(E.right(serviceToken));
        apiTokens.mint.mockReturnValue(apiToken);
        ws.addSoapHeader({
          credentials: someCredentials(smapiAuthToken),
        });
        return ws;
      }

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
                serviceToken: "serviceToken",
                userId: "uid",
                nickname: "nick",
              };
              linkCodes.associationFor.mockReturnValue(association);
              smapiAuthTokens.issue.mockReturnValue(smapiAuthToken);

              const ws = await createClientAsync(`${service.uri}?wsdl`, {
                endpoint: service.uri,
                httpClient: supersoap(server),
              });

              const result = await ws.getDeviceAuthTokenAsync({ linkCode });

              expect(result[0]).toEqual({
                getDeviceAuthTokenResult: {
                  authToken: smapiAuthToken.token,
                  privateKey: smapiAuthToken.key,
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
            clock.time = now;

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

        describe("refreshAuthToken", () => {
          describe("when no credentials are provided", () => {
            itShouldReturnALoginUnsupported((ws) =>
              ws.refreshAuthTokenAsync({})
            );
          });

          describe("when token has expired", () => {
            it("should return a refreshed auth token", async () => {
              const refreshedServiceToken = `refreshedServiceToken-${uuid()}`
              const newSmapiAuthToken = { token: `newToken-${uuid()}`, key: `newKey-${uuid()}` };

              smapiAuthTokens.verify.mockReturnValue(E.left(new ExpiredTokenError(serviceToken)));
              musicService.refreshToken.mockReturnValue(TE.right({ serviceToken: refreshedServiceToken }));
              smapiAuthTokens.issue.mockReturnValue(newSmapiAuthToken);

              const ws = await createClientAsync(`${service.uri}?wsdl`, {
                endpoint: service.uri,
                httpClient: supersoap(server),
              });
              ws.addSoapHeader({
                credentials: someCredentials(smapiAuthToken),
              });

              const result = await ws.refreshAuthTokenAsync({});

              expect(result[0]).toEqual({
                refreshAuthTokenResult: {
                  authToken: newSmapiAuthToken.token,
                  privateKey: newSmapiAuthToken.key,
                },
              });

              expect(musicService.refreshToken).toHaveBeenCalledWith(serviceToken);
              expect(smapiAuthTokens.issue).toHaveBeenCalledWith(refreshedServiceToken);
            });
          });

          describe("when the token fails to verify", () => {
            it("should fail with a sampi fault", async () => {
              smapiAuthTokens.verify.mockReturnValue(E.left(new InvalidTokenError("Invalid token")));

              const ws = await createClientAsync(`${service.uri}?wsdl`, {
                endpoint: service.uri,
                httpClient: supersoap(server),
              });
              ws.addSoapHeader({
                credentials: someCredentials(smapiAuthToken),
              });

              await ws.refreshAuthTokenAsync({})
              .then(() => fail("shouldnt get here"))
              .catch((e: any) => {
                expect(e.root.Envelope.Body.Fault).toEqual({
                  faultcode: "Client.LoginUnauthorized",
                  faultstring: "Failed to authenticate, try Re-Authorising your account in the sonos app",                });
              });
            });
          });          

          describe("when existing auth token has not expired", () => {
            it("should return a refreshed auth token", async () => {
              const refreshedServiceToken = `refreshedServiceToken-${uuid()}`
              const newSmapiAuthToken = { token: `newToken-${uuid()}`, key: `newKey-${uuid()}` };

              smapiAuthTokens.verify.mockReturnValue(E.right(serviceToken));
              musicService.refreshToken.mockReturnValue(TE.right({ serviceToken: refreshedServiceToken }));
              smapiAuthTokens.issue.mockReturnValue(newSmapiAuthToken);

              const ws = await createClientAsync(`${service.uri}?wsdl`, {
                endpoint: service.uri,
                httpClient: supersoap(server),
              });
              ws.addSoapHeader({
                credentials: someCredentials(smapiAuthToken),
              });

              const result = await ws.refreshAuthTokenAsync({});

              expect(result[0]).toEqual({
                refreshAuthTokenResult: {
                  authToken: newSmapiAuthToken.token,
                  privateKey: newSmapiAuthToken.key
                },
              });

              expect(musicService.refreshToken).toHaveBeenCalledWith(serviceToken);
              expect(smapiAuthTokens.issue).toHaveBeenCalledWith(refreshedServiceToken);
            });
          });
        });

        describe("search", () => {
          itShouldHandleInvalidCredentials((ws) =>
            ws.getMetadataAsync({ id: "search", index: 0, count: 0 })
          );

          describe("when valid credentials are provided", () => {
            let ws: Client;

            beforeEach(async () => {
              ws = await createClientAsync(`${service.uri}?wsdl`, {
                endpoint: service.uri,
                httpClient: supersoap(server),
              });
              setupAuthenticatedRequest(ws);
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

        async function itShouldReturnALoginUnsupported(
          action: (ws: Client) => Promise<Client>
        ) {
          it("should return a fault of LoginUnsupported", async () => {
            const ws = await createClientAsync(`${service.uri}?wsdl`, {
              endpoint: service.uri,
              httpClient: supersoap(server),
            });

            await action(ws)
              .then(() => fail("shouldnt get here"))
              .catch((e: any) => {
                expect(e.root.Envelope.Body.Fault).toEqual({
                  faultcode: "Client.LoginUnsupported",
                  faultstring: "Missing credentials...",
                });
              });
          });
        }

        async function itShouldReturnAFaultOfLoginUnauthorized(
          verifyResponse: E.Either<ToSmapiFault, string>,
          action: (ws: Client) => Promise<Client>
        ) {
          it("should return a fault of LoginUnauthorized", async () => {
            smapiAuthTokens.verify.mockReturnValue(verifyResponse);
            musicService.login.mockRejectedValue("fail!");

            const ws = await createClientAsync(`${service.uri}?wsdl`, {
              endpoint: service.uri,
              httpClient: supersoap(server),
            });
            ws.addSoapHeader({ credentials: someCredentials({ token: 'tokenThatFails', key: `keyThatFails` }) });

            await action(ws)
              .then(() => fail("shouldnt get here"))
              .catch((e: any) => {
                expect(e.root.Envelope.Body.Fault).toEqual({
                  faultcode: "Client.LoginUnauthorized",
                  faultstring:
                    "Failed to authenticate, try Re-Authorising your account in the sonos app",
                });
              });
          });
        }

        function itShouldHandleInvalidCredentials(
          action: (ws: Client) => Promise<Client>
        ) {
          describe("when no credentials are provided", () => {
            itShouldReturnALoginUnsupported(action);
          });

          describe("when the token fails to verify", () => {
            itShouldReturnAFaultOfLoginUnauthorized(
              E.left(new InvalidTokenError("Token Invalid")),
              action
            );
          });

          describe("when token has expired", () => {
            it("should return a fault of Client.TokenRefreshRequired with a refreshAuthTokenResult", async () => {
              const refreshedServiceToken = `refreshedServiceToken-${uuid()}`
              const newToken = {
                token: `newToken-${uuid()}`,
                key: `newKey-${uuid()}`
              };
  
              smapiAuthTokens.verify.mockReturnValue(E.left(new ExpiredTokenError(serviceToken)))
              musicService.refreshToken.mockReturnValue(TE.right({ serviceToken: refreshedServiceToken }))
              smapiAuthTokens.issue.mockReturnValue(newToken)
              musicService.login.mockRejectedValue(
                "fail, should not call login!"
              );
  
              const ws = await createClientAsync(`${service.uri}?wsdl`, {
                endpoint: service.uri,
                httpClient: supersoap(server),
              });
              ws.addSoapHeader({
                credentials: someCredentials(smapiAuthToken),
              });
              await action(ws)
                .then(() => fail("shouldnt get here"))
                .catch((e: any) => {
                  expect(e.root.Envelope.Body.Fault).toEqual({
                    faultcode: "Client.TokenRefreshRequired",
                    faultstring: "Token has expired",
                    detail: {
                      refreshAuthTokenResult: {
                        authToken: newToken.token,
                        privateKey: newToken.key,
                      },
                    },
                  });
                });
  
                expect(smapiAuthTokens.verify).toHaveBeenCalledWith(smapiAuthToken);
                expect(musicService.refreshToken).toHaveBeenCalledWith(serviceToken);
                expect(smapiAuthTokens.issue).toHaveBeenCalledWith(refreshedServiceToken);
            });
          });
        }

        describe("getMetadata", () => {
          itShouldHandleInvalidCredentials((ws) =>
            ws.getMetadataAsync({ id: "root", index: 0, count: 0 })
          );

          describe("when valid credentials are provided", () => {
            let ws: Client;

            beforeEach(async () => {
              ws = await createClientAsync(`${service.uri}?wsdl`, {
                endpoint: service.uri,
                httpClient: supersoap(server),
              });
              setupAuthenticatedRequest(ws);
            });

            describe("asking for the root container", () => {
              describe("when no accept-language header is present", () => {
                it("should return en-US", async () => {
                  const root = await ws.getMetadataAsync({
                    id: "root",
                    index: 0,
                    count: 100,
                  });
                  const mediaCollection = [
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
                      id: "randomAlbums",
                      title: "Random",
                      albumArtURI: iconArtURI(bonobUrl, "random").href(),
                      itemType: "albumList",
                    },
                    {
                      id: "favouriteAlbums",
                      title: "Favourites",
                      albumArtURI: iconArtURI(bonobUrl, "heart").href(),
                      itemType: "albumList",
                    },
                    {
                      id: "starredAlbums",
                      title: "Top Rated",
                      albumArtURI: iconArtURI(bonobUrl, "star").href(),
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
                      id: "years",
                      title: "Years",
                      albumArtURI: iconArtURI(bonobUrl, "music").href(),
                      itemType: "container",
                    },
                    {
                      id: "recentlyAdded",
                      title: "Recently added",
                      albumArtURI: iconArtURI(bonobUrl, "recentlyAdded").href(),
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
                      albumArtURI: iconArtURI(bonobUrl, "mostPlayed").href(),
                      itemType: "albumList",
                    },
                    {
                      id: "internetRadio",
                      title: "Internet Radio",
                      albumArtURI: iconArtURI(bonobUrl, "radio").href(),
                      itemType: "stream",
                    },
                  ];
                  expect(root[0]).toEqual(
                    getMetadataResult({
                      mediaCollection,
                      index: 0,
                      total: mediaCollection.length,
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
                  const mediaCollection = [
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
                      id: "randomAlbums",
                      title: "Willekeurig",
                      albumArtURI: iconArtURI(bonobUrl, "random").href(),
                      itemType: "albumList",
                    },
                    {
                      id: "favouriteAlbums",
                      title: "Favorieten",
                      albumArtURI: iconArtURI(bonobUrl, "heart").href(),
                      itemType: "albumList",
                    },
                    {
                      id: "starredAlbums",
                      title: "Best beoordeeld",
                      albumArtURI: iconArtURI(bonobUrl, "star").href(),
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
                      id: "years",
                      title: "Jaren",
                      albumArtURI: iconArtURI(bonobUrl, "music").href(),
                      itemType: "container",
                    },
                    {
                      id: "recentlyAdded",
                      title: "Onlangs toegevoegd",
                      albumArtURI: iconArtURI(bonobUrl, "recentlyAdded").href(),
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
                      albumArtURI: iconArtURI(bonobUrl, "mostPlayed").href(),
                      itemType: "albumList",
                    },
                    {
                      id: "internetRadio",
                      title: "Internet Radio",
                      albumArtURI: iconArtURI(bonobUrl, "radio").href(),
                      itemType: "stream",
                    },
                  ];
                  expect(root[0]).toEqual(
                    getMetadataResult({
                      mediaCollection,
                      index: 0,
                      total: mediaCollection.length,
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
                        itemType: "albumList",
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
                        itemType: "albumList",
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

            describe("asking for a year", () => {
              const expectedYears = [Y1969, Y2023, Y2024];

              beforeEach(() => {
                musicLibrary.years.mockResolvedValue(expectedYears);
              });

              describe("asking for all years", () => {
                it("should return a collection of years", async () => {
                  const result = await ws.getMetadataAsync({
                    id: `years`,
                    index: 0,
                    count: 100,
                  });
                  expect(result[0]).toEqual(
                    getMetadataResult({
                      mediaCollection: expectedYears.map((year) => ({
                        itemType: "albumList",
                        id: `year:${year.id}`,
                        title: year.year,
                        albumArtURI: iconArtURI(
                          bonobUrl,
                          "music",
                        ).href(),
                      })),
                      index: 0,
                      total: expectedYears.length,
                    })
                  );
                });
              });

              describe("asking for a page of years", () => {
                it("should return just that page", async () => {
                  const result = await ws.getMetadataAsync({
                    id: `years`,
                    index: 1,
                    count: 2,
                  });
                  expect(result[0]).toEqual(
                    getMetadataResult({
                      mediaCollection: [Y2023, Y2024].map((year) => ({
                        itemType: "albumList",
                        id: `year:${year.id}`,
                        title: year.year,
                        albumArtURI: iconArtURI(
                          bonobUrl,
                          "music"
                        ).href(),
                      })),
                      index: 1,
                      total: expectedYears.length,
                    })
                  );
                });
              });
            });

            describe("asking for playlists", () => {
              const playlist1 = aPlaylist({ id: "1", name: "pl1", entries: []});
              const playlist2 = aPlaylist({ id: "2", name: "pl2", entries: []});
              const playlist3 = aPlaylist({ id: "3", name: "pl3", entries: []});
              const playlist4 = aPlaylist({ id: "4", name: "pl4", entries: []});

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
                        albumArtURI: coverArtURI(
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
                          albumArtURI: coverArtURI(
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
                          albumArtURI: coverArtURI(
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
                  expect(apiTokens.mint).toHaveBeenCalledWith(serviceToken);
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
                        albumArtURI: coverArtURI(
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
                  expect(apiTokens.mint).toHaveBeenCalledWith(serviceToken);
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
                        albumArtURI: coverArtURI(
                          bonobUrlWithAccessToken,
                          { coverArt: it.image }
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
                  expect(apiTokens.mint).toHaveBeenCalledWith(serviceToken);
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
                        albumArtURI: coverArtURI(
                          bonobUrlWithAccessToken,
                          { coverArt: it.image }
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
                  expect(apiTokens.mint).toHaveBeenCalledWith(serviceToken);
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
                          albumArtURI: coverArtURI(
                            bonobUrlWithAccessToken,
                            { coverArt: it.image }
                          ).href(),
                        })),
                        index: 0,
                        total: 4,
                      })
                    );
                    expect(musicLibrary.artist).toHaveBeenCalledWith(artist.id);
                    expect(apiTokens.mint).toHaveBeenCalledWith(serviceToken);
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
                            albumArtURI: coverArtURI(
                              bonobUrlWithAccessToken,
                              { coverArt: it.image }
                            ).href(),
                          })
                        ),
                        index: 1,
                        total: 4,
                      })
                    );
                    expect(musicLibrary.artist).toHaveBeenCalledWith(artist.id);
                    expect(apiTokens.mint).toHaveBeenCalledWith(serviceToken);
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
                  expect(apiTokens.mint).toHaveBeenCalledWith(serviceToken);
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
                  expect(apiTokens.mint).toHaveBeenCalledWith(serviceToken);
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
                        albumArtURI: coverArtURI(
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

              describe("asking for favourite albums", () => {
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
                    id: "favouriteAlbums",
                    ...paging,
                  });

                  expect(result[0]).toEqual(
                    getMetadataResult({
                      mediaCollection: albums.map((it) => ({
                        itemType: "album",
                        id: `album:${it.id}`,
                        title: it.name,
                        albumArtURI: coverArtURI(
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
                    type: "favourited",
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
                        albumArtURI: coverArtURI(
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
                        albumArtURI: coverArtURI(
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
                    type: "recentlyPlayed",
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
                        albumArtURI: coverArtURI(
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
                    type: "mostPlayed",
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
                        albumArtURI: coverArtURI(
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
                    type: "recentlyAdded",
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
                        albumArtURI: coverArtURI(
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
                        albumArtURI: coverArtURI(
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
                        albumArtURI: coverArtURI(
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
                        albumArtURI: coverArtURI(
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

            describe("asking for internet radio stations", () => {
              const station1 = aRadioStation();
              const station2 = aRadioStation();
              const station3 = aRadioStation();
              const station4 = aRadioStation();

              const stations = [station1, station2, station3, station4];

              beforeEach(() => {
                musicLibrary.radioStations.mockResolvedValue(stations);
              });

              describe("when they all fit on the page", () => {
                it("should return them all", async () => {
                  const paging = {
                    index: 0,
                    count: 100,
                  };

                  const result = await ws.getMetadataAsync({
                    id: `internetRadio`,
                    ...paging,
                  });

                  expect(result[0]).toEqual(
                    getMetadataResult({
                      mediaMetadata: stations.map((it) =>
                        internetRadioStation(it)
                      ),
                      index: 0,
                      total: stations.length,
                    })
                  );
                  expect(musicLibrary.radioStations).toHaveBeenCalled();
                });
              });

              describe("asking for a single page of stations", () => {
                const pageOfStations = [station3, station4];

                it("should return only that page", async () => {
                  const paging = {
                    index: 2,
                    count: 2,
                  };

                  const result = await ws.getMetadataAsync({
                    id: `internetRadio`,
                    ...paging,
                  });

                  expect(result[0]).toEqual(
                    getMetadataResult({
                      mediaMetadata: pageOfStations.map((it) =>
                        internetRadioStation(it)
                      ),
                      index: paging.index,
                      total: stations.length,
                    })
                  );
                  expect(musicLibrary.radioStations).toHaveBeenCalled();
                });
              });
            });
          });
        });

        describe("getExtendedMetadata", () => {
          itShouldHandleInvalidCredentials((ws) =>
            ws.getExtendedMetadataAsync({ id: "root", index: 0, count: 0 })
          );

          describe("when valid credentials are provided", () => {
            let ws: Client;

            beforeEach(async () => {
              ws = await createClientAsync(`${service.uri}?wsdl`, {
                endpoint: service.uri,
                httpClient: supersoap(server),
              });
              setupAuthenticatedRequest(ws);
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
              describe("that has a love", () => {
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
                        mimeType: track.encoding.mimeType,
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
                          albumArtURI: coverArtURI(
                            bonobUrlWithAccessToken,
                            track
                          ).href(),
                          trackNumber: track.number,
                        },
                        dynamic: {
                          property: [
                            {
                              name: "rating",
                              value: `${ratingAsInt(track.rating)}`,
                            },
                          ],
                        },
                      },
                    },
                  });
                  expect(musicLibrary.track).toHaveBeenCalledWith(track.id);
                });
              });

              describe("that does not have a love", () => {
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
                        mimeType: track.encoding.mimeType,
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
                          albumArtURI: coverArtURI(
                            bonobUrlWithAccessToken,
                            track
                          ).href(),
                          trackNumber: track.number,
                        },
                        dynamic: {
                          property: [
                            {
                              name: "rating",
                              value: `${ratingAsInt(track.rating)}`,
                            },
                          ],
                        },
                      },
                    },
                  });
                  expect(musicLibrary.track).toHaveBeenCalledWith(track.id);
                });
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
                      albumArtURI: coverArtURI(
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
          itShouldHandleInvalidCredentials((ws) =>
            ws.getMediaURIAsync({ id: "track:123" })
          );

          describe("when valid credentials are provided", () => {
            let ws: Client;

            beforeEach(async () => {
              ws = await createClientAsync(`${service.uri}?wsdl`, {
                endpoint: service.uri,
                httpClient: supersoap(server),
              });
              setupAuthenticatedRequest(ws);
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
                  httpHeaders: [
                    {
                      httpHeader: [{
                          header: "bnbt",
                          value: smapiAuthToken.token,
                      }],
                    },
                    {
                      httpHeader: [{
                          header: "bnbk",
                          value: smapiAuthToken.key,
                      }],
                    }
                  ],
                });

                expect(musicService.login).toHaveBeenCalledWith(serviceToken);
              });
            });

            describe("asking for a URI to stream a radio station", () => {
              const someStation = aRadioStation()

              beforeEach(() => {
                musicLibrary.radioStation.mockResolvedValue(someStation);
              })

              it("should return the radio stations uri", async () => {
                const root = await ws.getMediaURIAsync({
                  id: `internetRadioStation:${someStation.id}`,
                });

                expect(root[0]).toEqual({
                  getMediaURIResult: someStation.url,
                });

                expect(musicService.login).toHaveBeenCalledWith(serviceToken);
                expect(musicLibrary.radioStation).toHaveBeenCalledWith(someStation.id);
              });
            });            
          });
        });

        describe("getMediaMetadata", () => {
          itShouldHandleInvalidCredentials((ws) =>
            ws.getMediaMetadataAsync({ id: "track:123" })
          );

          describe("when valid credentials are provided", () => {
            let ws: Client;


            beforeEach(async () => {
              ws = await createClientAsync(`${service.uri}?wsdl`, {
                endpoint: service.uri,
                httpClient: supersoap(server),
              });
              setupAuthenticatedRequest(ws);
            });

            describe("asking for media metadata for a track", () => {
              const someTrack = aTrack();

              beforeEach(async () => {
                musicLibrary.track.mockResolvedValue(someTrack);
              });

              it("should return it with auth header", async () => {
                const root = await ws.getMediaMetadataAsync({
                  id: `track:${someTrack.id}`,
                });

                expect(root[0]).toEqual({
                  getMediaMetadataResult: track(
                    bonobUrl.with({
                      searchParams: { bat: apiToken },
                    }),
                    someTrack
                  ),
                });
                expect(musicService.login).toHaveBeenCalledWith(serviceToken);
                expect(apiTokens.mint).toHaveBeenCalledWith(serviceToken);
                expect(musicLibrary.track).toHaveBeenCalledWith(someTrack.id);
              });
            });

            describe("asking for media metadata for an internet radio station", () => {
              const someStation = aRadioStation()

              beforeEach(() => {
                musicLibrary.radioStation.mockResolvedValue(someStation);
              })

              it("should return it with no auth header", async () => {
                const root = await ws.getMediaMetadataAsync({
                  id: `internetRadioStation:${someStation.id}`,
                });

                expect(root[0]).toEqual({
                  getMediaMetadataResult: internetRadioStation(someStation),
                });
                expect(musicService.login).toHaveBeenCalledWith(serviceToken);
                expect(apiTokens.mint).toHaveBeenCalledWith(serviceToken);
                expect(musicLibrary.radioStation).toHaveBeenCalledWith(someStation.id);
              });
          });
          });
        });

        describe("createContainer", () => {
          let ws: Client;

          beforeEach(async () => {
            ws = await createClientAsync(`${service.uri}?wsdl`, {
              endpoint: service.uri,
              httpClient: supersoap(server),
            });
          });

          itShouldHandleInvalidCredentials((ws) =>
            ws.createContainerAsync({ title: "foobar" })
          );

          describe("when valid credentials are provided", () => {
            beforeEach(() => {
              setupAuthenticatedRequest(ws);
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
                expect(musicService.login).toHaveBeenCalledWith(serviceToken);
                expect(apiTokens.mint).toHaveBeenCalledWith(serviceToken);
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
                expect(musicService.login).toHaveBeenCalledWith(serviceToken);
                expect(apiTokens.mint).toHaveBeenCalledWith(serviceToken);
                expect(musicLibrary.createPlaylist).toHaveBeenCalledWith(title);
                expect(musicLibrary.addToPlaylist).toHaveBeenCalledWith(
                  idOfNewPlaylist,
                  trackId
                );
              });
            });
          });
        });

        describe("deleteContainer", () => {
          const id = "id123";

          let ws: Client;

          beforeEach(async () => {
            ws = await createClientAsync(`${service.uri}?wsdl`, {
              endpoint: service.uri,
              httpClient: supersoap(server),
            });
          });

          itShouldHandleInvalidCredentials((ws) =>
            ws.deleteContainerAsync({ id: "foobar" })
          );

          describe("when valid credentials are provided", () => {
            beforeEach(() => {
              setupAuthenticatedRequest(ws);
            });

            it("should delete the playlist", async () => {
              musicLibrary.deletePlaylist.mockResolvedValue(true);

              const result = await ws.deleteContainerAsync({
                id,
              });

              expect(result[0]).toEqual({ deleteContainerResult: null });
              expect(musicService.login).toHaveBeenCalledWith(serviceToken);
              expect(apiTokens.mint).toHaveBeenCalledWith(serviceToken);
              expect(musicLibrary.deletePlaylist).toHaveBeenCalledWith(id);
            });
          });
        });

        describe("addToContainer", () => {
          const trackId = "track123";
          const playlistId = "parent123";

          let ws: Client;

          beforeEach(async () => {
            ws = await createClientAsync(`${service.uri}?wsdl`, {
              endpoint: service.uri,
              httpClient: supersoap(server),
            });
          });

          itShouldHandleInvalidCredentials((ws) =>
            ws.addToContainerAsync({ id: "foobar", parentId: "parentId" })
          );

          describe("when valid credentials are provided", () => {
            beforeEach(() => {
              setupAuthenticatedRequest(ws);
            });

            it("should add the item to the playlist", async () => {
              musicLibrary.addToPlaylist.mockResolvedValue(true);

              const result = await ws.addToContainerAsync({
                id: `track:${trackId}`,
                parentId: `parent:${playlistId}`,
              });

              expect(result[0]).toEqual({
                addToContainerResult: { updateId: null },
              });
              expect(musicService.login).toHaveBeenCalledWith(serviceToken);
              expect(apiTokens.mint).toHaveBeenCalledWith(serviceToken);
              expect(musicLibrary.addToPlaylist).toHaveBeenCalledWith(
                playlistId,
                trackId
              );
            });
          });
        });

        describe("removeFromContainer", () => {
          let ws: Client;

          beforeEach(async () => {
            ws = await createClientAsync(`${service.uri}?wsdl`, {
              endpoint: service.uri,
              httpClient: supersoap(server),
            });
          });

          itShouldHandleInvalidCredentials((ws) =>
            ws.removeFromContainerAsync({
              id: `playlist:123`,
              indices: `1,6,9`,
            })
          );

          describe("when valid credentials are provided", () => {
            beforeEach(() => {
              setupAuthenticatedRequest(ws);
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
                expect(musicService.login).toHaveBeenCalledWith(serviceToken);
                expect(apiTokens.mint).toHaveBeenCalledWith(serviceToken);
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
                expect(musicService.login).toHaveBeenCalledWith(serviceToken);
                expect(apiTokens.mint).toHaveBeenCalledWith(serviceToken);
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
        });

        describe("rateItem", () => {
          let ws: Client;

          beforeEach(async () => {
            ws = await createClientAsync(`${service.uri}?wsdl`, {
              endpoint: service.uri,
              httpClient: supersoap(server),
            });
          });

          itShouldHandleInvalidCredentials((ws) =>
            ws.rateItemAsync({
              id: `track:123`,
              rating: 4,
            })
          );

          describe("when valid credentials are provided", () => {
            beforeEach(() => {
              setupAuthenticatedRequest(ws);
            });

            describe("rating a track with a positive rating value", () => {
              const trackId = "123";
              const ratingIntValue = 31;

              it("should give the track a love", async () => {
                musicLibrary.rate.mockResolvedValue(true);

                const result = await ws.rateItemAsync({
                  id: `track:${trackId}`,
                  rating: ratingIntValue,
                });

                expect(result[0]).toEqual({
                  rateItemResult: { shouldSkip: false },
                });
                expect(musicService.login).toHaveBeenCalledWith(serviceToken);
                expect(apiTokens.mint).toHaveBeenCalledWith(serviceToken);
                expect(musicLibrary.rate).toHaveBeenCalledWith(
                  trackId,
                  ratingFromInt(ratingIntValue)
                );
              });
            });

            describe("rating a track with a negative rating value", () => {
              const trackId = "123";
              const ratingIntValue = -20;

              it("should give the track a love", async () => {
                musicLibrary.rate.mockResolvedValue(true);

                const result = await ws.rateItemAsync({
                  id: `track:${trackId}`,
                  rating: ratingIntValue,
                });

                expect(result[0]).toEqual({
                  rateItemResult: { shouldSkip: false },
                });
                expect(musicService.login).toHaveBeenCalledWith(serviceToken);
                expect(apiTokens.mint).toHaveBeenCalledWith(serviceToken);
                expect(musicLibrary.rate).toHaveBeenCalledWith(
                  trackId,
                  ratingFromInt(Math.abs(ratingIntValue))
                );
              });
            });
          });
        });

        describe("setPlayedSeconds", () => {
          let ws: Client;

          beforeEach(async () => {
            ws = await createClientAsync(`${service.uri}?wsdl`, {
              endpoint: service.uri,
              httpClient: supersoap(server),
            });
          });

          itShouldHandleInvalidCredentials((ws) =>
            ws.setPlayedSecondsAsync({
              id: `track:123`,
              seconds: `33`,
            })
          );

          describe("when valid credentials are provided", () => {
            beforeEach(() => {
              setupAuthenticatedRequest(ws);
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
                  expect(musicService.login).toHaveBeenCalledWith(serviceToken);
                  expect(apiTokens.mint).toHaveBeenCalledWith(serviceToken);
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
                it("should not scrobble", async () => {
                  const result = await ws.setPlayedSecondsAsync({
                    id: `track:${trackId}`,
                    seconds: `${secondsPlayed}`,
                  });

                  expect(result[0]).toEqual({ setPlayedSecondsResult: null });
                  expect(musicService.login).toHaveBeenCalledWith(serviceToken);
                  expect(apiTokens.mint).toHaveBeenCalledWith(serviceToken);
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
                expect(musicService.login).toHaveBeenCalledWith(serviceToken);
                expect(apiTokens.mint).toHaveBeenCalledWith(serviceToken);
                expect(musicLibrary.scrobble).not.toHaveBeenCalled();
              });
            });
          });
        });
      });
    });
  });
});
