import { Md5 } from "ts-md5/dist/md5";
import { v4 as uuid } from "uuid";

import {  pipe } from "fp-ts/lib/function";
import { taskEither as TE, task as T, either as E } from "fp-ts";

import {
  Subsonic,
  t,
  DODGY_IMAGE_NAME,
  appendMimeTypeToClientFor,
  PingResponse,
  parseToken,
  asToken,
  artistSummaryFromNDArtist,
  SubsonicCredentials,
} from "../src/subsonic";

import axios from "axios";
jest.mock("axios");


import randomstring from "randomstring";
jest.mock("randomstring");

import {
  AuthFailure,
} from "../src/music_service";
import {
  aTrack,
} from "./builders";
import { asURLSearchParams } from "../src/utils";
import { artistImageURN } from "../src/subsonic/generic";

describe("t", () => {
  it("should be an md5 of the password and the salt", () => {
    const p = "password123";
    const s = "saltydog";
    expect(t(p, s)).toEqual(Md5.hashStr(`${p}${s}`));
  });
});

describe("appendMimeTypeToUserAgentFor", () => {
  describe("when empty array", () => {
    it("should return bonob", () => {
      expect(appendMimeTypeToClientFor([])(aTrack())).toEqual("bonob");
    });
  });

  describe("when contains some mimeTypes", () => {
    const streamUserAgent = appendMimeTypeToClientFor([
      "audio/flac",
      "audio/ogg",
    ]);

    describe("and the track mimeType is in the array", () => {
      it("should return bonob+mimeType", () => {
        expect(streamUserAgent(aTrack({ mimeType: "audio/flac" }))).toEqual(
          "bonob+audio/flac"
        );
        expect(streamUserAgent(aTrack({ mimeType: "audio/ogg" }))).toEqual(
          "bonob+audio/ogg"
        );
      });
    });

    describe("and the track mimeType is not in the array", () => {
      it("should return bonob", () => {
        expect(streamUserAgent(aTrack({ mimeType: "audio/mp3" }))).toEqual(
          "bonob"
        );
      });
    });
  });
});

export const ok = (data: string | object) => ({
  status: 200,
  data,
});

export const subsonicOK = (body: any = {}) => ({
  "subsonic-response": {
    status: "ok",
    version: "1.16.1",
    type: "subsonic",
    serverVersion: "0.45.1 (c55e6590)",
    ...body,
  },
});


export const error = (code: string, message: string) => ({
  "subsonic-response": {
    status: "failed",
    version: "1.16.1",
    type: "subsonic",
    serverVersion: "0.45.1 (c55e6590)",
    error: { code, message },
  },
});

export const EMPTY = {
  "subsonic-response": {
    status: "ok",
    version: "1.16.1",
    type: "subsonic",
    serverVersion: "0.45.1 (c55e6590)",
  },
};

export const FAILURE = {
  "subsonic-response": {
    status: "failed",
    version: "1.16.1",
    type: "subsonic",
    serverVersion: "0.45.1 (c55e6590)",
    error: { code: 10, message: 'Missing required parameter "v"' },
  },
};

const pingJson = (pingResponse: Partial<PingResponse> = {}) => ({
  "subsonic-response": {
    status: "ok",
    version: "1.16.1",
    type: "subsonic",
    serverVersion: "0.45.1 (c55e6590)",
    ...pingResponse
  }
})

const PING_OK = pingJson({ status: "ok" });

describe("artistSummaryFromNDArtist", () => {
  describe("when the orderArtistName is undefined", () => {
    it("should use name", () => {
      const artist = {
        id: uuid(),
        name: `name ${uuid()}`,
        orderArtistName: undefined,
        largeImageUrl: 'http://example.com/something.jpg'
      }
      expect(artistSummaryFromNDArtist(artist)).toEqual({
        id: artist.id,
        name: artist.name,
        sortName: artist.name,
        image: artistImageURN({ artistId: artist.id, artistImageURL: artist.largeImageUrl })
      })
    });
  });

  describe("when the artist image is valid", () => {
    it("should create an ArtistSummary with Sortable", () => {
      const artist = {
        id: uuid(),
        name: `name ${uuid()}`,
        orderArtistName: `orderArtistName ${uuid()}`,
        largeImageUrl: 'http://example.com/something.jpg'
      }
      expect(artistSummaryFromNDArtist(artist)).toEqual({
        id: artist.id,
        name: artist.name,
        sortName: artist.orderArtistName,
        image: artistImageURN({ artistId: artist.id, artistImageURL: artist.largeImageUrl })
      })
    });
  });

  describe("when the artist image is not valid", () => {
    it("should create an ArtistSummary with Sortable", () => {
      const artist = {
        id: uuid(),
        name: `name ${uuid()}`,
        orderArtistName: `orderArtistName ${uuid()}`,
        largeImageUrl: `http://example.com/${DODGY_IMAGE_NAME}`
      }

      expect(artistSummaryFromNDArtist(artist)).toEqual({
        id: artist.id,
        name: artist.name,
        sortName: artist.orderArtistName,
        image: artistImageURN({ artistId: artist.id, artistImageURL: artist.largeImageUrl })
      });
    });
  });

  describe("when the artist image is missing", () => {
    it("should create an ArtistSummary with Sortable", () => {
      const artist = {
        id: uuid(),
        name: `name ${uuid()}`,
        orderArtistName: `orderArtistName ${uuid()}`,
        largeImageUrl: undefined
      }

      expect(artistSummaryFromNDArtist(artist)).toEqual({
        id: artist.id,
        name: artist.name,
        sortName: artist.orderArtistName,
        image: artistImageURN({ artistId: artist.id, artistImageURL: artist.largeImageUrl })
      });
    });
  });
});

describe("Subsonic", () => {
  const url = "http://127.0.0.22:4567";
  const username = `user1-${uuid()}`;
  const password = `pass1-${uuid()}`;
  const salt = "saltysalty";

  const streamClientApplication = jest.fn();
  const subsonic = new Subsonic(
    url,
    streamClientApplication
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

  const tokenFor = (credentials: Partial<SubsonicCredentials>) => pipe(
    subsonic.generateToken({
      username: "some username",
      password: "some password",
      bearer: undefined,
      type: "subsonic",
      ...credentials
    }),
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
  
          expect(axios.get).toHaveBeenCalledWith(`${url}/rest/ping.view`, {
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
  
          expect(axios.get).toHaveBeenCalledWith(`${url}/rest/ping.view`, {
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
  
          expect(axios.get).toHaveBeenCalledWith(`${url}/rest/ping.view`, {
            params: asURLSearchParams(authParamsPlusJson),
            headers,
          });
          expect(axios.post).toHaveBeenCalledWith(`${url}/auth/login`, {
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
  
          expect(axios.get).toHaveBeenCalledWith(`${url}/rest/ping.view`, {
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
  
          expect(axios.get).toHaveBeenCalledWith(`${url}/rest/ping.view`, {
            params: asURLSearchParams(authParamsPlusJson),
            headers,
          });
          expect(axios.post).toHaveBeenCalledWith(`${url}/auth/login`, {
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

});
