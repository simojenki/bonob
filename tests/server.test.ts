import { v4 as uuid } from "uuid";
import dayjs from "dayjs";
import request from "supertest";
import Image from "image-js";
import fs from "fs";
import { either as E, taskEither as TE } from "fp-ts";
import path from "path";

import { AuthFailure, MusicService } from "../src/music_service";
import makeServer, {
  BONOB_ACCESS_TOKEN_HEADER,
  RangeBytesFromFilter,
  rangeFilterFor,
} from "../src/server";

import { Device, Sonos, SONOS_DISABLED } from "../src/sonos";

import { aDevice, aService } from "./builders";
import { InMemoryMusicService } from "./in_memory_music_service";
import { APITokens, InMemoryAPITokens } from "../src/api_tokens";
import { InMemoryLinkCodes, LinkCodes } from "../src/link_codes";
import { Response } from "express";
import { Transform } from "stream";
import url from "../src/url_builder";
import i8n, { randomLang } from "../src/i8n";
import { SONOS_RECOMMENDED_IMAGE_SIZES } from "../src/smapi";
import { Clock, SystemClock } from "../src/clock";
import { formatForURL } from "../src/burn";
import { ExpiredTokenError, SmapiAuthTokens, SmapiToken } from "../src/smapi_auth";

describe("rangeFilterFor", () => {
  describe("invalid range header string", () => {
    it("should fail", () => {
      const cases = [
        "bytes",
        "bytes=0",
        "bytes=-",
        "bytes=100-200,300-400",
        "bytes=100-200, 300-400",
        "seconds",
        "seconds=0",
        "seconds=-",
      ];

      for (let range in cases) {
        expect(() => rangeFilterFor(range)).toThrowError(
          `Unsupported range: ${range}`
        );
      }
    });
  });

  describe("bytes", () => {
    describe("0-", () => {
      it("should return a RangeBytesFromFilter", () => {
        const filter = rangeFilterFor("bytes=0-");

        expect(filter instanceof RangeBytesFromFilter).toEqual(true);
        expect((filter as RangeBytesFromFilter).from).toEqual(0);
        expect(filter.range(100)).toEqual("0-99/100");
      });
    });

    describe("64-", () => {
      it("should return a RangeBytesFromFilter", () => {
        const filter = rangeFilterFor("bytes=64-");

        expect(filter instanceof RangeBytesFromFilter).toEqual(true);
        expect((filter as RangeBytesFromFilter).from).toEqual(64);
        expect(filter.range(8877)).toEqual("64-8876/8877");
      });
    });

    describe("-900", () => {
      it("should fail", () => {
        expect(() => rangeFilterFor("bytes=-900")).toThrowError(
          "Unsupported range: bytes=-900"
        );
      });
    });

    describe("100-200", () => {
      it("should fail", () => {
        expect(() => rangeFilterFor("bytes=100-200")).toThrowError(
          "Unsupported range: bytes=100-200"
        );
      });
    });

    describe("100-200, 400-500", () => {
      it("should fail", () => {
        expect(() => rangeFilterFor("bytes=100-200, 400-500")).toThrowError(
          "Unsupported range: bytes=100-200, 400-500"
        );
      });
    });
  });

  describe("not bytes", () => {
    it("should fail", () => {
      const cases = [
        "seconds=0-",
        "seconds=100-200",
        "chickens=100-200, 400-500",
      ];

      for (let range in cases) {
        expect(() => rangeFilterFor(range)).toThrowError(
          `Unsupported range: ${range}`
        );
      }
    });
  });
});

describe("RangeBytesFromFilter", () => {
  describe("range from", () => {
    describe("0-", () => {
      it("should not filter at all", () => {
        const filter = new RangeBytesFromFilter(0);
        const result: any[] = [];

        const callback = (_?: Error | null, data?: any) => {
          if (data) result.push(...data!);
        };

        filter._transform(["a", "b", "c"], "ascii", callback);
        filter._transform(["d", "e", "f"], "ascii", callback);

        expect(result).toEqual(["a", "b", "c", "d", "e", "f"]);
      });
    });

    describe("1-", () => {
      it("should filter the first byte", () => {
        const filter = new RangeBytesFromFilter(1);
        const result: any[] = [];

        const callback = (_?: Error | null, data?: any) => {
          if (data) result.push(...data!);
        };

        filter._transform(["a", "b", "c"], "ascii", callback);
        filter._transform(["d", "e", "f"], "ascii", callback);

        expect(result).toEqual(["b", "c", "d", "e", "f"]);
      });
    });

    describe("5-", () => {
      it("should filter the first byte", () => {
        const filter = new RangeBytesFromFilter(5);
        const result: any[] = [];

        const callback = (_?: Error | null, data?: any) => {
          if (data) result.push(...data!);
        };

        filter._transform(["a", "b", "c"], "ascii", callback);
        filter._transform(["d", "e", "f"], "ascii", callback);

        expect(result).toEqual(["f"]);
      });
    });
  });
});


describe("server", () => {
  jest.setTimeout(Number.parseInt(process.env["JEST_TIMEOUT"] || "2000"));
  
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetAllMocks();
  });

  const bonobUrlWithNoContextPath = url("http://bonob.localhost:1234");
  const bonobUrlWithContextPath = url("http://bonob.localhost:1234/aContext");

  const langName = randomLang();
  const acceptLanguage = `le-ET,${langName};q=0.9,en;q=0.8`;
  const serviceNameForLang = "Foo Service";
  const lang = i8n(serviceNameForLang)(langName);

  [bonobUrlWithNoContextPath, bonobUrlWithContextPath].forEach((bonobUrl) => {
    describe(`a bonobUrl of ${bonobUrl}`, () => {
      describe("/", () => {
        describe("version", () => {
          describe("when specified", () => {
            const server = makeServer(
              SONOS_DISABLED,
              aService(),
              bonobUrl,
              new InMemoryMusicService(),
              {
                version: "v123.456",
              }
            );
  
            it("should display it", async () => {
              const res = await request(server)
                .get(bonobUrl.append({ pathname: "/" }).pathname())
                .set("accept-language", acceptLanguage)
                .send();
  
              expect(res.status).toEqual(200);
              expect(res.text).toContain('v123.456');
            });
          });

          describe("when not specified", () => {
            const server = makeServer(
              SONOS_DISABLED,
              aService(),
              bonobUrl,
              new InMemoryMusicService()
            );
  
            it("should display the default", async () => {
              const res = await request(server)
                .get(bonobUrl.append({ pathname: "/" }).pathname())
                .set("accept-language", acceptLanguage)
                .send();
  
              expect(res.status).toEqual(200);
              expect(res.text).toContain("v?");
            });
          });
        });

        describe("when sonos integration is disabled", () => {
          const server = makeServer(
            SONOS_DISABLED,
            aService(),
            bonobUrl,
            new InMemoryMusicService()
          );

          describe("devices list", () => {
            it("should be empty", async () => {
              const res = await request(server)
                .get(bonobUrl.append({ pathname: "/" }).pathname())
                .set("accept-language", acceptLanguage)
                .send();

              expect(res.status).toEqual(200);
              expect(res.text).toMatch(`<h2>${lang("devices")} \(0\)</h2>`);
              expect(res.text).not.toMatch(/class=device/);
              expect(res.text).toContain(lang("noSonosDevices"));
            });
          });
        });

        describe("when sonos integration is enabled", () => {
          describe("there are no devices and bonob is not registered", () => {
            const missingBonobService = aService({
              name: "bonobMissing",
              sid: 88,
            });

            const fakeSonos: Sonos = {
              devices: () => Promise.resolve([]),
              services: () => Promise.resolve([]),
              remove: () => Promise.resolve(false),
              register: () => Promise.resolve(false),
            };

            const server = makeServer(
              fakeSonos,
              missingBonobService,
              bonobUrl,
              new InMemoryMusicService()
            );

            describe("devices list", () => {
              it("should be empty", async () => {
                const res = await request(server)
                  .get(bonobUrl.append({ pathname: "/" }).path())
                  .set("accept-language", acceptLanguage)
                  .send();

                expect(res.status).toEqual(200);
                expect(res.text).toMatch(`<h2>${lang("devices")} \(0\)</h2>`);
                expect(res.text).not.toMatch(/class=device/);
                expect(res.text).toContain(lang("noSonosDevices"));
              });
            });

            describe("services", () => {
              it("should be empty", async () => {
                const res = await request(server)
                  .get(bonobUrl.append({ pathname: "/" }).path())
                  .set("accept-language", acceptLanguage)
                  .send();

                expect(res.status).toEqual(200);
                expect(res.text).toMatch(`<h2>${lang("services")} \(0\)</h2>`);
              });
            });
          });

          describe("there are 2 devices and bonob is not registered", () => {
            const service1 = aService({
              name: "s1",
              sid: 1,
            });
            const service2 = aService({
              name: "s2",
              sid: 2,
            });
            const service3 = aService({
              name: "s3",
              sid: 3,
            });
            const service4 = aService({
              name: "s4",
              sid: 4,
            });
            const missingBonobService = aService({
              name: "bonobMissing",
              sid: 88,
            });

            const device1: Device = aDevice({
              name: "device1",
              ip: "172.0.0.1",
              port: 4301,
            });

            const device2: Device = aDevice({
              name: "device2",
              ip: "172.0.0.2",
              port: 4302,
            });

            const fakeSonos: Sonos = {
              devices: () => Promise.resolve([device1, device2]),
              services: () =>
                Promise.resolve([service1, service2, service3, service4]),
              remove: () => Promise.resolve(false),
              register: () => Promise.resolve(false),
            };

            const server = makeServer(
              fakeSonos,
              missingBonobService,
              bonobUrl,
              new InMemoryMusicService()
            );

            describe("devices list", () => {
              it("should contain the devices returned from sonos", async () => {
                const res = await request(server)
                  .get(bonobUrl.append({ pathname: "/" }).path())
                  .set("accept-language", acceptLanguage)
                  .send();

                expect(res.status).toEqual(200);
                expect(res.text).toMatch(`<h2>${lang("devices")} \(2\)</h2>`);
                expect(res.text).toMatch(/device1\s+\(172.0.0.1:4301\)/);
                expect(res.text).toMatch(/device2\s+\(172.0.0.2:4302\)/);
              });
            });

            describe("services", () => {
              it("should contain a list of services returned from sonos", async () => {
                const res = await request(server)
                  .get(bonobUrl.append({ pathname: "/" }).path())
                  .set("accept-language", acceptLanguage)
                  .send();

                expect(res.status).toEqual(200);
                expect(res.text).toMatch(`<h2>${lang("services")} \(4\)</h2>`);
                expect(res.text).toMatch(/s1\s+\(1\)/);
                expect(res.text).toMatch(/s2\s+\(2\)/);
                expect(res.text).toMatch(/s3\s+\(3\)/);
                expect(res.text).toMatch(/s4\s+\(4\)/);
              });
            });

            describe("registration status", () => {
              it("should be not-registered", async () => {
                const res = await request(server)
                  .get(bonobUrl.append({ pathname: "/" }).path())
                  .set("accept-language", acceptLanguage)
                  .send();
                expect(res.status).toEqual(200);
                expect(res.text).toMatch(
                  `<input type="submit" value="${lang("register")}">`
                );
                expect(res.text).toMatch(`<h3>${lang("expectedConfig")}</h3>`);
                expect(res.text).toMatch(
                  `<h3>${lang("noExistingServiceRegistration")}</h3>`
                );
                expect(res.text).not.toMatch(
                  `<input type="submit" value="${lang("removeRegistration")}">`
                );
              });
            });
          });

          describe("there are 2 devices and bonob is registered", () => {
            const service1 = aService();

            const service2 = aService();

            const device1: Device = aDevice({
              name: "device1",
              ip: "172.0.0.1",
              port: 4301,
            });

            const device2: Device = aDevice({
              name: "device2",
              ip: "172.0.0.2",
              port: 4302,
            });

            const bonobService = aService({
              name: "bonobNotMissing",
              sid: 99,
            });

            const fakeSonos: Sonos = {
              devices: () => Promise.resolve([device1, device2]),
              services: () =>
                Promise.resolve([service1, service2, bonobService]),
              remove: () => Promise.resolve(false),
              register: () => Promise.resolve(false),
            };

            const server = makeServer(
              fakeSonos,
              bonobService,
              bonobUrl,
              new InMemoryMusicService()
            );

            describe("registration status", () => {
              it("should be registered", async () => {
                const res = await request(server)
                  .get(bonobUrl.append({ pathname: "/" }).path())
                  .set("accept-language", acceptLanguage)
                  .send();
                expect(res.status).toEqual(200);
                expect(res.text).toMatch(
                  `<input type="submit" value="${lang("register")}">`
                );
                expect(res.text).toMatch(`<h3>${lang("expectedConfig")}</h3>`);
                expect(res.text).toMatch(
                  `<h3>${lang("existingServiceConfig")}</h3>`
                );
                expect(res.text).toMatch(
                  `<input type="submit" value="${lang("removeRegistration")}">`
                );
              });
            });
          });
        });
      });

      describe("/about", () => {
        const sonos = {
          register: jest.fn(),
        };
        const theService = aService({
          name: "We can all live a life of service",
          sid: 999,
        });
        const server = makeServer(
          sonos as unknown as Sonos,
          theService,
          bonobUrl,
          new InMemoryMusicService()
        );

        it("should report some information about the service", async () => {
          const res = await request(server)
            .get(bonobUrl.append({ pathname: "/about" }).path())
            .send();

          expect(res.status).toEqual(200);
          expect(res.body).toEqual({
            service: {
              name: theService.name,
              sid: theService.sid,
            },
          });
        });
      });

      describe("/register", () => {
        const sonos = {
          register: jest.fn(),
          remove: jest.fn(),
        };
        const theService = aService({
          name: "We can all live a life of service",
          sid: 999,
        });
        const server = makeServer(
          sonos as unknown as Sonos,
          theService,
          bonobUrl,
          new InMemoryMusicService()
        );

        describe("registering", () => {
          describe("when is successful", () => {
            it("should return a nice message", async () => {
              sonos.register.mockResolvedValue(true);

              const res = await request(server)
                .post(bonobUrl.append({ pathname: "/registration/add" }).path())
                .set("accept-language", acceptLanguage)
                .send();

              expect(res.status).toEqual(200);
              expect(res.text).toMatch(`<title>${lang("success")}</title>`);
              expect(res.text).toMatch(lang("successfullyRegistered"));

              expect(sonos.register.mock.calls.length).toEqual(1);
              expect(sonos.register.mock.calls[0][0]).toBe(theService);
            });
          });

          describe("when is unsuccessful", () => {
            it("should return a failure message", async () => {
              sonos.register.mockResolvedValue(false);

              const res = await request(server)
                .post(bonobUrl.append({ pathname: "/registration/add" }).path())
                .set("accept-language", acceptLanguage)
                .send();

              expect(res.status).toEqual(500);
              expect(res.text).toMatch(`<title>${lang("failure")}</title>`);
              expect(res.text).toMatch(lang("registrationFailed"));

              expect(sonos.register.mock.calls.length).toEqual(1);
              expect(sonos.register.mock.calls[0][0]).toBe(theService);
            });
          });
        });

        describe("removing a registration", () => {
          describe("when is successful", () => {
            it("should return a nice message", async () => {
              sonos.remove.mockResolvedValue(true);

              const res = await request(server)
                .post(
                  bonobUrl.append({ pathname: "/registration/remove" }).path()
                )
                .set("accept-language", acceptLanguage)
                .send();

              expect(res.status).toEqual(200);
              expect(res.text).toMatch(`<title>${lang("success")}</title>`);
              expect(res.text).toMatch(lang("successfullyRemovedRegistration"));

              expect(sonos.remove.mock.calls.length).toEqual(1);
              expect(sonos.remove.mock.calls[0][0]).toBe(theService.sid);
            });
          });

          describe("when is unsuccessful", () => {
            it("should return a failure message", async () => {
              sonos.remove.mockResolvedValue(false);

              const res = await request(server)
                .post(
                  bonobUrl.append({ pathname: "/registration/remove" }).path()
                )
                .set("accept-language", acceptLanguage)
                .send();

              expect(res.status).toEqual(500);
              expect(res.text).toMatch(`<title>${lang("failure")}</title>`);
              expect(res.text).toMatch(lang("failedToRemoveRegistration"));

              expect(sonos.remove.mock.calls.length).toEqual(1);
              expect(sonos.remove.mock.calls[0][0]).toBe(theService.sid);
            });
          });
        });
      });

      describe("/login", () => {
        const sonos = {
          register: jest.fn(),
          remove: jest.fn(),
        };
        const theService = aService({
          name: serviceNameForLang,
        });

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
        const apiTokens = {
          mint: jest.fn(),
          authTokenFor: jest.fn(),
        };
        const clock = {
          now: jest.fn(),
        };

        const server = makeServer(
          sonos as unknown as Sonos,
          theService,
          bonobUrl,
          musicService as unknown as MusicService,
          {
            linkCodes: () => linkCodes as unknown as LinkCodes,
            apiTokens: () => apiTokens as unknown as APITokens,
            clock,
          }
        );

        it("should return the login page", async () => {
          sonos.register.mockResolvedValue(true);

          const res = await request(server)
            .get(bonobUrl.append({ pathname: "/login" }).path())
            .set("accept-language", acceptLanguage)
            .send();

          expect(res.status).toEqual(200);
          expect(res.text).toMatch(`<title>${lang("login")}</title>`);
          expect(res.text).toMatch(
            `<h1 class="login one-word-per-line">${lang("logInToBonob")}</h1>`
          );
          expect(res.text).toMatch(
            `<label for="username">${lang("username")}:</label>`
          );
          expect(res.text).toMatch(
            `<label for="password">${lang("password")}:</label>`
          );
          expect(res.text).toMatch(
            `<input type="submit" value="${lang("login")}" id="submit">`
          );
        });

        describe("when the credentials are valid", () => {
          it("should return 200 ok and have associated linkCode with user", async () => {
            const username = "jane";
            const password = "password100";
            const linkCode = `linkCode-${uuid()}`;
            const authSuccess = {
              serviceToken: `serviceToken-${uuid()}`,
              userId: `${username}-uid`,
              nickname: `${username}-nickname`,
            };

            linkCodes.has.mockReturnValue(true);
            musicService.generateToken.mockReturnValue(TE.right(authSuccess))
            linkCodes.associate.mockReturnValue(true);

            const res = await request(server)
              .post(bonobUrl.append({ pathname: "/login" }).pathname())
              .set("accept-language", acceptLanguage)
              .type("form")
              .send({ username, password, linkCode })
              .expect(200);

            expect(res.text).toContain(lang("loginSuccessful"));

            expect(musicService.generateToken).toHaveBeenCalledWith({
              username,
              password,
            });
            expect(linkCodes.has).toHaveBeenCalledWith(linkCode);
            expect(linkCodes.associate).toHaveBeenCalledWith(
              linkCode,
              authSuccess
            );
          });
        });

        describe("when credentials are invalid", () => {
          it("should return 403 with message", async () => {
            const username = "userDoesntExist";
            const password = "password";
            const linkCode = uuid();
            const message = `Invalid user:${username}`;

            linkCodes.has.mockReturnValue(true);
            musicService.generateToken.mockReturnValue(TE.left(new AuthFailure(message)))

            const res = await request(server)
              .post(bonobUrl.append({ pathname: "/login" }).pathname())
              .set("accept-language", acceptLanguage)
              .type("form")
              .send({ username, password, linkCode })
              .expect(403);

            expect(res.text).toContain(lang("loginFailed"));
            expect(res.text).toContain(message);
          });
        });

        describe("when linkCode is invalid", () => {
          it("should return 400 with message", async () => {
            const username = "jane";
            const password = "password100";
            const linkCode = "someLinkCodeThatDoesntExist";

            linkCodes.has.mockReturnValue(false);

            const res = await request(server)
              .post(bonobUrl.append({ pathname: "/login" }).pathname())
              .set("accept-language", acceptLanguage)
              .type("form")
              .send({ username, password, linkCode })
              .expect(400);

            expect(res.text).toContain(lang("invalidLinkCode"));
          });
        });
      });

      describe("/stream", () => {
        const musicService = {
          login: jest.fn(),
        };
        const musicLibrary = {
          stream: jest.fn(),
          scrobble: jest.fn(),
          nowPlaying: jest.fn(),
        };
        const smapiAuthTokens = {
          verify: jest.fn(),
        }
        const apiTokens = new InMemoryAPITokens();

        const server = makeServer(
          jest.fn() as unknown as Sonos,
          aService(),
          bonobUrl,
          musicService as unknown as MusicService,
          {
            linkCodes: () => new InMemoryLinkCodes(),
            apiTokens: () => apiTokens,
            smapiAuthTokens: smapiAuthTokens as unknown as SmapiAuthTokens
          }
        );

        const serviceToken = `serviceToken-${uuid()}`;
        const trackId = `t-${uuid()}`;
        const smapiAuthToken: SmapiToken = { token: `token-${uuid()}`, key: `key-${uuid()}` };

        const streamContent = (content: string) => ({
          pipe: (_: Transform) => {
            return {
              pipe: (res: Response) => {
                res.send(content);
              },
            };
          },
        });

        describe("HEAD requests", () => {
          describe("when there is no Bearer token", () => {
            it("should return a 401", async () => {
              const res = await request(server).head(
                bonobUrl.append({ pathname: `/stream/track/${trackId}` }).path()
              );

              expect(res.status).toEqual(401);
            });
          });

          describe("when the authorization has expired", () => {
            it("should return a 401", async () => {
              smapiAuthTokens.verify.mockReturnValue(E.left(new ExpiredTokenError(serviceToken)))

              const res = await request(server).head(
                bonobUrl
                  .append({
                    pathname: `/stream/track/${trackId}`
                  })
                  .path(),
              )
              .set('bnbt', smapiAuthToken.token)
              .set('bnbk', smapiAuthToken.key);

              expect(res.status).toEqual(401);
            });
          });

          describe("when the authorization token & key are valid", () => {
            beforeEach(() => {
              smapiAuthTokens.verify.mockReturnValue(E.right(serviceToken));
            });

            describe("and the track exists", () => {
              it("should return a 200", async () => {
                const trackStream = {
                  status: 200,
                  headers: {
                    // audio/x-flac should be mapped to x-flac
                    "content-type": "audio/x-flac; whoop; foo-bar",
                    "content-length": "123",
                  },
                  stream: streamContent(""),
                };

                musicService.login.mockResolvedValue(musicLibrary);
                musicLibrary.stream.mockResolvedValue(trackStream);

                const res = await request(server)
                  .head(
                    bonobUrl
                      .append({ pathname: `/stream/track/${trackId}`})
                      .path()
                  )
                  .set('bnbt', smapiAuthToken.token)
                  .set('bnbk', smapiAuthToken.key);

                expect(res.status).toEqual(trackStream.status);
                expect(res.headers["content-type"]).toEqual(
                  "audio/flac; whoop; foo-bar"
                );
                expect(res.headers["content-length"]).toEqual("123");
                expect(res.body).toEqual({});
              });
            });

            describe("and the track doesnt exist", () => {
              it("should return a 404", async () => {
                const trackStream = {
                  status: 404,
                  headers: {},
                  stream: streamContent(""),
                };

                musicService.login.mockResolvedValue(musicLibrary);
                musicLibrary.stream.mockResolvedValue(trackStream);

                const res = await request(server)
                  .head(bonobUrl
                    .append({ pathname: `/stream/track/${trackId}` })
                    .path()
                  )
                  .set('bnbt', smapiAuthToken.token)
                  .set('bnbk', smapiAuthToken.key);
      

                expect(res.status).toEqual(404);
                expect(res.body).toEqual({});
              });
            });
          });
        });

        describe("GET requests", () => {
          describe("when there is no Bearer token", () => {
            it("should return a 401", async () => {
              const res = await request(server).get(
                bonobUrl.append({ pathname: `/stream/track/${trackId}` }).path()
              );

              expect(res.status).toEqual(401);
            });
          });

          describe("when the Bearer token has expired", () => {
            it("should return a 401", async () => {
              smapiAuthTokens.verify.mockReturnValue(E.left(new ExpiredTokenError(serviceToken)))

              const res = await request(server)
                .get(
                  bonobUrl
                    .append({ pathname: `/stream/track/${trackId}` })
                    .path()
                )                  
                .set('bnbt', smapiAuthToken.token)
                .set('bnbk', smapiAuthToken.key);

              expect(res.status).toEqual(401);
            });
          });

          describe("when the authorization token & key is valid", () => {
            beforeEach(() => {
              smapiAuthTokens.verify.mockReturnValue(E.right(serviceToken));
            });

            describe("when the track doesnt exist", () => {
              it("should return a 404", async () => {
                const stream = {
                  status: 404,
                  headers: {},
                  stream: streamContent(""),
                };
  
                musicService.login.mockResolvedValue(musicLibrary);
                musicLibrary.stream.mockResolvedValue(stream);
  
                const res = await request(server)
                  .get(
                    bonobUrl
                      .append({ pathname: `/stream/track/${trackId}` })
                      .path()
                  )                
                  .set('bnbt', smapiAuthToken.token)
                  .set('bnbk', smapiAuthToken.key);
  
                expect(res.status).toEqual(404);
  
                expect(musicLibrary.nowPlaying).not.toHaveBeenCalled();
                expect(musicLibrary.stream).toHaveBeenCalledWith({ trackId });
              });
            });
  
            describe("when sonos does not ask for a range", () => {
              describe("when the music service does not return a content-range, content-length or accept-ranges", () => {
                it("should return a 200 with the data, without adding the undefined headers", async () => {
                  const content = "some-track";
  
                  const stream = {
                    status: 200,
                    headers: {
                      // audio/x-flac should be mapped to audio/flac
                      "content-type": "audio/x-flac; charset=utf-8",
                    },
                    stream: streamContent(content),
                  };
  
                  musicService.login.mockResolvedValue(musicLibrary);
                  musicLibrary.stream.mockResolvedValue(stream);
                  musicLibrary.nowPlaying.mockResolvedValue(true);
  
                  const res = await request(server)
                    .get(
                      bonobUrl
                        .append({ pathname: `/stream/track/${trackId}` })
                        .path()
                    )
                    .set('bnbt', smapiAuthToken.token)
                    .set('bnbk', smapiAuthToken.key);
  
                  expect(res.status).toEqual(stream.status);
                  expect(res.headers["content-type"]).toEqual(
                    "audio/flac; charset=utf-8"
                  );
                  expect(res.header["accept-ranges"]).toBeUndefined();
                  expect(res.headers["content-length"]).toEqual(
                    `${content.length}`
                  );
                  expect(Object.keys(res.headers)).not.toContain("content-range");
  
                  expect(musicService.login).toHaveBeenCalledWith(serviceToken);
                  expect(musicLibrary.nowPlaying).toHaveBeenCalledWith(trackId);
                  expect(musicLibrary.stream).toHaveBeenCalledWith({ trackId });
                });
              });
  
              describe("when the music service returns undefined values for content-range, content-length or accept-ranges", () => {
                it("should return a 200 with the data, without adding the undefined headers", async () => {
                  const stream = {
                    status: 200,
                    headers: {
                      "content-type": "audio/mp3",
                      "content-length": undefined,
                      "accept-ranges": undefined,
                      "content-range": undefined,
                    },
                    stream: streamContent(""),
                  };
  
                  musicService.login.mockResolvedValue(musicLibrary);
                  musicLibrary.stream.mockResolvedValue(stream);
                  musicLibrary.nowPlaying.mockResolvedValue(true);
  
                  const res = await request(server)
                    .get(
                      bonobUrl
                        .append({ pathname: `/stream/track/${trackId}` })
                        .path()
                    )
                    .set('bnbt', smapiAuthToken.token)
                    .set('bnbk', smapiAuthToken.key);
  
                  expect(res.status).toEqual(stream.status);
                  expect(res.headers["content-type"]).toEqual(
                    "audio/mp3; charset=utf-8"
                  );
                  expect(res.header["accept-ranges"]).toEqual(
                    stream.headers["accept-ranges"]
                  );
                  expect(Object.keys(res.headers)).not.toContain("content-range");
  
                  expect(musicService.login).toHaveBeenCalledWith(serviceToken);
                  expect(musicLibrary.nowPlaying).toHaveBeenCalledWith(trackId);
                  expect(musicLibrary.stream).toHaveBeenCalledWith({ trackId });
                });
              });
  
              describe("when the music service returns a 200", () => {
                it("should return a 200 with the data", async () => {
                  const stream = {
                    status: 200,
                    headers: {
                      "content-type": "audio/mp3",
                      "content-length": "222",
                      "accept-ranges": "bytes",
                    },
                    stream: streamContent(""),
                  };
  
                  musicService.login.mockResolvedValue(musicLibrary);
                  musicLibrary.stream.mockResolvedValue(stream);
                  musicLibrary.nowPlaying.mockResolvedValue(true);
  
                  const res = await request(server)
                    .get(
                      bonobUrl
                        .append({ pathname: `/stream/track/${trackId}` })
                        .path()
                    )
                    .set('bnbt', smapiAuthToken.token)
                    .set('bnbk', smapiAuthToken.key);
  
                  expect(res.status).toEqual(stream.status);
                  expect(res.header["content-type"]).toEqual(
                    `${stream.headers["content-type"]}; charset=utf-8`
                  );
                  expect(res.header["accept-ranges"]).toEqual(
                    stream.headers["accept-ranges"]
                  );
                  expect(res.header["content-range"]).toBeUndefined();
  
                  expect(musicService.login).toHaveBeenCalledWith(serviceToken);
                  expect(musicLibrary.nowPlaying).toHaveBeenCalledWith(trackId);
                  expect(musicLibrary.stream).toHaveBeenCalledWith({ trackId });
                });
              });
  
              describe("when the music service returns a 206", () => {
                it("should return a 206 with the data", async () => {
                  const stream = {
                    status: 206,
                    headers: {
                      "content-type": "audio/ogg",
                      "content-length": "333",
                      "accept-ranges": "bytez",
                      "content-range": "100-200",
                    },
                    stream: streamContent(""),
                  };
  
                  musicService.login.mockResolvedValue(musicLibrary);
                  musicLibrary.stream.mockResolvedValue(stream);
                  musicLibrary.nowPlaying.mockResolvedValue(true);
  
                  const res = await request(server)
                    .get(
                      bonobUrl
                        .append({ pathname: `/stream/track/${trackId}` })
                        .path()
                    )
                    .set('bnbt', smapiAuthToken.token)
                    .set('bnbk', smapiAuthToken.key);
  
                  expect(res.status).toEqual(stream.status);
                  expect(res.header["content-type"]).toEqual(
                    `${stream.headers["content-type"]}; charset=utf-8`
                  );
                  expect(res.header["accept-ranges"]).toEqual(
                    stream.headers["accept-ranges"]
                  );
                  expect(res.header["content-range"]).toEqual(
                    stream.headers["content-range"]
                  );
  
                  expect(musicService.login).toHaveBeenCalledWith(serviceToken);
                  expect(musicLibrary.nowPlaying).toHaveBeenCalledWith(trackId);
                  expect(musicLibrary.stream).toHaveBeenCalledWith({ trackId });
                });
              });
            });
  
            describe("when sonos does ask for a range", () => {
              describe("when the music service returns a 200", () => {
                it("should return a 200 with the data", async () => {
                  const stream = {
                    status: 200,
                    headers: {
                      "content-type": "audio/mp3",
                      "content-length": "222",
                      "accept-ranges": "none",
                    },
                    stream: streamContent(""),
                  };
  
                  musicService.login.mockResolvedValue(musicLibrary);
                  musicLibrary.stream.mockResolvedValue(stream);
                  musicLibrary.nowPlaying.mockResolvedValue(true);
  
                  const requestedRange = "40-";
  
                  const res = await request(server)
                    .get(
                      bonobUrl
                        .append({ pathname: `/stream/track/${trackId}` })
                        .path()
                    )
                    .set('bnbt', smapiAuthToken.token)
                    .set('bnbk', smapiAuthToken.key)
                    .set("Range", requestedRange);
  
                  expect(res.status).toEqual(stream.status);
                  expect(res.header["content-type"]).toEqual(
                    `${stream.headers["content-type"]}; charset=utf-8`
                  );
                  expect(res.header["accept-ranges"]).toEqual(
                    stream.headers["accept-ranges"]
                  );
                  expect(res.header["content-range"]).toBeUndefined();
  
                  expect(musicService.login).toHaveBeenCalledWith(serviceToken);
                  expect(musicLibrary.nowPlaying).toHaveBeenCalledWith(trackId);
                  expect(musicLibrary.stream).toHaveBeenCalledWith({
                    trackId,
                    range: requestedRange,
                  });
                });
              });
  
              describe("when the music service returns a 206", () => {
                it("should return a 206 with the data", async () => {
                  const stream = {
                    status: 206,
                    headers: {
                      "content-type": "audio/ogg",
                      "content-length": "333",
                      "accept-ranges": "bytez",
                      "content-range": "100-200",
                    },
                    stream: streamContent(""),
                  };
  
                  musicService.login.mockResolvedValue(musicLibrary);
                  musicLibrary.stream.mockResolvedValue(stream);
                  musicLibrary.nowPlaying.mockResolvedValue(true);
  
                  const res = await request(server)
                    .get(
                      bonobUrl
                        .append({ pathname: `/stream/track/${trackId}` })
                        .path()
                    )
                    .set('bnbt', smapiAuthToken.token)
                    .set('bnbk', smapiAuthToken.key)
                    .set("Range", "4000-5000");
  
                  expect(res.status).toEqual(stream.status);
                  expect(res.header["content-type"]).toEqual(
                    `${stream.headers["content-type"]}; charset=utf-8`
                  );
                  expect(res.header["accept-ranges"]).toEqual(
                    stream.headers["accept-ranges"]
                  );
                  expect(res.header["content-range"]).toEqual(
                    stream.headers["content-range"]
                  );
  
                  expect(musicService.login).toHaveBeenCalledWith(serviceToken);
                  expect(musicLibrary.nowPlaying).toHaveBeenCalledWith(trackId);
                  expect(musicLibrary.stream).toHaveBeenCalledWith({
                    trackId,
                    range: "4000-5000",
                  });
                });
              });
            });
          });
          
        });
      });

      describe("/art", () => {
        const musicService = {
          login: jest.fn(),
        };
        const musicLibrary = {
          coverArt: jest.fn(),
        };
        const apiTokens = new InMemoryAPITokens();

        const server = makeServer(
          jest.fn() as unknown as Sonos,
          aService(),
          url("http://localhost:1234"),
          musicService as unknown as MusicService,
          {
            linkCodes: () => new InMemoryLinkCodes(),
            apiTokens: () => apiTokens,
          }
        );

        const serviceToken = uuid();
        const albumId = uuid();
        let apiToken: string;

        const coverArtResponse = (
          opt: Partial<{ status: number; contentType: string; data: Buffer }>
        ) => ({
          status: 200,
          contentType: "image/jpeg",
          data: Buffer.from(uuid(), "ascii"),
          ...opt,
        });

        beforeEach(() => {
          apiToken = apiTokens.mint(serviceToken);
        });

        describe("when there is no access-token", () => {
          it("should return a 401", async () => {
            const res = await request(server).get(`/art/${encodeURIComponent(formatForURL({ system: "subsonic", resource: "art:whatever" }))}/size/180`);

            expect(res.status).toEqual(401);
          });
        });

        describe("when there is a valid access token", () => {
          describe("art", () => {
            ["0", "-1", "foo"].forEach((size) => {
              describe(`invalid size of ${size}`, () => {
                it(`should return a 400`, async () => {
                  const coverArtURN = { system: "subsonic", resource: "art:400" };

                  musicService.login.mockResolvedValue(musicLibrary);
                  const res = await request(server)
                    .get(
                      `/art/${encodeURIComponent(formatForURL(coverArtURN))}/size/${size}?${BONOB_ACCESS_TOKEN_HEADER}=${apiToken}`
                    )
                    .set(BONOB_ACCESS_TOKEN_HEADER, apiToken);

                  expect(res.status).toEqual(400);
                });
              });
            });

            describe("fetching a single image", () => {
              describe("when the images is available", () => {
                it("should return the image and a 200", async () => {
                  const coverArtURN = { system: "subsonic", resource: "art:200" };

                  const coverArt = coverArtResponse({});

                  musicService.login.mockResolvedValue(musicLibrary);

                  musicLibrary.coverArt.mockResolvedValue(coverArt);

                  const res = await request(server)
                    .get(
                      `/art/${encodeURIComponent(formatForURL(coverArtURN))}/size/180?${BONOB_ACCESS_TOKEN_HEADER}=${apiToken}`
                    )
                    .set(BONOB_ACCESS_TOKEN_HEADER, apiToken);

                  expect(res.status).toEqual(coverArt.status);
                  expect(res.header["content-type"]).toEqual(
                    coverArt.contentType
                  );

                  expect(musicService.login).toHaveBeenCalledWith(serviceToken);
                  expect(musicLibrary.coverArt).toHaveBeenCalledWith(
                    coverArtURN,
                    180
                  );
                });
              });

              describe("when the image is not available", () => {
                it("should return a 404", async () => {
                  const coverArtURN = { system: "subsonic", resource: "art:404" };

                  musicService.login.mockResolvedValue(musicLibrary);
                  musicLibrary.coverArt.mockResolvedValue(undefined);

                  const res = await request(server)
                    .get(
                      `/art/${encodeURIComponent(formatForURL(coverArtURN))}/size/180?${BONOB_ACCESS_TOKEN_HEADER}=${apiToken}`
                    )
                    .set(BONOB_ACCESS_TOKEN_HEADER, apiToken);

                  expect(res.status).toEqual(404);
                });
              });
            });

            describe("fetching multiple images as a collage", () => {
              const png = fs.readFileSync(
                path.join(
                  __dirname,
                  "..",
                  "docs",
                  "images",
                  "chartreuseFuchsia.png"
                )
              );

              describe("fetching a collage of 4 when all are available", () => {
                it("should return the image and a 200", async () => {
                  const urns = [
                    "art:1",
                    "art:2",
                    "art:3",
                    "art:4",
                  ].map(resource => ({ system:"subsonic", resource }));

                  musicService.login.mockResolvedValue(musicLibrary);

                  urns.forEach((_) => {
                    musicLibrary.coverArt.mockResolvedValueOnce(
                      coverArtResponse({
                        data: png,
                      })
                    );
                  });

                  const res = await request(server)
                    .get(
                      `/art/${urns.map(it => encodeURIComponent(formatForURL(it))).join(
                        "&"
                      )}/size/200?${BONOB_ACCESS_TOKEN_HEADER}=${apiToken}`
                    )
                    .set(BONOB_ACCESS_TOKEN_HEADER, apiToken);

                  expect(res.status).toEqual(200);
                  expect(res.header["content-type"]).toEqual("image/png");

                  expect(musicService.login).toHaveBeenCalledWith(serviceToken);
                  urns.forEach((it) => {
                    expect(musicLibrary.coverArt).toHaveBeenCalledWith(it, 200);
                  });

                  const image = await Image.load(res.body);
                  expect(image.width).toEqual(200);
                  expect(image.height).toEqual(200);
                });
              });

              describe("fetching a collage of 4, however only 1 is available", () => {
                it("should return the single image", async () => {
                  const urns = ["art:1", "art:2", "art:3", "art:4"].map(resource => ({ system:"subsonic", resource }));

                  musicService.login.mockResolvedValue(musicLibrary);

                  musicLibrary.coverArt.mockResolvedValueOnce(undefined);
                  musicLibrary.coverArt.mockResolvedValueOnce(undefined);
                  musicLibrary.coverArt.mockResolvedValueOnce(undefined);
                  musicLibrary.coverArt.mockResolvedValueOnce(
                    coverArtResponse({
                      data: png,
                      contentType: "image/some-mime-type",
                    })
                  );

                  const res = await request(server)
                    .get(
                      `/art/${urns.map(it => encodeURIComponent(formatForURL(it))).join(
                        "&"
                      )}/size/200?${BONOB_ACCESS_TOKEN_HEADER}=${apiToken}`
                    )
                    .set(BONOB_ACCESS_TOKEN_HEADER, apiToken);

                  expect(res.status).toEqual(200);
                  expect(res.header["content-type"]).toEqual(
                    "image/some-mime-type"
                  );
                });
              });

              describe("fetching a collage of 4 and all are missing", () => {
                it("should return a 404", async () => {
                  const urns = ["art:1", "art:2", "art:3", "art:4"].map(resource => ({ system:"subsonic", resource }));

                  musicService.login.mockResolvedValue(musicLibrary);

                  urns.forEach((_) => {
                    musicLibrary.coverArt.mockResolvedValueOnce(undefined);
                  });

                  const res = await request(server)
                    .get(
                      `/art/${urns.map(it => encodeURIComponent(formatForURL(it))).join(
                        "&"
                      )}/size/200?${BONOB_ACCESS_TOKEN_HEADER}=${apiToken}`
                    )
                    .set(BONOB_ACCESS_TOKEN_HEADER, apiToken);

                  expect(res.status).toEqual(404);
                });
              });

              describe("fetching a collage of 9 when all are available", () => {
                it("should return the image and a 200", async () => {
                  const urns = [
                    "artist:1",
                    "artist:2",
                    "coverArt:3",
                    "artist:4",
                    "artist:5",
                    "artist:6",
                    "artist:7",
                    "artist:8",
                    "artist:9",
                  ].map(resource => ({ system:"subsonic", resource }));

                  musicService.login.mockResolvedValue(musicLibrary);

                  urns.forEach((_) => {
                    musicLibrary.coverArt.mockResolvedValueOnce(
                      coverArtResponse({
                        data: png,
                      })
                    );
                  });

                  const res = await request(server)
                    .get(
                      `/art/${urns.map(it => encodeURIComponent(formatForURL(it))).join(
                        "&"
                      )}/size/180?${BONOB_ACCESS_TOKEN_HEADER}=${apiToken}`
                    )
                    .set(BONOB_ACCESS_TOKEN_HEADER, apiToken);

                  expect(res.status).toEqual(200);
                  expect(res.header["content-type"]).toEqual("image/png");

                  expect(musicService.login).toHaveBeenCalledWith(serviceToken);
                  urns.forEach((it) => {
                    expect(musicLibrary.coverArt).toHaveBeenCalledWith(it, 180);
                  });

                  const image = await Image.load(res.body);
                  expect(image.width).toEqual(180);
                  expect(image.height).toEqual(180);
                });
              });

              describe("fetching a collage of 9 when only 2 are available", () => {
                it("should still return an image and a 200", async () => {
                  const urns = [
                    "artist:1",
                    "artist:2",
                    "artist:3",
                    "artist:4",
                    "artist:5",
                    "artist:6",
                    "artist:7",
                    "artist:8",
                    "artist:9",
                  ].map(resource => ({ system:"subsonic", resource }));

                  musicService.login.mockResolvedValue(musicLibrary);

                  musicLibrary.coverArt.mockResolvedValueOnce(
                    coverArtResponse({
                      data: png,
                    })
                  );
                  musicLibrary.coverArt.mockResolvedValueOnce(
                    coverArtResponse({
                      data: png,
                    })
                  );
                  musicLibrary.coverArt.mockResolvedValueOnce(undefined);
                  musicLibrary.coverArt.mockResolvedValueOnce(undefined);
                  musicLibrary.coverArt.mockResolvedValueOnce(undefined);
                  musicLibrary.coverArt.mockResolvedValueOnce(undefined);
                  musicLibrary.coverArt.mockResolvedValueOnce(undefined);
                  musicLibrary.coverArt.mockResolvedValueOnce(undefined);
                  musicLibrary.coverArt.mockResolvedValueOnce(undefined);

                  const res = await request(server)
                    .get(
                      `/art/${urns.map(it => encodeURIComponent(formatForURL(it))).join(
                        "&"
                      )}/size/180?${BONOB_ACCESS_TOKEN_HEADER}=${apiToken}`
                    )
                    .set(BONOB_ACCESS_TOKEN_HEADER, apiToken);

                  expect(res.status).toEqual(200);
                  expect(res.header["content-type"]).toEqual("image/png");

                  expect(musicService.login).toHaveBeenCalledWith(serviceToken);
                  urns.forEach((urn) => {
                    expect(musicLibrary.coverArt).toHaveBeenCalledWith(urn, 180);
                  });

                  const image = await Image.load(res.body);
                  expect(image.width).toEqual(180);
                  expect(image.height).toEqual(180);
                });
              });

              describe("fetching a collage of 11", () => {
                it("should still return an image and a 200, though will only display 9", async () => {
                  const urns = [
                    "artist:1",
                    "artist:2",
                    "artist:3",
                    "artist:4",
                    "artist:5",
                    "artist:6",
                    "artist:7",
                    "artist:8",
                    "artist:9",
                    "artist:10",
                    "artist:11",
                  ].map(resource => ({ system:"subsonic", resource }));

                  musicService.login.mockResolvedValue(musicLibrary);

                  urns.forEach((_) => {
                    musicLibrary.coverArt.mockResolvedValueOnce(
                      coverArtResponse({
                        data: png,
                      })
                    );
                  });

                  const res = await request(server)
                    .get(
                      `/art/${urns.map(it => encodeURIComponent(formatForURL(it))).join(
                        "&"
                      )}/size/180?${BONOB_ACCESS_TOKEN_HEADER}=${apiToken}`
                    )
                    .set(BONOB_ACCESS_TOKEN_HEADER, apiToken);

                  expect(res.status).toEqual(200);
                  expect(res.header["content-type"]).toEqual("image/png");

                  expect(musicService.login).toHaveBeenCalledWith(serviceToken);
                  urns.forEach((it) => {
                    expect(musicLibrary.coverArt).toHaveBeenCalledWith(it, 180);
                  });

                  const image = await Image.load(res.body);
                  expect(image.width).toEqual(180);
                  expect(image.height).toEqual(180);
                });
              });

              describe("when the image is not available", () => {
                it("should return a 404", async () => {
                  const coverArtURN = { system:"subsonic", resource:"art:404"};

                  musicService.login.mockResolvedValue(musicLibrary);
                  musicLibrary.coverArt.mockResolvedValue(undefined);

                  const res = await request(server)
                    .get(
                      `/art/${encodeURIComponent(formatForURL(coverArtURN))}/size/180?${BONOB_ACCESS_TOKEN_HEADER}=${apiToken}`
                    )
                    .set(BONOB_ACCESS_TOKEN_HEADER, apiToken);

                  expect(res.status).toEqual(404);
                });
              });
            });

            describe("when there is an error", () => {
              it("should return a 500", async () => {
                musicService.login.mockResolvedValue(musicLibrary);

                musicLibrary.coverArt.mockRejectedValue("Boom");

                const res = await request(server)
                  .get(
                    `/art/artist:${albumId}/size/180?${BONOB_ACCESS_TOKEN_HEADER}=${apiToken}`
                  )
                  .set(BONOB_ACCESS_TOKEN_HEADER, apiToken);

                expect(res.status).toEqual(500);
              });
            });
          });
        });
      });

      describe("/icon", () => {
        const server = (
          clock: Clock = SystemClock,
          iconColors: {
            foregroundColor: string | undefined;
            backgroundColor: string | undefined;
          } = { foregroundColor: undefined, backgroundColor: undefined }
        ) =>
          makeServer(
            jest.fn() as unknown as Sonos,
            aService(),
            url("http://localhost:1234"),
            jest.fn() as unknown as MusicService,
            {
              linkCodes: () => new InMemoryLinkCodes(),
              apiTokens: () => jest.fn() as unknown as APITokens,
              clock,
              iconColors,
            }
          );

        describe("invalid icon names", () => {
          [
            "..%2F..%2Ffoo",
            "%2Fetc%2Fpasswd",
            ".%2Fbob.js",
            ".",
            "..",
            "1",
            "%23%24",
            "notAValidIcon",
          ].forEach((type) => {
            describe(`trying to retrieve an icon with name ${type}`, () => {
              it(`should fail`, async () => {
                const response = await request(server()).get(
                  `/icon/${type}/size/legacy`
                );

                expect(response.status).toEqual(404);
              });
            });
          });
        });

        describe("invalid size", () => {
          ["-1", "0", "59", "foo"].forEach((size) => {
            describe(`trying to retrieve an icon with size ${size}`, () => {
              it(`should fail`, async () => {
                const response = await request(server()).get(
                  `/icon/artists/size/${size}`
                );

                expect(response.status).toEqual(400);
              });
            });
          });
        });

        describe("fetching", () => {
          [
            "artists",
            "albums",
            "playlists",
            "genres",
            "random",
            "heart",
            "recentlyAdded",
            "recentlyPlayed",
            "mostPlayed",
            "discover",
            "error",
          ].forEach((type) => {
            describe(`type=${type}`, () => {
              describe(`legacy icon`, () => {
                it("should return the png image", async () => {
                  const response = await request(server()).get(
                    `/icon/${type}/size/legacy`
                  );

                  expect(response.status).toEqual(200);
                  expect(response.header["content-type"]).toEqual("image/png");
                  const image = await Image.load(response.body);
                  expect(image.width).toEqual(80);
                  expect(image.height).toEqual(80);
                });
              });

              describe("svg icon", () => {
                SONOS_RECOMMENDED_IMAGE_SIZES.forEach((size) => {
                  it(`should return an svg image for size = ${size}`, async () => {
                    const response = await request(server()).get(
                      `/icon/${type}/size/${size}`
                    );

                    expect(response.status).toEqual(200);
                    expect(response.header["content-type"]).toEqual(
                      "image/svg+xml; charset=utf-8"
                    );
                    const svg = Buffer.from(response.body).toString();
                    expect(svg).toContain(
                      ` xmlns="http://www.w3.org/2000/svg" `
                    );
                  });
                });

                it("should return icon colors as per config if overriden", async () => {
                  const response = await request(
                    server(SystemClock, {
                      foregroundColor: "brightblue",
                      backgroundColor: "brightpink",
                    })
                  ).get(`/icon/${type}/size/180`);

                  expect(response.status).toEqual(200);
                  const svg = Buffer.from(response.body).toString();
                  expect(svg).toContain(`fill="brightblue"`);
                  expect(svg).toContain(`fill="brightpink"`);
                });

                function itShouldBeFestive(
                  theme: string,
                  date: string,
                  id: string,
                  color1: string,
                  color2: string
                ) {
                  it(`should return a ${theme} icon on ${date}`, async () => {
                    const response = await request(
                      server({ now: () => dayjs(date) })
                    ).get(`/icon/${type}/size/180`);

                    expect(response.status).toEqual(200);
                    const svg = Buffer.from(response.body).toString();
                    expect(svg).toContain(`id="${id}"`);
                    expect(svg).toContain(`fill="${color1}"`);
                    expect(svg).toContain(`fill="${color2}"`);
                  });
                }

                itShouldBeFestive(
                  "christmas '22",
                  "2022/12/25",
                  "christmas",
                  "red",
                  "green"
                );
                itShouldBeFestive(
                  "christmas '23",
                  "2023/12/25",
                  "christmas",
                  "red",
                  "green"
                );

                itShouldBeFestive(
                  "halloween",
                  "2022/10/31",
                  "halloween",
                  "black",
                  "orange"
                );
                itShouldBeFestive(
                  "halloween",
                  "2023/10/31",
                  "halloween",
                  "black",
                  "orange"
                );

                itShouldBeFestive(
                  "cny '22",
                  "2022/02/01",
                  "yoTiger",
                  "red",
                  "yellow"
                );
                itShouldBeFestive(
                  "cny '23",
                  "2023/01/22",
                  "yoRabbit",
                  "red",
                  "yellow"
                );
              });
            });
          });
        });
      });
    });
  });
});
