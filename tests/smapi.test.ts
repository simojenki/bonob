import crypto from "crypto";
import request from "supertest";
import { Client, createClientAsync } from "soap";

import { DOMParserImpl } from "xmldom-ts";
import * as xpath from "xpath-ts";

import { InMemoryLinkCodes, LinkCodes } from "../src/link_codes";
import makeServer from "../src/server";
import { bonobService, SONOS_DISABLED } from "../src/sonos";
import { STRINGS_ROUTE, LOGIN_ROUTE, getMetadataResult, container } from "../src/smapi";

import { aService, BLONDIE, BOB_MARLEY, getAppLinkMessage, someCredentials } from "./builders";
import { InMemoryMusicService } from "./in_memory_music_service";
import supersoap from "./supersoap";
import { AuthSuccess } from "../src/music_service";

const parseXML = (value: string) => new DOMParserImpl().parseFromString(value);
const select = xpath.useNamespaces({ sonos: "http://sonos.com/sonosapi" });

describe("service config", () => {
  describe("strings.xml", () => {
    const server = makeServer(
      SONOS_DISABLED,
      aService(),
      "http://localhost:1234",
      new InMemoryMusicService()
    );

    it("should return xml for the strings", async () => {
      const res = await request(server).get(STRINGS_ROUTE).send();

      expect(res.status).toEqual(200);

      const xml = parseXML(res.text);
      const x = select(
        "//sonos:string[@stringId='AppLinkMessage']/text()",
        xml
      ) as Node[];
      expect(x.length).toEqual(1);
      expect(x[0]!.nodeValue).toEqual("Linking sonos with bonob");
    });
  });
});

describe("getMetadataResult", () => {
  describe("when there are a zero mediaCollections", () => {
    it("should have zero count", () => {
      const result = getMetadataResult({ mediaCollection: [] });

      expect(result.getMetadataResult.count).toEqual(0);
      expect(result.getMetadataResult.index).toEqual(0);
      expect(result.getMetadataResult.total).toEqual(0);
      expect(result.getMetadataResult.mediaCollection).toEqual([]);
    });
  });

  describe("when there are a number of mediaCollections", () => {
    it("should add correct counts", () => {
      const mediaCollection = [{}, {}];
      const result = getMetadataResult({ mediaCollection });

      expect(result.getMetadataResult.count).toEqual(2);
      expect(result.getMetadataResult.index).toEqual(0);
      expect(result.getMetadataResult.total).toEqual(2);
      expect(result.getMetadataResult.mediaCollection).toEqual(mediaCollection);
    });
  });
});

describe("api", () => {
  const rootUrl = "http://localhost:1234";
  const service = bonobService("test-api", 133, rootUrl, "AppLink");
  const musicService = new InMemoryMusicService();
  const linkCodes = new InMemoryLinkCodes();

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
      linkCodes
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

          expect(res.text).toContain(`Login failed, Invalid user:${username}`);
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
        (mockLinkCodes as unknown) as LinkCodes
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
        linkCodes
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
        linkCodes
      );

      describe("when no credentials header provided", () => {
        it("should return a fault of LoginUnauthorized", async () => {
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
        it("should return a fault of LoginInvalid", async () => {
          const username = "userThatGetsDeleted";
          const password = "password1";
          musicService.hasUser({ username, password });
          const token = musicService.generateToken({
            username,
            password,
          }) as AuthSuccess;
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

        beforeEach(async () => {
          musicService.hasUser({ username, password });
          token = musicService.generateToken({
            username,
            password,
          }) as AuthSuccess;
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
            expect(root[0]).toEqual(getMetadataResult({
              mediaCollection: [
                container({ id: "artists", title: "Artists" }),
                container({ id: "albums", title: "Albums" }),
              ],
            }));
          });
        });

        describe("asking for artists", () => {
          it("should return it", async () => {
            musicService.hasArtists(BLONDIE, BOB_MARLEY);

            const artists = await ws.getMetadataAsync({
              id: "artists",
              index: 0,
              count: 100,
            });
            expect(artists[0]).toEqual(getMetadataResult({
              mediaCollection: [BLONDIE, BOB_MARLEY].map(it  => container({ id: `artist:${it.id}`, title: it.name })),
            }));
          });
        });

        describe("asking for all albums", () => {
          it("should return it", async () => {
            musicService.hasArtists(BLONDIE, BOB_MARLEY);

            const albums = await ws.getMetadataAsync({
              id: "albums",
              index: 0,
              count: 100,
            });
            expect(albums[0]).toEqual(getMetadataResult({
              mediaCollection: [...BLONDIE.albums, ...BOB_MARLEY.albums].map(it  => container({ id: `album:${it.id}`, title: it.name })),
            }));
          });
        });

        describe("asking for albums with paging", () => {
          it("should return it", async () => {
            musicService.hasArtists(BLONDIE, BOB_MARLEY);

            expect(BLONDIE.albums.length).toEqual(2);
            expect(BOB_MARLEY.albums.length).toEqual(3);

            const albums = await ws.getMetadataAsync({
              id: "albums",
              index: 2,
              count: 2,
            });
            expect(albums[0]).toEqual(getMetadataResult({
              mediaCollection: [
                container({ id: `album:${BOB_MARLEY.albums[0]!.id}`, title: BOB_MARLEY.albums[0]!.name }),
                container({ id: `album:${BOB_MARLEY.albums[1]!.id}`, title: BOB_MARLEY.albums[1]!.name }),
              ],
            }));
          });
        });

      });
    });
  });
});
