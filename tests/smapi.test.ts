import crypto from "crypto";
import request from "supertest";
import { createClientAsync } from "soap";

import { DOMParserImpl } from "xmldom-ts";
import * as xpath from "xpath-ts";

import { InMemoryLinkCodes, LinkCodes } from "../src/link_codes";
import makeServer from "../src/server";
import { bonobService, SONOS_DISABLED } from "../src/sonos";
import { STRINGS_ROUTE, LOGIN_ROUTE } from "../src/smapi";

import { aService, getAppLinkMessage } from "./builders";
import { InMemoryMusicService } from "./in_memory_music_service";
import supersoap from "./supersoap";

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
          const association = { authToken: "at", userId: "uid", nickname: "nn" };
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
              throw "Shouldnt get here";
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
  
  });

});
