import { Md5 } from "ts-md5/dist/md5";

import { Navidrome, t } from "../src/navidrome";
import encryption from "../src/encryption";

import axios from "axios";
jest.mock("axios");

import randomString from "../src/random_string";
jest.mock("../src/random_string");

describe("t", () => {
  it("should be an md5 of the password and the salt", () => {
    const p = "password123";
    const s = "saltydog";
    expect(t(p, s)).toEqual(Md5.hashStr(`${p}${s}`));
  });
});

describe("navidrome", () => {
  const url = "http://127.0.0.22:4567";
  const username = "user1";
  const password = "pass1";
  const salt = "saltysalty";

  const navidrome = new Navidrome(url, encryption("secret"));

  const mockedRandomString = (randomString as unknown) as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    axios.get = jest.fn();

    mockedRandomString.mockReturnValue(salt);
  });

  const authParams = {
    u: username,
    t: t(password, salt),
    s: salt,
    v: "1.16.1",
    c: "bonob",
  };

  describe("generateToken", () => {
    describe("when the credentials are valid", () => {
      it("should be able to generate a token and then login using it", async () => {
        (axios.get as jest.Mock).mockResolvedValue({
          status: 200,
          data: `<subsonic-response xmlns="http://subsonic.org/restapi" status="ok" version="1.16.1" type="navidrome" serverVersion="0.40.0 (8799358a)">
                 </subsonic-response>`,
        });

        const token = await navidrome.generateToken({ username, password });

        expect(token.authToken).toBeDefined();
        expect(token.nickname).toEqual(username);
        expect(token.userId).toEqual(username);

        expect(axios.get).toHaveBeenCalledWith(`${url}/rest/ping.view`, {
          params: authParams,
        });
      });
    });

    describe("when the credentials are not valid", () => {
      it("should be able to generate a token and then login using it", async () => {
        (axios.get as jest.Mock).mockResolvedValue({
          status: 200,
          data: `<subsonic-response xmlns="http://subsonic.org/restapi" status="failed" version="1.16.1" type="navidrome" serverVersion="0.40.0 (8799358a)">
                    <error code="40" message="Wrong username or password"></error>
                 </subsonic-response>`,
        });

        return expect(
          navidrome.generateToken({ username, password })
        ).rejects.toMatch("Wrong username or password");
      });
    });
  });

  describe("getArtists", () => {
    beforeEach(() => {
      (axios.get as jest.Mock).mockResolvedValue({
        status: 200,
        data: `<subsonic-response xmlns="http://subsonic.org/restapi" status="ok" version="1.16.1" type="navidrome" serverVersion="0.40.0 (8799358a)">
                <artists lastModified="1614586749000" ignoredArticles="The El La Los Las Le Les Os As O A">
                  <index name="#">
                    <artist id="2911b2d67a6b11eb804dd360a6225680" name="10 Planets" albumCount="22"></artist>
                    <artist id="3c0b9d7a7a6b11eb9773f398e6236ad6" name="1200 Ounces" albumCount="9"></artist>
                  </index>
                  <index name="A">
                    <artist id="3c5113007a6b11eb87173bfb9b07f9b1" name="AAAB" albumCount="2"></artist>
                  </index>
                  <index name="B">
                    <artist id="3ca781c27a6b11eb897ebbb5773603ad" name="BAAB" albumCount="2"></artist>
                  </index>
                </artists>
              </subsonic-response>`,
      });
    });

    describe("when no paging specified", () => {
      it("should return all the artists", async () => {
        const artists = await navidrome
          .generateToken({ username, password })
          .then((it) => navidrome.login(it.authToken))
          .then((it) => it.artists({}));

        const expectedArtists = [
          { id: "2911b2d67a6b11eb804dd360a6225680", name: "10 Planets" },
          { id: "3c0b9d7a7a6b11eb9773f398e6236ad6", name: "1200 Ounces" },
          { id: "3c5113007a6b11eb87173bfb9b07f9b1", name: "AAAB" },
          { id: "3ca781c27a6b11eb897ebbb5773603ad", name: "BAAB" },
        ];
        expect(artists).toEqual({ results: expectedArtists, total: 4 });

        expect(axios.get).toHaveBeenCalledWith(`${url}/rest/getArtists`, {
          params: authParams,
        });
      });
    });

    describe("when paging specified", () => {
      it("should return only the correct page of artists", async () => {
        const artists = await navidrome
          .generateToken({ username, password })
          .then((it) => navidrome.login(it.authToken))
          .then((it) => it.artists({ _index: 1, _count: 2 }));

        const expectedArtists = [
          { id: "3c0b9d7a7a6b11eb9773f398e6236ad6", name: "1200 Ounces" },
          { id: "3c5113007a6b11eb87173bfb9b07f9b1", name: "AAAB" },
        ];
        expect(artists).toEqual({ results: expectedArtists, total: 4 });

        expect(axios.get).toHaveBeenCalledWith(`${url}/rest/getArtists`, {
          params: authParams,
        });
      });
    });
  });
});
