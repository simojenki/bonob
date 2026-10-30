import { v4 as uuid } from "uuid";
import { pipe } from "fp-ts/lib/function";
import { taskEither as TE, task as T } from "fp-ts";

import {
  Subsonic,
  t,
  asURLSearchParams,
  CustomPlayers,
} from "../src/subsonic";

import axios from "axios";
jest.mock("axios");

import randomstring from "randomstring";
jest.mock("randomstring");

import {
  Credentials,
} from "../src/music_service";
import { URLBuilder } from "../src/url_builder";
import logger from "../src/logger";

import {
  ok,
  error,
  subsonicOK,
  PING_OK,
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
    mockGET.mockImplementationOnce(() => Promise.resolve(ok(PING_OK)));
  });

  const authParamsPlusJson = {
    u: username,
    v: "1.16.1",
    c: "bonob",
    t: t(password, salt),
    s: salt,
    f: "json",
  };

  const headers = {
    "User-Agent": "bonob",
  };

  const tokenFor = (credentials: Credentials) => pipe(
    subsonic.generateToken(credentials),
    TE.fold(e => { throw e }, T.of)
  )

  const login = (credentials: Credentials) => tokenFor(credentials)().then((it) => subsonic.login(it.serviceToken))

  const years = () => login({ username, password }).then((it) => it.years());

  const facetValues = (values: number[], total: number) => subsonicOK({
    libraryFacetValues: {
      value: values.map((value) => ({ value, count: 1 })),
      total,
    },
  });

  const givenFacetValues = (values: number[], total: number = values.length) =>
    mockPOST.mockImplementationOnce(() => Promise.resolve(ok(facetValues(values, total))));

  describe("getting years", () => {
    describe("when there are more years than were returned", () => {
      const returned = [1999];

      beforeEach(() => {
        givenFacetValues(returned, returned.length + 1);
      });

      it("should warn, and list the years it received", async () => {
        const warn = jest.spyOn(logger, "warn").mockImplementation(() => logger);

        const result = await years();

        expect(result).toEqual([{ year: "1999" }]);
        expect(warn).toHaveBeenCalledWith(expect.stringContaining("1 of 2"));

        warn.mockRestore();
      });
    });

    describe("when there are several", () => {
      beforeEach(() => {
        givenFacetValues([0, 1999, 2001]);
      });

      it("should request the album year facet, and list the years with ? first, then newest first", async () => {
        const result = await years();

        expect(result).toEqual([{ year: "?" }, { year: "2001" }, { year: "1999" }]);

        expect(axios.post).toHaveBeenCalledWith(
          url.append({ pathname: "/rest/getLibraryFacetValues" }).href(),
          { entity: "album", field: "year", limit: 500 },
          {
            params: asURLSearchParams(authParamsPlusJson),
            headers,
          }
        );
      });

      it("should not request the album list", async () => {
        await years();

        expect(axios.get).not.toHaveBeenCalledWith(
          url.append({ pathname: "/rest/getAlbumList2" }).href(),
          expect.anything()
        );
      });
    });

    describe("when a year is shorter than 4 digits", () => {
      beforeEach(() => {
        givenFacetValues([198, 1980]);
      });

      it("should keep the order of a string sort", async () => {
        const result = await years();

        expect(result).toEqual([{ year: "1980" }, { year: "198" }]);
      });
    });

    describe("when there are none", () => {
      beforeEach(() => {
        givenFacetValues([]);
      });

      it("should return an empty array", async () => {
        const result = await years();

        expect(result).toEqual([]);
      });
    });

    describe("when Subsonic answers with an error", () => {
      beforeEach(() => {
        mockPOST.mockImplementationOnce(() => Promise.resolve(ok(error("0", "not supported"))));
      });

      it("should reject", async () => {
        await expect(years()).rejects.toEqual("Subsonic error:not supported");
      });
    });
  });
});
