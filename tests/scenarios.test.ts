import { createClientAsync } from "soap";
import { Express } from "express";

import request from "supertest";

import { GetAppLinkResult } from "../src/smapi";
import { InMemoryMusicService, getAppLinkMessage } from "./builders";
import { InMemoryLinkCodes } from "../src/link_codes";
import { Credentials } from "../src/music_service";
import makeServer from "../src/server";
import { Service, bonobService, SONOS_DISABLED } from "../src/sonos";
import supersoap from "./supersoap";

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
      .get(this.stripServiceRoot(this.service.strings.uri!))
      .expect(200);

    await request(this.server)
      .get(this.stripServiceRoot(this.service.presentation.uri!))
      .expect(200);

    return createClientAsync(`${this.service.uri}?wsdl`, {
      endpoint: this.service.uri,
      httpClient: supersoap(this.server, this.rootUrl),
    }).then((client) =>
      client
        .getAppLinkAsync(getAppLinkMessage())
        .then(
          ([result]: [GetAppLinkResult]) =>
            result.getAppLinkResult.authorizeAccount.deviceLink
        )
        .then(({ regUrl, linkCode }: { regUrl: string; linkCode: string }) => ({
          login: async ({ username, password }: Credentials) => {
            await request(this.server).get(this.stripServiceRoot(regUrl)).expect(200);

            return request(this.server)
              .post(this.stripServiceRoot(regUrl))
              .type("form")
              .send({ username, password, linkCode })
              .expect(200)
              .then(response => ({
                expectSuccess: () => {
                  expect(response.text).toContain("ok")
                },
                expectFailure: () => {
                  expect(response.text).toContain("boo")
                },
              }));
          },
        }))
    );
  }
}

describe("scenarios", () => {
  const bonobUrl = "http://localhost:1234";
  const bonob = bonobService("bonob", 123, bonobUrl);
  const musicService = new InMemoryMusicService();
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
    describe("when the user exists within the music service", () => {
      const username = "validuser";
      const password = "validpassword";

      it("should successfully sign up", async () => {
        musicService.hasUser({ username, password });

        await sonosDriver
          .addService()
          .then((it) => it.login({ username, password }))
          .then((it) => it.expectSuccess());

        expect(linkCodes.count()).toEqual(1);
      });
    });

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
  });
});
