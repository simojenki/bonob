import { Md5 } from "ts-md5/dist/md5";

import { isDodgyImage, Navidrome, t } from "../src/navidrome";
import encryption from "../src/encryption";

import axios from "axios";
jest.mock("axios");

import randomString from "../src/random_string";
import { Album, Artist, AuthSuccess, Images } from "../src/music_service";
jest.mock("../src/random_string");

describe("t", () => {
  it("should be an md5 of the password and the salt", () => {
    const p = "password123";
    const s = "saltydog";
    expect(t(p, s)).toEqual(Md5.hashStr(`${p}${s}`));
  });
});

describe("isDodgyImage", () => {
  describe("when ends with 2a96cbd8b46e442fc41c2b86b821562f.png", () => {
    it("is dodgy", () => {
      expect(
        isDodgyImage("http://something/2a96cbd8b46e442fc41c2b86b821562f.png")
      ).toEqual(true);
    });
  });
  describe("when does not end with 2a96cbd8b46e442fc41c2b86b821562f.png", () => {
    it("is dodgy", () => {
      expect(isDodgyImage("http://something/somethingelse.png")).toEqual(false);
      expect(
        isDodgyImage(
          "http://something/2a96cbd8b46e442fc41c2b86b821562f.png?withsomequerystring=true"
        )
      ).toEqual(false);
    });
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

const albumXml = (artist: Artist, album: Album) => `<album id="${album.id}" 
            parent="${artist.id}" 
            isDir="true" 
            title="${album.name}" name="${album.name}" album="${album.name}" 
            artist="${artist.name}" 
            genre="${album.genre}" 
            coverArt="foo" 
            duration="123" 
            playCount="4" 
            year="${album.year}"
            created="2021-01-07T08:19:55.834207205Z" 
            artistId="${artist.id}" 
            songCount="19" 
            isVideo="false"></album>`;

const artistXml = (
  artist: Artist
) => `<subsonic-response xmlns="http://subsonic.org/restapi" status="ok" version="1.16.1" type="navidrome" serverVersion="0.40.0 (8799358a)">
        <artist id="${artist.id}" name="${artist.name}" albumCount="${
  artist.albums.length
}" artistImageUrl="....">
          ${artist.albums.map((album) => albumXml(artist, album))}
        </artist>
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
    const album1: Album = {
      id: "album1",
      name: "super album",
      year: "2001",
      genre: "Pop",
    };

    const album2: Album = {
      id: "album2",
      name: "bad album",
      year: "2002",
      genre: "Rock",
    };

    const artist: Artist = {
      id: "someUUID_123",
      name: "BananaMan",
      image: {
        small: "sml1",
        medium: "med1",
        large: "lge1",
      },
      albums: [album1, album2],
    };

    beforeEach(() => {
      mockGET
        .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
        .mockImplementationOnce(() => Promise.resolve(ok(artistXml(artist))))
        .mockImplementationOnce(() =>
          Promise.resolve(ok(artistInfoXml(artist.image)))
        );
    });

    it.only("should do it", async () => {
      const result: Artist = await navidrome
        .generateToken({ username, password })
        .then((it) => it as AuthSuccess)
        .then((it) => navidrome.login(it.authToken))
        .then((it) => it.artist(artist.id));

      expect(result).toEqual({
        id: artist.id,
        name: artist.name,
        image: { small: "sml1", medium: "med1", large: "lge1" },
        albums: [album1, album2]
      });

      expect(axios.get).toHaveBeenCalledWith(`${url}/rest/getArtist`, {
        params: {
          id: artist.id,
          ...authParams,
        },
      });

      expect(axios.get).toHaveBeenCalledWith(`${url}/rest/getArtistInfo`, {
        params: {
          id: artist.id,
          ...authParams,
        },
      });
    });
  });

  describe("getArtists", () => {
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

    describe("when there are artists", () => {
      const artist1: Artist = {
        id: "artist1.id",
        name: "artist1.name",
        image: { small: "s1", medium: "m1", large: "l1" },
        albums: [],
      };
      const artist2: Artist = {
        id: "artist2.id",
        name: "artist2.name",
        image: { small: "s2", medium: "m2", large: "l2" },
        albums: [],
      };
      const artist3: Artist = {
        id: "artist3.id",
        name: "artist3.name",
        image: { small: "s3", medium: "m3", large: "l3" },
        albums: [],
      };
      const artist4: Artist = {
        id: "artist4.id",
        name: "artist4.name",
        image: { small: "s4", medium: "m4", large: "l4" },
        albums: [],
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

          const expectedResults = [artist1, artist2, artist3, artist4].map(
            (it) => ({
              id: it.id,
              name: it.name,
              image: it.image,
            })
          );

          expect(artists).toEqual({
            results: expectedResults,
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

          const expectedResults = [artist2, artist3].map((it) => ({
            id: it.id,
            name: it.name,
            image: it.image,
          }));

          expect(artists).toEqual({ results: expectedResults, total: 4 });

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
});
