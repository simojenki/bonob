import { createClientAsync, Client } from "soap";
import { Express } from "express";

import request from "supertest";

import {
  GetAppLinkResult,
  GetDeviceAuthTokenResult,
  GetMetadataResponse,
} from "../src/smapi";
import {
  aDevice,
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
import { Service, bonobService, Sonos } from "../src/sonos";
import supersoap from "./supersoap";
import url, { URLBuilder } from "../src/url_builder";

class LoggedInSonosDriver {
  client: Client;
  token: GetDeviceAuthTokenResult;
  currentMetadata?: GetMetadataResponse = undefined;

  constructor(client: Client, token: GetDeviceAuthTokenResult) {
    this.client = client;
    this.token = token;
    this.client.addSoapHeader({
      credentials: someCredentials({
        token: this.token.getDeviceAuthTokenResult.authToken,
        key: this.token.getDeviceAuthTokenResult.privateKey
      }),
    });
  }

  async navigate(...path: string[]) {
    let next = path.shift();
    while (next) {
      if (next != "root") {
        const childIds =
          this.currentMetadata!.getMetadataResult.mediaCollection!.map(
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
  bonobUrl: URLBuilder;
  service: Service;

  constructor(server: Express, bonobUrl: URLBuilder, service: Service) {
    this.server = server;
    this.bonobUrl = bonobUrl;
    this.service = service;
  }

  extractPathname = (url: string) => new URL(url).pathname;

  async register() {
    const action = await request(this.server)
      .get(this.bonobUrl.append({ pathname: "/" }).pathname())
      .expect(200)
      .then((response) => {
        const m = response.text.match(/ action="(.*)" /i);
        return m![1]!;
      });

    return request(this.server)
      .post(action)
      .type("form")
      .send({})
      .expect(200)
      .then((response) =>
        expect(response.text).toContain("Successfully registered")
      );
  }

  async addService() {
    expect(this.service.authType).toEqual("AppLink");

    await request(this.server)
      .get(this.extractPathname(this.service.strings!.uri!))
      .expect(200);

    await request(this.server)
      .get(this.extractPathname(this.service.presentation!.uri!))
      .expect(200);

    const client = await createClientAsync(`${this.service.uri}?wsdl`, {
      endpoint: this.service.uri,
      httpClient: supersoap(this.server),
    });

    return client
      .getAppLinkAsync(getAppLinkMessage())
      .then(
        ([result]: [GetAppLinkResult]) =>
          result.getAppLinkResult.authorizeAccount.deviceLink
      )
      .then(({ regUrl, linkCode }: { regUrl: string; linkCode: string }) => ({
        login: async ({ username, password }: Credentials) => {
          const action = await request(this.server)
            .get(this.extractPathname(regUrl))
            .expect(200)
            .then((response) => {
              const m = response.text.match(/ action="(.*)" /i);
              return m![1]!;
            });

          return request(this.server)
            .post(action)
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
  const musicService = new InMemoryMusicService().hasArtists(
    BOB_MARLEY,
    BLONDIE
  );
  const linkCodes = new InMemoryLinkCodes();

  const fakeSonos: Sonos = {
    devices: () => Promise.resolve([aDevice({
      name: "device1",
      ip: "172.0.0.1",
      port: 4301,
    })]),
    services: () => Promise.resolve([]),
    remove: () => Promise.resolve(true),
    register: () => Promise.resolve(true),
  };

  beforeEach(() => {
    musicService.clear();
    linkCodes.clear();
  });

  function itShouldBeAbleToAddTheService(sonosDriver: SonosDriver) {
    describe("registering bonob with the sonos device", () => {
      it("should complete successfully", async () => {
        await sonosDriver.register();
      });
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
                [BLONDIE, BOB_MARLEY, MADONNA].map((it) => it.name)
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
                [
                  ...BLONDIE.albums,
                  ...BOB_MARLEY.albums,
                  ...MADONNA.albums,
                ].map((it) => it.name).sort()
              )
            );
        });
      });
    });
  }

  describe("when the bonobUrl has no context path and no trailing slash", () => {
    const bonobUrl = url("http://localhost:1234");
    const bonob = bonobService("bonob", 123, bonobUrl);
    const server = makeServer(
      fakeSonos,
      bonob,
      bonobUrl,
      musicService,
      {
        linkCodes: () => linkCodes,
      }
    );

    const sonosDriver = new SonosDriver(server, bonobUrl, bonob);

    itShouldBeAbleToAddTheService(sonosDriver);
  });

  describe("when the bonobUrl has no context path, but does have a trailing slash", () => {
    const bonobUrl = url("http://localhost:1234/");
    const bonob = bonobService("bonob", 123, bonobUrl);
    const server = makeServer(
      fakeSonos,
      bonob,
      bonobUrl,
      musicService,
      {
        linkCodes: () => linkCodes
      }
    );

    const sonosDriver = new SonosDriver(server, bonobUrl, bonob);

    itShouldBeAbleToAddTheService(sonosDriver);
  });

  describe("when the bonobUrl has a context path", () => {
    const bonobUrl = url("http://localhost:1234/context-for-bonob");
    const bonob = bonobService("bonob", 123, bonobUrl);
    const server = makeServer(
      fakeSonos,
      bonob,
      bonobUrl,
      musicService,
      {
        linkCodes: () => linkCodes
      }
    );

    const sonosDriver = new SonosDriver(server, bonobUrl, bonob);

    itShouldBeAbleToAddTheService(sonosDriver);
  });
});
