import { createClientAsync, Client } from "soap";
import { Express } from "express";

import request from "supertest";

import {
  GetAppLinkResult,
  GetDeviceAuthTokenResult,
  GetMetadataResponse,
} from "../src/smapi";
import {
  BLONDIE,
  BOB_MARLEY,
  getAppLinkMessage,
  MADONNA,
  someCredentials,
} from "./builders";
import { InMemoryMusicService } from "./in_memory_music_service";
import { InMemoryLinkCodes } from "../src/link_codes";
import { Credentials } from "../src/music_service";
import makeServer from "../src/server";
import { Service, bonobService, SONOS_DISABLED } from "../src/sonos";
import supersoap from "./supersoap";

class LoggedInSonosDriver {
  client: Client;
  token: GetDeviceAuthTokenResult;
  currentMetadata?: GetMetadataResponse = undefined;

  constructor(client: Client, token: GetDeviceAuthTokenResult) {
    this.client = client;
    this.token = token;
    this.client.addSoapHeader({
      credentials: someCredentials(
        this.token.getDeviceAuthTokenResult.authToken
      ),
    });
  }

  async navigate(...path: string[]) {
    let next = path.shift();
    while (next) {
      if (next != "root") {
        const childIds = this.currentMetadata!.getMetadataResult.mediaCollection!.map(
          (it) => it.id
        );
        if (!childIds.includes(next)) {
          throw `Expected to find a child element with id=${next} in order to browse, but found only ${childIds}`;
        }
      }
      this.currentMetadata = (await this.getMetadata(next))[0];
      next = path.shift();
    }
    return this;
  }

  expectTitles(titles: string[]) {
    expect(
      this.currentMetadata!.getMetadataResult.mediaCollection!.map(
        (it) => it.title
      )
    ).toEqual(titles);
    return this;
  }

  async getMetadata(id: string) {
    return await this.client.getMetadataAsync({
      id,
      index: 0,
      count: 100,
    });
  }
}

class SonosDriver {
  server: Express;
  rootUrl: string;
  service: Service;

  constructor(server: Express, rootUrl: string, service: Service) {
    this.server = server;
    this.rootUrl = rootUrl;
    this.service = service;
  }

  stripServiceRoot = (url: string) => url.replace(this.rootUrl, "");

  async addService() {
    expect(this.service.authType).toEqual("AppLink");

    await request(this.server)
      .get(this.stripServiceRoot(this.service.strings!.uri!))
      .expect(200);

    await request(this.server)
      .get(this.stripServiceRoot(this.service.presentation!.uri!))
      .expect(200);

    const client = await createClientAsync(`${this.service.uri}?wsdl`, {
      endpoint: this.service.uri,
      httpClient: supersoap(this.server, this.rootUrl),
    });

    return client
      .getAppLinkAsync(getAppLinkMessage())
      .then(
        ([result]: [GetAppLinkResult]) =>
          result.getAppLinkResult.authorizeAccount.deviceLink
      )
      .then(({ regUrl, linkCode }: { regUrl: string; linkCode: string }) => ({
        login: async ({ username, password }: Credentials) => {
          await request(this.server)
            .get(this.stripServiceRoot(regUrl))
            .expect(200);

          return request(this.server)
            .post(this.stripServiceRoot(regUrl))
            .type("form")
            .send({ username, password, linkCode })
            .then((response) => ({
              expectSuccess: async () => {
                expect(response.status).toEqual(200);
                expect(response.text).toContain("Login successful");

                return client
                  .getDeviceAuthTokenAsync({ linkCode })
                  .then(
                    (authToken: [GetDeviceAuthTokenResult, any]) =>
                      new LoggedInSonosDriver(client, authToken[0])
                  );
              },
              expectFailure: () => {
                expect(response.status).toEqual(403);
                expect(response.text).toContain("Login failed");
              },
            }));
        },
      }));
  }
}

describe("scenarios", () => {
  const bonobUrl = "http://localhost:1234";
  const bonob = bonobService("bonob", 123, bonobUrl);
  const musicService = new InMemoryMusicService().hasArtists(
    BOB_MARLEY,
    BLONDIE
  );
  const linkCodes = new InMemoryLinkCodes();
  const server = makeServer(
    SONOS_DISABLED,
    bonob,
    bonobUrl,
    musicService,
    linkCodes
  );

  const sonosDriver = new SonosDriver(server, bonobUrl, bonob);

  beforeEach(() => {
    musicService.clear();
    linkCodes.clear();
  });

  describe("adding the service", () => {
    describe("when the user doesnt exists within the music service", () => {
      const username = "invaliduser";
      const password = "invalidpassword";

      it("should fail to sign up", async () => {
        musicService.hasNoUsers();

        await sonosDriver
          .addService()
          .then((it) => it.login({ username, password }))
          .then((it) => it.expectFailure());

        expect(linkCodes.count()).toEqual(1);
      });
    });

    describe("when the user exists within the music service", () => {
      const username = "validuser";
      const password = "validpassword";

      beforeEach(() => {
        musicService.hasUser({ username, password });
        musicService.hasArtists(BLONDIE, BOB_MARLEY, MADONNA);
      });

      it("should successfuly sign up", async () => {
        await sonosDriver
          .addService()
          .then((it) => it.login({ username, password }))
          .then((it) => it.expectSuccess());

        expect(linkCodes.count()).toEqual(1);
      });

      it("should be able to list the artists", async () => {
        await sonosDriver
          .addService()
          .then((it) => it.login({ username, password }))
          .then((it) => it.expectSuccess())
          .then((it) => it.navigate("root", "artists"))
          .then((it) =>
            it.expectTitles(
              [BLONDIE, BOB_MARLEY, MADONNA].map(
                (it) => it.name
              )
            )
          );
      });

      it("should be able to list the albums", async () => {
        await sonosDriver
          .addService()
          .then((it) => it.login({ username, password }))
          .then((it) => it.expectSuccess())
          .then((it) => it.navigate("root", "albums"))
          .then((it) =>
            it.expectTitles(
              [...BLONDIE.albums, ...BOB_MARLEY.albums, ...MADONNA.albums].map(
                (it) => it.name
              )
            )
          );
      });
    });
  });
});
