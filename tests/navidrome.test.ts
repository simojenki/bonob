import { Md5 } from "ts-md5/dist/md5";

import { Navidrome, t, artistInfo } from "../src/navidrome";
import encryption from "../src/encryption";

import axios from "axios";
jest.mock("axios");

import randomString from "../src/random_string";
import { AuthSuccess } from "../src/music_service";
jest.mock("../src/random_string");

describe("t", () => {
  it("should be an md5 of the password and the salt", () => {
    const p = "password123";
    const s = "saltydog";
    expect(t(p, s)).toEqual(Md5.hashStr(`${p}${s}`));
  });
});

const ok = (data: string) => ({
  status: 200,
  data,
});

const artistInfoXml = (
  artistInfo: Partial<artistInfo>
) => `<subsonic-response xmlns="http://subsonic.org/restapi" status="ok" version="1.16.1" type="navidrome" serverVersion="0.40.0 (8799358a)">
          <artistInfo>
              <biography></biography>
              <musicBrainzId></musicBrainzId>
              <lastFmUrl></lastFmUrl>
              <smallImageUrl>${artistInfo.smallImageUrl || ""}</smallImageUrl>
              <mediumImageUrl>${
                artistInfo.mediumImageUrl || ""
              }</mediumImageUrl>
              <largeImageUrl>${artistInfo.largeImageUrl || ""}</largeImageUrl>
          </artistInfo>
        </subsonic-response>`;

const PING_OK = `<subsonic-response xmlns="http://subsonic.org/restapi" status="ok" version="1.16.1" type="navidrome" serverVersion="0.40.0 (8799358a)"></subsonic-response>`;

describe("navidrome", () => {
  const url = "http://127.0.0.22:4567";
  const username = "user1";
  const password = "pass1";
  const salt = "saltysalty";

  const navidrome = new Navidrome(url, encryption("secret"));

  const mockedRandomString = (randomString as unknown) as jest.Mock;
  const mockGET = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks();

    axios.get = mockGET;

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
        (axios.get as jest.Mock).mockResolvedValue(ok(PING_OK));

        const token = (await navidrome.generateToken({
          username,
          password,
        })) as AuthSuccess;

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

        const token = await navidrome.generateToken({ username, password });
        expect(token).toEqual({ message: "Wrong username or password" });
      });
    });
  });

  describe("getArtists", () => {
    const getArtistsXml = `<subsonic-response xmlns="http://subsonic.org/restapi" status="ok" version="1.16.1" type="navidrome" serverVersion="0.40.0 (8799358a)">
                              <artists lastModified="1614586749000" ignoredArticles="The El La Los Las Le Les Os As O A">
                                <index name="#">
                                  <artist id="2911b2d67a6b11eb804dd360a6225680" name="artist1" albumCount="22"></artist>
                                  <artist id="3c0b9d7a7a6b11eb9773f398e6236ad6" name="artist2" albumCount="9"></artist>
                                </index>
                                <index name="A">
                                  <artist id="3c5113007a6b11eb87173bfb9b07f9b1" name="artist3" albumCount="2"></artist>
                                </index>
                                <index name="B">
                                  <artist id="3ca781c27a6b11eb897ebbb5773603ad" name="artist4" albumCount="2"></artist>
                                </index>
                              </artists>
                            </subsonic-response>`;

    const artist1_getArtistInfoXml = artistInfoXml({
      smallImageUrl: "sml1",
      mediumImageUrl: "med1",
      largeImageUrl: "lge1",
    });
    const artist2_getArtistInfoXml = artistInfoXml({
      smallImageUrl: "sml2",
      mediumImageUrl: undefined,
      largeImageUrl: "lge2",
    });
    const artist3_getArtistInfoXml = artistInfoXml({
      smallImageUrl: undefined,
      mediumImageUrl: "med3",
      largeImageUrl: undefined,
    });
    const artist4_getArtistInfoXml = artistInfoXml({
      smallImageUrl: "sml4",
      mediumImageUrl: "med4",
      largeImageUrl: "lge4",
    });

    beforeEach(() => {
      mockGET
      .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
      .mockImplementationOnce(() => Promise.resolve(ok(getArtistsXml)))
      .mockImplementationOnce(() => Promise.resolve(ok(artist1_getArtistInfoXml)))
      .mockImplementationOnce(() => Promise.resolve(ok(artist2_getArtistInfoXml)))
      .mockImplementationOnce(() => Promise.resolve(ok(artist3_getArtistInfoXml)))
      .mockImplementationOnce(() => Promise.resolve(ok(artist4_getArtistInfoXml)));
    });

    describe("when no paging is in effect", () => {
      it("should return all the artists", async () => {
        const artists = await navidrome
          .generateToken({ username, password })
          .then((it) => it as AuthSuccess)
          .then((it) => navidrome.login(it.authToken))
          .then((it) => it.artists({ _index: 0, _count: 100 }));

        const expectedArtists = [
          {
            id: "2911b2d67a6b11eb804dd360a6225680",
            name: "artist1",
            image: { small: "sml1", medium: "med1", large: "lge1" },
          },
          {
            id: "3c0b9d7a7a6b11eb9773f398e6236ad6",
            name: "artist2",
            image: { small: "sml2", medium: "", large: "lge2" },
          },
          {
            id: "3c5113007a6b11eb87173bfb9b07f9b1",
            name: "artist3",
            image: { small: "", medium: "med3", large: "" },
          },
          {
            id: "3ca781c27a6b11eb897ebbb5773603ad",
            name: "artist4",
            image: { small: "sml4", medium: "med4", large: "lge4" },
          },
        ];
        expect(artists).toEqual({ results: expectedArtists, total: 4 });

        expect(axios.get).toHaveBeenCalledWith(`${url}/rest/getArtists`, {
          params: authParams,
        });
        expect(axios.get).toHaveBeenCalledWith(`${url}/rest/getArtistInfo`, {
          params: {
            id: "2911b2d67a6b11eb804dd360a6225680",
            ...authParams,
          },
        });
        expect(axios.get).toHaveBeenCalledWith(`${url}/rest/getArtistInfo`, {
          params: {
            id: "3c0b9d7a7a6b11eb9773f398e6236ad6",
            ...authParams,
          },
        });
        expect(axios.get).toHaveBeenCalledWith(`${url}/rest/getArtistInfo`, {
          params: {
            id: "3c5113007a6b11eb87173bfb9b07f9b1",
            ...authParams,
          },
        });
        expect(axios.get).toHaveBeenCalledWith(`${url}/rest/getArtistInfo`, {
          params: {
            id: "3ca781c27a6b11eb897ebbb5773603ad",
            ...authParams,
          },
        });
      });
    });

    describe("when paging specified", () => {
      it("should return only the correct page of artists", async () => {
        const artists = await navidrome
          .generateToken({ username, password })
          .then((it) => it as AuthSuccess)
          .then((it) => navidrome.login(it.authToken))
          .then((it) => it.artists({ _index: 1, _count: 2 }));

          const expectedArtists = [
            {
              id: "3c0b9d7a7a6b11eb9773f398e6236ad6",
              name: "artist2",
              image: { small: "sml2", medium: "", large: "lge2" },
            },
            {
              id: "3c5113007a6b11eb87173bfb9b07f9b1",
              name: "artist3",
              image: { small: "", medium: "med3", large: "" },
            },
          ];
          expect(artists).toEqual({ results: expectedArtists, total: 4 });

        expect(axios.get).toHaveBeenCalledWith(`${url}/rest/getArtists`, {
          params: authParams,
        });
        expect(axios.get).toHaveBeenCalledWith(`${url}/rest/getArtistInfo`, {
          params: {
            id: "2911b2d67a6b11eb804dd360a6225680",
            ...authParams,
          },
        });
        expect(axios.get).toHaveBeenCalledWith(`${url}/rest/getArtistInfo`, {
          params: {
            id: "3c0b9d7a7a6b11eb9773f398e6236ad6",
            ...authParams,
          },
        });
        expect(axios.get).toHaveBeenCalledWith(`${url}/rest/getArtistInfo`, {
          params: {
            id: "3c5113007a6b11eb87173bfb9b07f9b1",
            ...authParams,
          },
        });
        expect(axios.get).toHaveBeenCalledWith(`${url}/rest/getArtistInfo`, {
          params: {
            id: "3ca781c27a6b11eb897ebbb5773603ad",
            ...authParams,
          },
        });
      });
    });
  });
});
