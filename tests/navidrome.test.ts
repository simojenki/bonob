import { Md5 } from "ts-md5/dist/md5";

import { isDodgyImage, Navidrome, t } from "../src/navidrome";
import encryption from "../src/encryption";

import axios from "axios";
jest.mock("axios");

import randomString from "../src/random_string";
import {
  Album,
  Artist,
  AuthSuccess,
  Images,
  albumToAlbumSummary,
  range,
  asArtistAlbumPairs,
} from "../src/music_service";
import { anAlbum, anArtist } from "./builders";

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

const albumListXml = (
  albums: [Artist, Album][]
) => `<subsonic-response xmlns="http://subsonic.org/restapi" status="ok" version="1.16.1" type="navidrome" serverVersion="0.40.0 (8799358a)">
                    <albumList>
                      ${albums.map(([artist, album]) =>
                        albumXml(artist, album)
                      )}
                    </albumList>
                  </subsonic-response>`;

const artistXml = (
  artist: Artist
) => `<subsonic-response xmlns="http://subsonic.org/restapi" status="ok" version="1.16.1" type="navidrome" serverVersion="0.40.0 (8799358a)">
        <artist id="${artist.id}" name="${artist.name}" albumCount="${
  artist.albums.length
}" artistImageUrl="....">
          ${artist.albums.map((album) => albumXml(artist, album))}
        </artist>
        </subsonic-response>`;

const genresXml = (
  genres: string[]
) => `<subsonic-response xmlns="http://subsonic.org/restapi" status="ok" version="1.16.1" type="navidrome" serverVersion="0.40.0 (8799358a)">
                                          <genres>
                                            ${genres.map(
                                              (it) =>
                                                `<genre songCount="1475" albumCount="86">${it}</genre>`
                                            )}
                                          </genres>
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

  describe("getting genres", () => {
    const genres = ["HipHop", "Rap", "TripHop", "Pop", "Rock"];
    beforeEach(() => {
      mockGET
        .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
        .mockImplementationOnce(() => Promise.resolve(ok(genresXml(genres))));
    });

    it.only("should return them alphabetically sorted", async () => {
      const result = await navidrome
        .generateToken({ username, password })
        .then((it) => it as AuthSuccess)
        .then((it) => navidrome.login(it.authToken))
        .then((it) => it.genres());

      expect(result).toEqual(genres.sort());

      expect(axios.get).toHaveBeenCalledWith(`${url}/rest/getGenres`, {
        params: {
          ...authParams,
        },
      });
    });
  });

  describe("getting an artist", () => {
    const album1: Album = anAlbum();

    const album2: Album = anAlbum();

    const artist: Artist = anArtist({
      albums: [album1, album2],
    });

    beforeEach(() => {
      mockGET
        .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
        .mockImplementationOnce(() => Promise.resolve(ok(artistXml(artist))))
        .mockImplementationOnce(() =>
          Promise.resolve(ok(artistInfoXml(artist.image)))
        );
    });

    describe("when the artist exists", () => {
      it("should return it", async () => {
        const result: Artist = await navidrome
          .generateToken({ username, password })
          .then((it) => it as AuthSuccess)
          .then((it) => navidrome.login(it.authToken))
          .then((it) => it.artist(artist.id));

        expect(result).toEqual({
          id: artist.id,
          name: artist.name,
          image: artist.image,
          albums: artist.albums,
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
  });

  describe("getting artists", () => {
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
      const artist1 = anArtist();
      const artist2 = anArtist();
      const artist3 = anArtist();
      const artist4 = anArtist();

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

  describe("getting albums", () => {
    describe("filtering", () => {
      const album1 = anAlbum({ genre: "Pop" });
      const album2 = anAlbum({ genre: "Rock" });
      const album3 = anAlbum({ genre: "Pop" });

      const artist = anArtist({ albums: [album1, album2, album3] });

      describe("by genre", () => {
        beforeEach(() => {
          mockGET
            .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
            .mockImplementationOnce(() =>
              Promise.resolve(
                ok(
                  albumListXml([
                    [artist, album1],
                    [artist, album3],
                  ])
                )
              )
            );
        });

        it("should pass the filter to navidrome", async () => {
          const q = { _index: 0, _count: 500, genre: "Pop" };
          const result = await navidrome
            .generateToken({ username, password })
            .then((it) => it as AuthSuccess)
            .then((it) => navidrome.login(it.authToken))
            .then((it) => it.albums(q));

          expect(result).toEqual({
            results: [album1, album3].map(albumToAlbumSummary),
            total: 2,
          });

          expect(axios.get).toHaveBeenCalledWith(`${url}/rest/getAlbumList`, {
            params: {
              type: "byGenre",
              genre: "Pop",
              size: 500,
              offset: 0,
              ...authParams,
            },
          });
        });
      });
    });

    describe("when there are less than 500 albums", () => {
      const artist1 = anArtist({
        name: "abba",
        albums: [anAlbum(), anAlbum(), anAlbum()],
      });
      const artist2 = anArtist({
        name: "babba",
        albums: [anAlbum(), anAlbum(), anAlbum()],
      });
      const artists = [artist1, artist2];
      const albums = artists.flatMap((artist) => artist.albums);

      beforeEach(() => {
        mockGET
          .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
          .mockImplementationOnce(() =>
            Promise.resolve(ok(albumListXml(asArtistAlbumPairs(artists))))
          );
      });

      describe("querying for all of them", () => {
        it("should return all of them with corrent paging information", async () => {
          const paging = { _index: 0, _count: 500 };
          const result = await navidrome
            .generateToken({ username, password })
            .then((it) => it as AuthSuccess)
            .then((it) => navidrome.login(it.authToken))
            .then((it) => it.albums(paging));

          expect(result).toEqual({
            results: albums.map(albumToAlbumSummary),
            total: 6,
          });

          expect(axios.get).toHaveBeenCalledWith(`${url}/rest/getAlbumList`, {
            params: {
              type: "alphabeticalByArtist",
              size: 500,
              offset: 0,
              ...authParams,
            },
          });
        });
      });

      describe("querying for a page of them", () => {
        it("should return the page with the corrent paging information", async () => {
          const paging = { _index: 2, _count: 2 };
          const result = await navidrome
            .generateToken({ username, password })
            .then((it) => it as AuthSuccess)
            .then((it) => navidrome.login(it.authToken))
            .then((it) => it.albums(paging));

          expect(result).toEqual({
            results: [albums[2], albums[3]],
            total: 6,
          });

          expect(axios.get).toHaveBeenCalledWith(`${url}/rest/getAlbumList`, {
            params: {
              type: "alphabeticalByArtist",
              size: 500,
              offset: 0,
              ...authParams,
            },
          });
        });
      });
    });

    describe("when there are more than 500 albums", () => {
      const first500Albums = range(500).map((i) =>
        anAlbum({ name: `album ${i}` })
      );
      const artist = anArtist({
        name: "> 500 albums",
        albums: [...first500Albums, anAlbum(), anAlbum(), anAlbum()],
      });

      beforeEach(() => {
        mockGET
          .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
          .mockImplementationOnce(() =>
            Promise.resolve(
              ok(
                albumListXml(
                  first500Albums.map(
                    (album) => [artist, album] as [Artist, Album]
                  )
                )
              )
            )
          );
      });

      describe("querying for all of them", () => {
        it("will return only the first 500 with the correct paging information", async () => {
          const paging = { _index: 0, _count: 1000 };
          const result = await navidrome
            .generateToken({ username, password })
            .then((it) => it as AuthSuccess)
            .then((it) => navidrome.login(it.authToken))
            .then((it) => it.albums(paging));

          expect(result).toEqual({
            results: first500Albums.map(albumToAlbumSummary),
            total: 500,
          });

          expect(axios.get).toHaveBeenCalledWith(`${url}/rest/getAlbumList`, {
            params: {
              type: "alphabeticalByArtist",
              size: 500,
              offset: 0,
              ...authParams,
            },
          });
        });
      });
    });
  });
});
