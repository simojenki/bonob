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

  const navidrome = new Navidrome(url, encryption());

  const mockedRandomString = (randomString as unknown) as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    axios.get = jest.fn();

    mockedRandomString.mockReturnValue(salt);
  });

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

        expect(axios.get).toHaveBeenCalledWith(
          `${url}/rest/ping.view?u=${username}&t=${t(
            password,
            salt
          )}&s=${salt}&v=1.16.1.0&c=bonob`
        );
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

        return expect(navidrome.generateToken({ username, password })).rejects.toMatch("Wrong username or password");
      });
    });
  });
});
