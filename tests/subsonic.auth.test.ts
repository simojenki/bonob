import { v4 as uuid } from "uuid";
import { pipe } from "fp-ts/lib/function";
import { taskEither as TE, task as T, either as E } from "fp-ts";

import {
  Subsonic,
  t,
  parseToken,
  asToken,
  
  asURLSearchParams,
  CustomPlayers,
} from "../src/subsonic";

import axios from "axios";
jest.mock("axios");

import randomstring from "randomstring";
jest.mock("randomstring");

import {
  Credentials, AuthFailure,
} from "../src/music_service";
import { URLBuilder } from "../src/url_builder";

import {
  ok,
  PING_OK,
  pingJson,
  error,
} from "./subsonic.test.helpers";

describe("Subsonic", () => {
  const url = new URLBuilder("http://127.0.0.22:4567/some-context-path");
  const username = `user1-${uuid()}`;
  const password = `pass1-${uuid()}`;
  const salt = "saltysalty";

  const customPlayers = {
    encodingFor: jest.fn()
  };

  const subsonic = new Subsonic(
    url,
    customPlayers as unknown as CustomPlayers
  );

  const mockRandomstring = jest.fn();
  const mockGET = jest.fn();
  const mockPOST = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetAllMocks();

    randomstring.generate = mockRandomstring;
    axios.get = mockGET;
    axios.post = mockPOST;

    mockRandomstring.mockReturnValue(salt);
  });

  const authParams = {
    u: username,
    v: "1.16.1",
    c: "bonob",
    t: t(password, salt),
    s: salt,
  };

  const authParamsPlusJson = {
    ...authParams,
    f: "json",
  };

  const headers = {
    "User-Agent": "bonob",
  };

  const tokenFor = (credentials: Credentials) => pipe(
    subsonic.generateToken(credentials),
    TE.fold(e => { throw e }, T.of)
  )


  describe("generateToken", () => {
    describe("when the credentials are valid", () => {
      describe("when the backend is generic subsonic", () => {
        it("should be able to generate a token and then login using it", async () => {
          (axios.get as jest.Mock).mockResolvedValue(ok(PING_OK));
  
          const token = await tokenFor({
            username,
            password,
          })()
  
          expect(token.serviceToken).toBeDefined();
          expect(token.nickname).toEqual(username);
          expect(token.userId).toEqual(username);
  
          expect(parseToken(token.serviceToken)).toEqual({ username, password, type: PING_OK["subsonic-response"].type })
  
          expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/ping.view' }).href(), {
            params: asURLSearchParams(authParamsPlusJson),
            headers,
          });
        });

        it("should store the type of the subsonic server on the token", async () => {
          const type = "someSubsonicClone";
          (axios.get as jest.Mock).mockResolvedValue(ok(pingJson({ type })));
  
          const token = await tokenFor({
            username,
            password,
          })()
  
          expect(token.serviceToken).toBeDefined();
          expect(token.nickname).toEqual(username);
          expect(token.userId).toEqual(username);
  
          expect(parseToken(token.serviceToken)).toEqual({ username, password, type })
  
          expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/ping.view' }).href(), {
            params: asURLSearchParams(authParamsPlusJson),
            headers,
          });
        });
      });

      describe("when the backend is navidrome", () => {
        it("should login to nd and get the nd bearer token", async () => {
          const navidromeToken = `nd-${uuid()}`;

          (axios.get as jest.Mock).mockResolvedValue(ok(pingJson({ type: "navidrome" })));
          (axios.post as jest.Mock).mockResolvedValue(ok({ token: navidromeToken }));
  
          const token = await tokenFor({
            username,
            password,
          })()
  
          expect(token.serviceToken).toBeDefined();
          expect(token.nickname).toEqual(username);
          expect(token.userId).toEqual(username);
  
          expect(parseToken(token.serviceToken)).toEqual({ username, password, type: "navidrome", bearer: navidromeToken })
  
          expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/ping.view' }).href(), {
            params: asURLSearchParams(authParamsPlusJson),
            headers,
          });
          expect(axios.post).toHaveBeenCalledWith(url.append({ pathname: '/auth/login' }).href(), {
            username,
            password,
          });
        });
      });
    });

    describe("when the credentials are not valid", () => {
      it("should be able to generate a token and then login using it", async () => {
        (axios.get as jest.Mock).mockResolvedValue({
          status: 200,
          data: error("40", "Wrong username or password"),
        });

        const token = await subsonic.generateToken({ username, password })();
        expect(token).toEqual(E.left(new AuthFailure("Subsonic error:Wrong username or password")));
      });
    });
  });

  describe("refreshToken", () => {
    describe("when the credentials are valid", () => {
      describe("when the backend is generic subsonic", () => {
        it("should be able to generate a token and then login using it", async () => {
          const type = `subsonic-clone-${uuid()}`;
          (axios.get as jest.Mock).mockResolvedValue(ok(pingJson({ type })));
  
          const credentials = { username, password, type: "foo", bearer: undefined };
          const originalToken = asToken(credentials)

          const refreshedToken = await pipe(
            subsonic.refreshToken(originalToken),
            TE.fold(e => { throw e }, T.of)
          )();
  
          expect(refreshedToken.serviceToken).toBeDefined();
          expect(refreshedToken.nickname).toEqual(credentials.username);
          expect(refreshedToken.userId).toEqual(credentials.username);
  
          expect(parseToken(refreshedToken.serviceToken)).toEqual({ username, password, type })
  
          expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/ping.view' }).href(), {
            params: asURLSearchParams(authParamsPlusJson),
            headers,
          });
        });
      });

      describe("when the backend is navidrome", () => {
        it("should login to nd and get the nd bearer token", async () => {
          const navidromeToken = `nd-${uuid()}`;

          (axios.get as jest.Mock).mockResolvedValue(ok(pingJson({ type: "navidrome" })));
          (axios.post as jest.Mock).mockResolvedValue(ok({ token: navidromeToken }));
  
          const credentials = { username, password, type: "navidrome", bearer: undefined };
          const originalToken = asToken(credentials)

          const refreshedToken = await pipe(
            subsonic.refreshToken(originalToken),
            TE.fold(e => { throw e }, T.of)
          )();
  
          expect(refreshedToken.serviceToken).toBeDefined();
          expect(refreshedToken.nickname).toEqual(username);
          expect(refreshedToken.userId).toEqual(username);
  
          expect(parseToken(refreshedToken.serviceToken)).toEqual({ username, password, type: "navidrome", bearer: navidromeToken })
  
          expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/ping.view' }).href(), {
            params: asURLSearchParams(authParamsPlusJson),
            headers,
          });
          expect(axios.post).toHaveBeenCalledWith(url.append({ pathname: '/auth/login' }).href(), {
            username,
            password,
          });
        });
      });
    });

    describe("when the credentials are not valid", () => {
      it("should be able to generate a token and then login using it", async () => {
        (axios.get as jest.Mock).mockResolvedValue({
          status: 200,
          data: error("40", "Wrong username or password"),
        });

        const credentials = { username, password, type: "foo", bearer: undefined };
        const originalToken = asToken(credentials)

        const token = await subsonic.refreshToken(originalToken)();
        expect(token).toEqual(E.left(new AuthFailure("Subsonic error:Wrong username or password")));
      });
    });
  });

  describe("login", () => {
    describe("when the token is for generic subsonic", () => {
      it("should return a subsonic client", async () => {
        const client = await subsonic.login(asToken({ username: "foo", password: "bar", type: "subsonic", bearer: undefined }));
        expect(client.flavour()).toEqual("subsonic");
      });
    });

    describe("when the token is for navidrome", () => {
      it("should return a navidrome client", async () => {
        const client = await subsonic.login(asToken({ username: "foo", password: "bar", type: "navidrome", bearer: undefined }));
        expect(client.flavour()).toEqual("navidrome");
      });
    });

    describe("when the token is for gonic", () => {
      it("should return a subsonic client", async () => {
        const client = await subsonic.login(asToken({ username: "foo", password: "bar", type: "gonic", bearer: undefined }));
        expect(client.flavour()).toEqual("subsonic");
      });
    });
  });

  describe("bearerToken", () => {
    describe("when flavour is generic subsonic", () => {
      it("should return undefined", async () => {
        const credentials = { username: "foo", password: "bar" };
        const token = { ...credentials, type: "subsonic", bearer: undefined  }
        const client = await subsonic.login(asToken(token));
        
        const bearerToken = await pipe(client.bearerToken(credentials))();
        expect(bearerToken).toStrictEqual(E.right(undefined));
      });
    });

    describe("when flavour is navidrome", () => {
      it("should get a bearerToken from navidrome", async () => {
        const credentials = { username: "foo", password: "bar" };
        const token = { ...credentials, type: "navidrome", bearer: undefined  }
        const client = await subsonic.login(asToken(token));

        mockPOST.mockImplementationOnce(() => Promise.resolve(ok({ token: 'theBearerToken' })))
        
        const bearerToken = await pipe(client.bearerToken(credentials))();
        expect(bearerToken).toStrictEqual(E.right('theBearerToken'));

        expect(axios.post).toHaveBeenCalledWith(url.append({ pathname: '/auth/login' }).href(), credentials)
      });
    });
  });

});
