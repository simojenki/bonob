import { Md5 } from "ts-md5/dist/md5";

import { Navidrome, t } from "../src/navidrome";
import encryption from "../src/encryption";

import axios from "axios";
jest.mock("axios");

import randomString from "../src/random_string";
import { Artist, AuthSuccess, Images } from "../src/music_service";
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
  images: Images
) => `<subsonic-response xmlns="http://subsonic.org/restapi" status="ok" version="1.16.1" type="navidrome" serverVersion="0.40.0 (8799358a)">
          <artistInfo>
              <biography></biography>
              <musicBrainzId></musicBrainzId>
              <lastFmUrl></lastFmUrl>
              <smallImageUrl>${images.small || ""}</smallImageUrl>
              <mediumImageUrl>${images.medium || ""}</mediumImageUrl>
              <largeImageUrl>${images.large || ""}</largeImageUrl>
          </artistInfo>
        </subsonic-response>`;

const PING_OK = `<subsonic-response xmlns="http://subsonic.org/restapi" status="ok" version="1.16.1" type="navidrome" serverVersion="0.40.0 (8799358a)"></subsonic-response>`;

describe("Navidrome", () => {
  const url = "http://127.0.0.22:4567";
  const username = "user1";
  const password = "pass1";
  const salt = "saltysalty";

  const navidrome = new Navidrome(url, encryption("secret"));

  const mockedRandomString = (randomString as unknown) as jest.Mock;
  const mockGET = jest.fn();

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

  describe("getArtist", () => {
    const artistId = "someUUID_123";
    const artistName = "BananaMan";

    const artistXml = `<subsonic-response xmlns="http://subsonic.org/restapi" status="ok" version="1.16.1" type="navidrome" serverVersion="0.40.0 (8799358a)">
                        <artist id="${artistId}" name="${artistName}" albumCount="9" artistImageUrl="....">
                        </artist>
                      </subsonic-response>`;

    const getArtistInfoXml = artistInfoXml({
      small: "sml1",
      medium: "med1",
      large: "lge1",
    });

    beforeEach(() => {
      mockGET
        .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
        .mockImplementationOnce(() => Promise.resolve(ok(artistXml)))
        .mockImplementationOnce(() => Promise.resolve(ok(getArtistInfoXml)));
    });

    it("should do it", async () => {
      const artist = await navidrome
        .generateToken({ username, password })
        .then((it) => it as AuthSuccess)
        .then((it) => navidrome.login(it.authToken))
        .then((it) => it.artist(artistId));

      expect(artist).toEqual({
        id: artistId,
        name: artistName,
        image: { small: "sml1", medium: "med1", large: "lge1" },
      });

      expect(axios.get).toHaveBeenCalledWith(`${url}/rest/getArtist`, {
        params: {
          id: artistId,
          ...authParams,
        },
      });

      expect(axios.get).toHaveBeenCalledWith(`${url}/rest/getArtistInfo`, {
        params: {
          id: artistId,
          ...authParams,
        },
      });
    });
  });

  describe("getArtists", () => {
    const artist1: Artist = {
      id: "artist1.id",
      name: "artist1.name",
      image: { small: "s1", medium: "m1", large: "l1" },
    };
    const artist2: Artist = {
      id: "artist2.id",
      name: "artist2.name",
      image: { small: "s2", medium: "m2", large: "l2" },
    };
    const artist3: Artist = {
      id: "artist3.id",
      name: "artist3.name",
      image: { small: "s3", medium: "m3", large: "l3" },
    };
    const artist4: Artist = {
      id: "artist4.id",
      name: "artist4.name",
      image: { small: "s4", medium: "m4", large: "l4" },
    };

    const getArtistsXml = `<subsonic-response xmlns="http://subsonic.org/restapi" status="ok" version="1.16.1" type="navidrome" serverVersion="0.40.0 (8799358a)">
                              <artists lastModified="1614586749000" ignoredArticles="The El La Los Las Le Les Os As O A">
                                <index name="#">
                                  <artist id="${artist1.id}" name="${artist1.name}" albumCount="22"></artist>
                                  <artist id="${artist2.id}" name="${artist2.name}" albumCount="9"></artist>
                                </index>
                                <index name="A">
                                  <artist id="${artist3.id}" name="${artist3.name}" albumCount="2"></artist>
                                </index>
                                <index name="B">
                                  <artist id="${artist4.id}" name="${artist4.name}" albumCount="2"></artist>
                                </index>
                              </artists>
                            </subsonic-response>`;

    describe("when there are no results", () => {
      beforeEach(() => {
        mockGET
          .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
          .mockImplementationOnce(() =>
            Promise.resolve(
              ok(`<subsonic-response xmlns="http://subsonic.org/restapi" status="ok" version="1.16.1" type="navidrome" serverVersion="0.40.0 (8799358a)">
                    <artists lastModified="1614586749000" ignoredArticles="The El La Los Las Le Les Os As O A">
                      <index name="#">
                      </index>
                      <index name="A">
                      </index>
                      <index name="B">
                      </index>
                    </artists>
                  </subsonic-response>`)
            )
          );
      });

      it("should return empty", async () => {
        const artists = await navidrome
          .generateToken({ username, password })
          .then((it) => it as AuthSuccess)
          .then((it) => navidrome.login(it.authToken))
          .then((it) => it.artists({ _index: 0, _count: 100 }));

        expect(artists).toEqual({
          results: [],
          total: 0,
        });
      });
    });

    describe("when no paging is in effect", () => {
      beforeEach(() => {
        mockGET
          .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
          .mockImplementationOnce(() => Promise.resolve(ok(getArtistsXml)))
          .mockImplementationOnce(() =>
            Promise.resolve(ok(artistInfoXml(artist1.image)))
          )
          .mockImplementationOnce(() =>
            Promise.resolve(ok(artistInfoXml(artist2.image)))
          )
          .mockImplementationOnce(() =>
            Promise.resolve(ok(artistInfoXml(artist3.image)))
          )
          .mockImplementationOnce(() =>
            Promise.resolve(ok(artistInfoXml(artist4.image)))
          );
      });

      it("should return all the artists", async () => {
        const artists = await navidrome
          .generateToken({ username, password })
          .then((it) => it as AuthSuccess)
          .then((it) => navidrome.login(it.authToken))
          .then((it) => it.artists({ _index: 0, _count: 100 }));

        expect(artists).toEqual({
          results: [artist1, artist2, artist3, artist4],
          total: 4,
        });

        expect(axios.get).toHaveBeenCalledWith(`${url}/rest/getArtists`, {
          params: authParams,
        });
        expect(axios.get).toHaveBeenCalledWith(`${url}/rest/getArtistInfo`, {
          params: {
            id: artist1.id,
            ...authParams,
          },
        });
        expect(axios.get).toHaveBeenCalledWith(`${url}/rest/getArtistInfo`, {
          params: {
            id: artist2.id,
            ...authParams,
          },
        });
        expect(axios.get).toHaveBeenCalledWith(`${url}/rest/getArtistInfo`, {
          params: {
            id: artist3.id,
            ...authParams,
          },
        });
        expect(axios.get).toHaveBeenCalledWith(`${url}/rest/getArtistInfo`, {
          params: {
            id: artist4.id,
            ...authParams,
          },
        });
      });
    });

    describe("when paging specified", () => {
      beforeEach(() => {
        mockGET
          .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
          .mockImplementationOnce(() => Promise.resolve(ok(getArtistsXml)))
          .mockImplementationOnce(() =>
            Promise.resolve(ok(artistInfoXml(artist2.image)))
          )
          .mockImplementationOnce(() =>
            Promise.resolve(ok(artistInfoXml(artist3.image)))
          );
      });

      it("should return only the correct page of artists", async () => {
        const artists = await navidrome
          .generateToken({ username, password })
          .then((it) => it as AuthSuccess)
          .then((it) => navidrome.login(it.authToken))
          .then((it) => it.artists({ _index: 1, _count: 2 }));

        expect(artists).toEqual({ results: [artist2, artist3], total: 4 });

        expect(axios.get).toHaveBeenCalledWith(`${url}/rest/getArtists`, {
          params: authParams,
        });
        expect(axios.get).toHaveBeenCalledWith(`${url}/rest/getArtistInfo`, {
          params: {
            id: artist2.id,
            ...authParams,
          },
        });
        expect(axios.get).toHaveBeenCalledWith(`${url}/rest/getArtistInfo`, {
          params: {
            id: artist3.id,
            ...authParams,
          },
        });
      });
    });
  });
});
