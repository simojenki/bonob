import { Md5 } from "ts-md5/dist/md5";
import { v4 as uuid } from "uuid";

import {
  isDodgyImage,
  Navidrome,
  t,
  BROWSER_HEADERS,
  DODGY_IMAGE_NAME,
  asGenre,
  appendMimeTypeToClientFor
} from "../src/navidrome";
import encryption from "../src/encryption";

import axios from "axios";
jest.mock("axios");

import sharp from "sharp";
jest.mock("sharp");

import randomString from "../src/random_string";
import {
  Album,
  Artist,
  AuthSuccess,
  Images,
  albumToAlbumSummary,
  range,
  asArtistAlbumPairs,
  Track,
  AlbumSummary,
  artistToArtistSummary,
  AlbumQuery,
} from "../src/music_service";
import { anAlbum, anArtist, aTrack } from "./builders";

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

describe("appendMimeTypeToUserAgentFor", () => {
  describe("when empty array", () => {
    it("should return bonob", () => {
      expect(appendMimeTypeToClientFor([])(aTrack())).toEqual("bonob");
    });
  });

  describe("when contains some mimeTypes", () => {
    const streamUserAgent = appendMimeTypeToClientFor(["audio/flac", "audio/ogg"])

    describe("and the track mimeType is in the array", () => {
      it("should return bonob+mimeType", () => {
        expect(streamUserAgent(aTrack({ mimeType: "audio/flac"}))).toEqual("bonob+audio/flac")
        expect(streamUserAgent(aTrack({ mimeType: "audio/ogg"}))).toEqual("bonob+audio/ogg")
      });
    });

    describe("and the track mimeType is not in the array", () => {
      it("should return bonob", () => {
        expect(streamUserAgent(aTrack({ mimeType: "audio/mp3"}))).toEqual("bonob")
      });
    });
  });
});

const ok = (data: string) => ({
  status: 200,
  data,
});

const artistInfoXml = (
  artist: Artist
) => `<subsonic-response xmlns="http://subsonic.org/restapi" status="ok" version="1.16.1" type="navidrome" serverVersion="0.40.0 (8799358a)">
          <artistInfo>
              <biography></biography>
              <musicBrainzId></musicBrainzId>
              <lastFmUrl></lastFmUrl>
              <smallImageUrl>${artist.image.small || ""}</smallImageUrl>
              <mediumImageUrl>${artist.image.medium || ""}</mediumImageUrl>
              <largeImageUrl>${artist.image.large || ""}</largeImageUrl>
              ${artist.similarArtists.map(
                (it) =>
                  `<similarArtist id="${it.id}" name="${it.name}" albumCount="3"></similarArtist>`
              )}
          </artistInfo>
        </subsonic-response>`;

const albumXml = (
  artist: Artist,
  album: AlbumSummary,
  tracks: Track[] = []
) => `<album id="${album.id}" 
            parent="${artist.id}" 
            isDir="true" 
            title="${album.name}" name="${album.name}" album="${album.name}" 
            artist="${artist.name}" 
            genre="${album.genre?.name}" 
            coverArt="foo" 
            duration="123" 
            playCount="4" 
            year="${album.year}"
            created="2021-01-07T08:19:55.834207205Z" 
            artistId="${artist.id}" 
            songCount="19" 
            isVideo="false">${tracks.map((track) => songXml(track))}</album>`;

const songXml = (track: Track) => `<song 
            id="${track.id}" 
            parent="${track.album.id}" 
            title="${track.name}" 
            album="${track.album.name}" 
            artist="${track.artist.name}" 
            track="${track.number}"
            genre="${track.genre?.name}"
            isDir="false" 
            coverArt="71381" 
            created="2004-11-08T23:36:11" 
            duration="${track.duration}" 
            bitRate="128" 
            size="5624132" 
            suffix="mp3" 
            contentType="${track.mimeType}" 
            isVideo="false" 
            path="ACDC/High voltage/ACDC - The Jack.mp3" 
            albumId="${track.album.id}" 
            artistId="${track.artist.id}" 
            type="music"/>`;

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

const getAlbumXml = (
  artist: Artist,
  album: Album,
  tracks: Track[]
) => `<subsonic-response status="ok" version="1.8.0">
                                                        ${albumXml(
                                                          artist,
                                                          album,
                                                          tracks
                                                        )}
                                                      </subsonic-response>`;

const getSongXml = (
  track: Track
) => `<subsonic-response xmlns="http://subsonic.org/restapi" status="ok" version="1.16.1" type="navidrome" serverVersion="0.40.0 (8799358a)">
                                                                    ${songXml(
                                                                      track
                                                                    )}
                                                                    </subsonic-response>`;

const EMPTY = `<subsonic-response xmlns="http://subsonic.org/restapi" status="ok" version="1.16.1" type="navidrome" serverVersion="0.40.0 (8799358a)"></subsonic-response>`;

const PING_OK = `<subsonic-response xmlns="http://subsonic.org/restapi" status="ok" version="1.16.1" type="navidrome" serverVersion="0.40.0 (8799358a)"></subsonic-response>`;

describe("Navidrome", () => {
  const url = "http://127.0.0.22:4567";
  const username = "user1";
  const password = "pass1";
  const salt = "saltysalty";

  const streamClientApplication = jest.fn();
  const navidrome = new Navidrome(url, encryption("secret"), streamClientApplication);

  const mockedRandomString = (randomString as unknown) as jest.Mock;
  const mockGET = jest.fn();
  const mockPOST = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetAllMocks();

    axios.get = mockGET;
    axios.post = mockPOST;

    mockedRandomString.mockReturnValue(salt);
  });

  const authParams = {
    u: username,
    t: t(password, salt),
    s: salt,
    v: "1.16.1",
    c: "bonob",
  };
  const headers = {
    "User-Agent": "bonob",
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
          headers,
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
    describe("when there is only 1", () => {
      const genres = ["genre1"];

      beforeEach(() => {
        mockGET
          .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
          .mockImplementationOnce(() => Promise.resolve(ok(genresXml(genres))));
      });

      it("should return them alphabetically sorted", async () => {
        const result = await navidrome
          .generateToken({ username, password })
          .then((it) => it as AuthSuccess)
          .then((it) => navidrome.login(it.authToken))
          .then((it) => it.genres());

        expect(result).toEqual(genres.map(asGenre));

        expect(axios.get).toHaveBeenCalledWith(`${url}/rest/getGenres`, {
          params: {
            ...authParams,
          },
          headers,
        });
      });
    });

    describe("when there are many", () => {
      const genres = ["g1", "g2", "g3", "g3"];
      beforeEach(() => {
        mockGET
          .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
          .mockImplementationOnce(() => Promise.resolve(ok(genresXml(genres))));
      });

      it("should return them alphabetically sorted", async () => {
        const result = await navidrome
          .generateToken({ username, password })
          .then((it) => it as AuthSuccess)
          .then((it) => navidrome.login(it.authToken))
          .then((it) => it.genres());

        expect(result).toEqual(genres.map(asGenre));

        expect(axios.get).toHaveBeenCalledWith(`${url}/rest/getGenres`, {
          params: {
            ...authParams,
          },
          headers,
        });
      });
    });
  });

  describe("getting an artist", () => {
    describe("when the artist exists", () => {
      describe("and has many similar artists", () => {
        const album1: Album = anAlbum({ genre: asGenre("Pop") });

        const album2: Album = anAlbum({ genre: asGenre("Pop") });

        const artist: Artist = anArtist({
          albums: [album1, album2],
          image: {
            small: `http://localhost:80/${DODGY_IMAGE_NAME}`,
            medium: `http://localhost:80/${DODGY_IMAGE_NAME}`,
            large: `http://localhost:80/${DODGY_IMAGE_NAME}`,
          },
          similarArtists: [
            { id: "similar1.id", name: "similar1" },
            { id: "similar2.id", name: "similar2" },
          ],
        });

        beforeEach(() => {
          mockGET
            .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
            .mockImplementationOnce(() =>
              Promise.resolve(ok(artistXml(artist)))
            )
            .mockImplementationOnce(() =>
              Promise.resolve(ok(artistInfoXml(artist)))
            );
        });

        it("should return the similar artists", async () => {
          const result: Artist = await navidrome
            .generateToken({ username, password })
            .then((it) => it as AuthSuccess)
            .then((it) => navidrome.login(it.authToken))
            .then((it) => it.artist(artist.id));

          expect(result).toEqual({
            id: artist.id,
            name: artist.name,
            image: {
              small: undefined,
              medium: undefined,
              large: undefined,
            },
            albums: artist.albums,
            similarArtists: artist.similarArtists,
          });

          expect(axios.get).toHaveBeenCalledWith(`${url}/rest/getArtist`, {
            params: {
              id: artist.id,
              ...authParams,
            },
            headers,
          });

          expect(axios.get).toHaveBeenCalledWith(`${url}/rest/getArtistInfo`, {
            params: {
              id: artist.id,
              ...authParams,
            },
            headers,
          });
        });
      });

      describe("and has one similar artists", () => {
        const album1: Album = anAlbum({ genre: asGenre("G1") });

        const album2: Album = anAlbum({ genre: asGenre("G2") });

        const artist: Artist = anArtist({
          albums: [album1, album2],
          image: {
            small: `http://localhost:80/${DODGY_IMAGE_NAME}`,
            medium: `http://localhost:80/${DODGY_IMAGE_NAME}`,
            large: `http://localhost:80/${DODGY_IMAGE_NAME}`,
          },
          similarArtists: [{ id: "similar1.id", name: "similar1" }],
        });

        beforeEach(() => {
          mockGET
            .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
            .mockImplementationOnce(() =>
              Promise.resolve(ok(artistXml(artist)))
            )
            .mockImplementationOnce(() =>
              Promise.resolve(ok(artistInfoXml(artist)))
            );
        });

        it("should return the similar artists", async () => {
          const result: Artist = await navidrome
            .generateToken({ username, password })
            .then((it) => it as AuthSuccess)
            .then((it) => navidrome.login(it.authToken))
            .then((it) => it.artist(artist.id));

          expect(result).toEqual({
            id: artist.id,
            name: artist.name,
            image: {
              small: undefined,
              medium: undefined,
              large: undefined,
            },
            albums: artist.albums,
            similarArtists: artist.similarArtists,
          });

          expect(axios.get).toHaveBeenCalledWith(`${url}/rest/getArtist`, {
            params: {
              id: artist.id,
              ...authParams,
            },
            headers,
          });

          expect(axios.get).toHaveBeenCalledWith(`${url}/rest/getArtistInfo`, {
            params: {
              id: artist.id,
              ...authParams,
            },
            headers,
          });
        });
      });

      describe("and has no similar artists", () => {
        const album1: Album = anAlbum({ genre: asGenre("Jock") });

        const album2: Album = anAlbum({ genre: asGenre("Mock") });

        const artist: Artist = anArtist({
          albums: [album1, album2],
          image: {
            small: `http://localhost:80/${DODGY_IMAGE_NAME}`,
            medium: `http://localhost:80/${DODGY_IMAGE_NAME}`,
            large: `http://localhost:80/${DODGY_IMAGE_NAME}`,
          },
          similarArtists: [],
        });

        beforeEach(() => {
          mockGET
            .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
            .mockImplementationOnce(() =>
              Promise.resolve(ok(artistXml(artist)))
            )
            .mockImplementationOnce(() =>
              Promise.resolve(ok(artistInfoXml(artist)))
            );
        });

        it("should return the similar artists", async () => {
          const result: Artist = await navidrome
            .generateToken({ username, password })
            .then((it) => it as AuthSuccess)
            .then((it) => navidrome.login(it.authToken))
            .then((it) => it.artist(artist.id));

          expect(result).toEqual({
            id: artist.id,
            name: artist.name,
            image: {
              small: undefined,
              medium: undefined,
              large: undefined,
            },
            albums: artist.albums,
            similarArtists: artist.similarArtists,
          });

          expect(axios.get).toHaveBeenCalledWith(`${url}/rest/getArtist`, {
            params: {
              id: artist.id,
              ...authParams,
            },
            headers,
          });

          expect(axios.get).toHaveBeenCalledWith(`${url}/rest/getArtistInfo`, {
            params: {
              id: artist.id,
              ...authParams,
            },
            headers,
          });
        });
      });

      describe("and has dodgy looking artist image uris", () => {
        const album1: Album = anAlbum({ genre: asGenre("Pop") });

        const album2: Album = anAlbum({ genre: asGenre("Flop") });

        const artist: Artist = anArtist({
          albums: [album1, album2],
          image: {
            small: `http://localhost:80/${DODGY_IMAGE_NAME}`,
            medium: `http://localhost:80/${DODGY_IMAGE_NAME}`,
            large: `http://localhost:80/${DODGY_IMAGE_NAME}`,
          },
          similarArtists: [],
        });

        beforeEach(() => {
          mockGET
            .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
            .mockImplementationOnce(() =>
              Promise.resolve(ok(artistXml(artist)))
            )
            .mockImplementationOnce(() =>
              Promise.resolve(ok(artistInfoXml(artist)))
            );
        });

        it("should return remove the dodgy looking image uris and return undefined", async () => {
          const result: Artist = await navidrome
            .generateToken({ username, password })
            .then((it) => it as AuthSuccess)
            .then((it) => navidrome.login(it.authToken))
            .then((it) => it.artist(artist.id));

          expect(result).toEqual({
            id: artist.id,
            name: artist.name,
            image: {
              small: undefined,
              medium: undefined,
              large: undefined,
            },
            albums: artist.albums,
            similarArtists: [],
          });

          expect(axios.get).toHaveBeenCalledWith(`${url}/rest/getArtist`, {
            params: {
              id: artist.id,
              ...authParams,
            },
            headers,
          });

          expect(axios.get).toHaveBeenCalledWith(`${url}/rest/getArtistInfo`, {
            params: {
              id: artist.id,
              ...authParams,
            },
            headers,
          });
        });
      });

      describe("and has multiple albums", () => {
        const album1: Album = anAlbum({ genre: asGenre("Pop") });

        const album2: Album = anAlbum({ genre: asGenre("Flop") });

        const artist: Artist = anArtist({
          albums: [album1, album2],
          similarArtists: [],
        });

        beforeEach(() => {
          mockGET
            .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
            .mockImplementationOnce(() =>
              Promise.resolve(ok(artistXml(artist)))
            )
            .mockImplementationOnce(() =>
              Promise.resolve(ok(artistInfoXml(artist)))
            );
        });

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
            similarArtists: [],
          });

          expect(axios.get).toHaveBeenCalledWith(`${url}/rest/getArtist`, {
            params: {
              id: artist.id,
              ...authParams,
            },
            headers,
          });

          expect(axios.get).toHaveBeenCalledWith(`${url}/rest/getArtistInfo`, {
            params: {
              id: artist.id,
              ...authParams,
            },
            headers,
          });
        });
      });

      describe("and has only 1 album", () => {
        const album: Album = anAlbum({ genre: asGenre("Pop") });

        const artist: Artist = anArtist({
          albums: [album],
          similarArtists: [],
        });

        beforeEach(() => {
          mockGET
            .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
            .mockImplementationOnce(() =>
              Promise.resolve(ok(artistXml(artist)))
            )
            .mockImplementationOnce(() =>
              Promise.resolve(ok(artistInfoXml(artist)))
            );
        });

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
            similarArtists: [],
          });

          expect(axios.get).toHaveBeenCalledWith(`${url}/rest/getArtist`, {
            params: {
              id: artist.id,
              ...authParams,
            },
            headers,
          });

          expect(axios.get).toHaveBeenCalledWith(`${url}/rest/getArtistInfo`, {
            params: {
              id: artist.id,
              ...authParams,
            },
            headers,
          });
        });
      });

      describe("and has no albums", () => {
        const artist: Artist = anArtist({
          albums: [],
          similarArtists: [],
        });

        beforeEach(() => {
          mockGET
            .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
            .mockImplementationOnce(() =>
              Promise.resolve(ok(artistXml(artist)))
            )
            .mockImplementationOnce(() =>
              Promise.resolve(ok(artistInfoXml(artist)))
            );
        });

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
            albums: [],
            similarArtists: [],
          });

          expect(axios.get).toHaveBeenCalledWith(`${url}/rest/getArtist`, {
            params: {
              id: artist.id,
              ...authParams,
            },
            headers,
          });

          expect(axios.get).toHaveBeenCalledWith(`${url}/rest/getArtistInfo`, {
            params: {
              id: artist.id,
              ...authParams,
            },
            headers,
          });
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
                <index name="C">
                  <!-- intentionally no artists -->
                </index>
              </artists>
            </subsonic-response>`;

      describe("when no paging is in effect", () => {
        beforeEach(() => {
          mockGET
            .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
            .mockImplementationOnce(() => Promise.resolve(ok(getArtistsXml)));
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
            })
          );

          expect(artists).toEqual({
            results: expectedResults,
            total: 4,
          });

          expect(axios.get).toHaveBeenCalledWith(`${url}/rest/getArtists`, {
            params: authParams,
            headers,
          });
        });
      });

      describe("when paging specified", () => {
        beforeEach(() => {
          mockGET
            .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
            .mockImplementationOnce(() => Promise.resolve(ok(getArtistsXml)));
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
          }));

          expect(artists).toEqual({ results: expectedResults, total: 4 });

          expect(axios.get).toHaveBeenCalledWith(`${url}/rest/getArtists`, {
            params: authParams,
            headers,
          });
        });
      });
    });
  });

  describe("getting albums", () => {
    describe("filtering", () => {
      const album1 = anAlbum({ genre: asGenre("Pop") });
      const album2 = anAlbum({ genre: asGenre("Rock") });
      const album3 = anAlbum({ genre: asGenre("Pop") });

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
          const q: AlbumQuery = {
            _index: 0,
            _count: 500,
            genre: "Pop",
            type: "byGenre",
          };
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
            headers,
          });
        });
      });

      describe("by newest", () => {
        beforeEach(() => {
          mockGET
            .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
            .mockImplementationOnce(() =>
              Promise.resolve(
                ok(
                  albumListXml([
                    [artist, album3],
                    [artist, album2],
                  ])
                )
              )
            );
        });

        it("should pass the filter to navidrome", async () => {
          const q: AlbumQuery = { _index: 0, _count: 500, type: "newest" };
          const result = await navidrome
            .generateToken({ username, password })
            .then((it) => it as AuthSuccess)
            .then((it) => navidrome.login(it.authToken))
            .then((it) => it.albums(q));

          expect(result).toEqual({
            results: [album3, album2].map(albumToAlbumSummary),
            total: 2,
          });

          expect(axios.get).toHaveBeenCalledWith(`${url}/rest/getAlbumList`, {
            params: {
              type: "newest",
              size: 500,
              offset: 0,
              ...authParams,
            },
            headers,
          });
        });
      });

      describe("by recently played", () => {
        beforeEach(() => {
          mockGET
            .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
            .mockImplementationOnce(() =>
              Promise.resolve(
                ok(
                  albumListXml([
                    [artist, album3],
                    [artist, album2],
                  ])
                )
              )
            );
        });

        it("should pass the filter to navidrome", async () => {
          const q: AlbumQuery = { _index: 0, _count: 500, type: "recent" };
          const result = await navidrome
            .generateToken({ username, password })
            .then((it) => it as AuthSuccess)
            .then((it) => navidrome.login(it.authToken))
            .then((it) => it.albums(q));

          expect(result).toEqual({
            results: [album3, album2].map(albumToAlbumSummary),
            total: 2,
          });

          expect(axios.get).toHaveBeenCalledWith(`${url}/rest/getAlbumList`, {
            params: {
              type: "recent",
              size: 500,
              offset: 0,
              ...authParams,
            },
            headers,
          });
        });
      });

      describe("by frequently played", () => {
        beforeEach(() => {
          mockGET
            .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
            .mockImplementationOnce(() =>
              Promise.resolve(ok(albumListXml([[artist, album2]])))
            );
        });

        it("should pass the filter to navidrome", async () => {
          const q: AlbumQuery = { _index: 0, _count: 500, type: "frequent" };
          const result = await navidrome
            .generateToken({ username, password })
            .then((it) => it as AuthSuccess)
            .then((it) => navidrome.login(it.authToken))
            .then((it) => it.albums(q));

          expect(result).toEqual({
            results: [album2].map(albumToAlbumSummary),
            total: 1,
          });

          expect(axios.get).toHaveBeenCalledWith(`${url}/rest/getAlbumList`, {
            params: {
              type: "frequent",
              size: 500,
              offset: 0,
              ...authParams,
            },
            headers,
          });
        });
      });
    });

    describe("when the artist has only 1 album", () => {
      const artist1 = anArtist({
        name: "one hit wonder",
        albums: [anAlbum({ genre: asGenre("Pop") })],
      });
      const artists = [artist1];
      const albums = artists.flatMap((artist) => artist.albums);

      beforeEach(() => {
        mockGET
          .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
          .mockImplementationOnce(() =>
            Promise.resolve(ok(albumListXml(asArtistAlbumPairs(artists))))
          );
      });

      it("should return the album", async () => {
        const q: AlbumQuery = {
          _index: 0,
          _count: 500,
          type: "alphabeticalByArtist",
        };
        const result = await navidrome
          .generateToken({ username, password })
          .then((it) => it as AuthSuccess)
          .then((it) => navidrome.login(it.authToken))
          .then((it) => it.albums(q));

        expect(result).toEqual({
          results: albums,
          total: 1,
        });

        expect(axios.get).toHaveBeenCalledWith(`${url}/rest/getAlbumList`, {
          params: {
            type: "alphabeticalByArtist",
            size: 500,
            offset: 0,
            ...authParams,
          },
          headers,
        });
      });
    });

    describe("when the artist has only no albums", () => {
      const artist1 = anArtist({
        name: "one hit wonder",
        albums: [],
      });
      const artists = [artist1];
      const albums = artists.flatMap((artist) => artist.albums);

      beforeEach(() => {
        mockGET
          .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
          .mockImplementationOnce(() =>
            Promise.resolve(ok(albumListXml(asArtistAlbumPairs(artists))))
          );
      });

      it("should return the album", async () => {
        const q: AlbumQuery = {
          _index: 0,
          _count: 500,
          type: "alphabeticalByArtist",
        };
        const result = await navidrome
          .generateToken({ username, password })
          .then((it) => it as AuthSuccess)
          .then((it) => navidrome.login(it.authToken))
          .then((it) => it.albums(q));

        expect(result).toEqual({
          results: albums,
          total: 0,
        });

        expect(axios.get).toHaveBeenCalledWith(`${url}/rest/getAlbumList`, {
          params: {
            type: "alphabeticalByArtist",
            size: 500,
            offset: 0,
            ...authParams,
          },
          headers,
        });
      });
    });

    describe("when there are less than 500 albums", () => {
      const genre1 = asGenre("genre1");
      const genre2 = asGenre("genre2");
      const genre3 = asGenre("genre3");

      const artist1 = anArtist({
        name: "abba",
        albums: [
          anAlbum({ genre: genre1 }),
          anAlbum({ genre: genre2 }),
          anAlbum({ genre: genre3 }),
        ],
      });
      const artist2 = anArtist({
        name: "babba",
        albums: [
          anAlbum({ genre: genre1 }),
          anAlbum({ genre: genre2 }),
          anAlbum({ genre: genre3 }),
        ],
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
          const q: AlbumQuery = {
            _index: 0,
            _count: 500,
            type: "alphabeticalByArtist",
          };
          const result = await navidrome
            .generateToken({ username, password })
            .then((it) => it as AuthSuccess)
            .then((it) => navidrome.login(it.authToken))
            .then((it) => it.albums(q));

          expect(result).toEqual({
            results: albums,
            total: 6,
          });

          expect(axios.get).toHaveBeenCalledWith(`${url}/rest/getAlbumList`, {
            params: {
              type: "alphabeticalByArtist",
              size: 500,
              offset: 0,
              ...authParams,
            },
            headers,
          });
        });
      });

      describe("querying for a page of them", () => {
        it("should return the page with the corrent paging information", async () => {
          const q: AlbumQuery = {
            _index: 2,
            _count: 2,
            type: "alphabeticalByArtist",
          };
          const result = await navidrome
            .generateToken({ username, password })
            .then((it) => it as AuthSuccess)
            .then((it) => navidrome.login(it.authToken))
            .then((it) => it.albums(q));

          expect(result).toEqual({
            results: [albums[2], albums[3]],
            total: 6,
          });

          expect(axios.get).toHaveBeenCalledWith(`${url}/rest/getAlbumList`, {
            params: {
              type: "alphabeticalByArtist",
              size: 2,
              offset: 2,
              ...authParams,
            },
            headers,
          });
        });
      });
    });

    describe("when there are more than 500 albums", () => {
      const first500Albums = range(500).map((i) =>
        anAlbum({ name: `album ${i}`, genre: asGenre(`genre ${i}`) })
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
          const q: AlbumQuery = {
            _index: 0,
            _count: 1000,
            type: "alphabeticalByArtist",
          };
          const result = await navidrome
            .generateToken({ username, password })
            .then((it) => it as AuthSuccess)
            .then((it) => navidrome.login(it.authToken))
            .then((it) => it.albums(q));

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
            headers,
          });
        });
      });
    });
  });

  describe("getting an album", () => {
    describe("when it exists", () => {
      const genre = asGenre("Pop");

      const album = anAlbum({ genre });

      const artist = anArtist({ albums: [album] });

      const tracks = [
        aTrack({ artist, album, genre }),
        aTrack({ artist, album, genre }),
        aTrack({ artist, album, genre }),
        aTrack({ artist, album, genre }),
      ];

      beforeEach(() => {
        mockGET
          .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
          .mockImplementationOnce(() =>
            Promise.resolve(ok(getAlbumXml(artist, album, tracks)))
          );
      });

      it("should return the album", async () => {
        const result = await navidrome
          .generateToken({ username, password })
          .then((it) => it as AuthSuccess)
          .then((it) => navidrome.login(it.authToken))
          .then((it) => it.album(album.id));

        expect(result).toEqual(album);

        expect(axios.get).toHaveBeenCalledWith(`${url}/rest/getAlbum`, {
          params: {
            id: album.id,
            ...authParams,
          },
          headers,
        });
      });
    });
  });

  describe("getting tracks", () => {
    describe("for an album", () => {
      describe("when the album has multiple tracks", () => {
        const hipHop = asGenre("Hip-Hop");
        const tripHop = asGenre("Trip-Hop");

        const album = anAlbum({ id: "album1", name: "Burnin", genre: hipHop });
        const albumSummary = albumToAlbumSummary(album);

        const artist = anArtist({
          id: "artist1",
          name: "Bob Marley",
          albums: [album],
        });
        const artistSummary = artistToArtistSummary(artist);

        const tracks = [
          aTrack({ artist: artistSummary, album: albumSummary, genre: hipHop }),
          aTrack({ artist: artistSummary, album: albumSummary, genre: hipHop }),
          aTrack({
            artist: artistSummary,
            album: albumSummary,
            genre: tripHop,
          }),
          aTrack({
            artist: artistSummary,
            album: albumSummary,
            genre: tripHop,
          }),
        ];

        beforeEach(() => {
          mockGET
            .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getAlbumXml(artist, album, tracks)))
            );
        });

        it("should return the album", async () => {
          const result = await navidrome
            .generateToken({ username, password })
            .then((it) => it as AuthSuccess)
            .then((it) => navidrome.login(it.authToken))
            .then((it) => it.tracks(album.id));

          expect(result).toEqual(tracks);

          expect(axios.get).toHaveBeenCalledWith(`${url}/rest/getAlbum`, {
            params: {
              id: album.id,
              ...authParams,
            },
            headers,
          });
        });
      });

      describe("when the album has only 1 track", () => {
        const flipFlop = asGenre("Flip-Flop");

        const album = anAlbum({
          id: "album1",
          name: "Burnin",
          genre: flipFlop,
        });
        const albumSummary = albumToAlbumSummary(album);

        const artist = anArtist({
          id: "artist1",
          name: "Bob Marley",
          albums: [album],
        });
        const artistSummary = artistToArtistSummary(artist);

        const tracks = [
          aTrack({
            artist: artistSummary,
            album: albumSummary,
            genre: flipFlop,
          }),
        ];

        beforeEach(() => {
          mockGET
            .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getAlbumXml(artist, album, tracks)))
            );
        });

        it("should return the album", async () => {
          const result = await navidrome
            .generateToken({ username, password })
            .then((it) => it as AuthSuccess)
            .then((it) => navidrome.login(it.authToken))
            .then((it) => it.tracks(album.id));

          expect(result).toEqual(tracks);

          expect(axios.get).toHaveBeenCalledWith(`${url}/rest/getAlbum`, {
            params: {
              id: album.id,
              ...authParams,
            },
            headers,
          });
        });
      });

      describe("when the album has only no tracks", () => {
        const album = anAlbum({ id: "album1", name: "Burnin" });

        const artist = anArtist({
          id: "artist1",
          name: "Bob Marley",
          albums: [album],
        });

        const tracks: Track[] = [];

        beforeEach(() => {
          mockGET
            .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getAlbumXml(artist, album, tracks)))
            );
        });

        it("should empty array", async () => {
          const result = await navidrome
            .generateToken({ username, password })
            .then((it) => it as AuthSuccess)
            .then((it) => navidrome.login(it.authToken))
            .then((it) => it.tracks(album.id));

          expect(result).toEqual([]);

          expect(axios.get).toHaveBeenCalledWith(`${url}/rest/getAlbum`, {
            params: {
              id: album.id,
              ...authParams,
            },
            headers,
          });
        });
      });
    });

    describe("a single track", () => {
      const pop = asGenre("Pop");

      const album = anAlbum({ id: "album1", name: "Burnin", genre: pop });
      const albumSummary = albumToAlbumSummary(album);

      const artist = anArtist({
        id: "artist1",
        name: "Bob Marley",
        albums: [album],
      });
      const artistSummary = artistToArtistSummary(artist);

      const track = aTrack({
        artist: artistSummary,
        album: albumSummary,
        genre: pop,
      });

      beforeEach(() => {
        mockGET
          .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
          .mockImplementationOnce(() => Promise.resolve(ok(getSongXml(track))))
          .mockImplementationOnce(() =>
            Promise.resolve(ok(getAlbumXml(artist, album, [])))
          );
      });

      it("should return the track", async () => {
        const result = await navidrome
          .generateToken({ username, password })
          .then((it) => it as AuthSuccess)
          .then((it) => navidrome.login(it.authToken))
          .then((it) => it.track(track.id));

        expect(result).toEqual(track);

        expect(axios.get).toHaveBeenCalledWith(`${url}/rest/getSong`, {
          params: {
            id: track.id,
            ...authParams,
          },
          headers,
        });

        expect(axios.get).toHaveBeenCalledWith(`${url}/rest/getAlbum`, {
          params: {
            id: album.id,
            ...authParams,
          },
          headers,
        });
      });
    });
  });

  describe("streaming a track", () => {
    const trackId = uuid();
    const genre = { id: "foo", name: "foo" };

    const album = anAlbum({ genre });
    const artist = anArtist({
      albums: [album],
      image: { large: "foo", medium: undefined, small: undefined },
    });
    const track = aTrack({
      id: trackId,
      album: albumToAlbumSummary(album),
      artist: artistToArtistSummary(artist),
      genre,
    });

    describe("content-range, accept-ranges or content-length", () => {
      beforeEach(() => {
        streamClientApplication.mockReturnValue("bonob");
      });

      describe("when navidrome doesnt return a content-range, accept-ranges or content-length", () => {
        it("should return undefined values", async () => {
          const stream = {
            pipe: jest.fn()
          };

          const streamResponse = {
            status: 200,
            headers: {
              "content-type": "audio/mpeg",
            },
            data: stream,
          };

          mockGET
            .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getSongXml(track)))
            )
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getAlbumXml(artist, album, [])))
            )
            .mockImplementationOnce(() => Promise.resolve(streamResponse));

          const result = await navidrome
            .generateToken({ username, password })
            .then((it) => it as AuthSuccess)
            .then((it) => navidrome.login(it.authToken))
            .then((it) => it.stream({ trackId, range: undefined }));

          expect(result.headers).toEqual({
            "content-type": "audio/mpeg",
            "content-length": undefined,
            "content-range": undefined,
            "accept-ranges": undefined,
          });
        });
      });

      describe("when navidrome returns a undefined for content-range, accept-ranges or content-length", () => {
        it("should return undefined values", async () => {
          const stream = {
            pipe: jest.fn()
          };

          const streamResponse = {
            status: 200,
            headers: {
              "content-type": "audio/mpeg",
              "content-length": undefined,
              "content-range": undefined,
              "accept-ranges": undefined,
            },
            data: stream,
          };

          mockGET
            .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getSongXml(track)))
            )
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getAlbumXml(artist, album, [])))
            )
            .mockImplementationOnce(() => Promise.resolve(streamResponse));

          const result = await navidrome
            .generateToken({ username, password })
            .then((it) => it as AuthSuccess)
            .then((it) => navidrome.login(it.authToken))
            .then((it) => it.stream({ trackId, range: undefined }));

          expect(result.headers).toEqual({
            "content-type": "audio/mpeg",
            "content-length": undefined,
            "content-range": undefined,
            "accept-ranges": undefined,
          });
        });
      });

      describe("with no range specified", () => {
        describe("navidrome returns a 200", () => {
          it("should return the content", async () => {
            const stream = {
              pipe: jest.fn()
            };

            const streamResponse = {
              status: 200,
              headers: {
                "content-type": "audio/mpeg",
                "content-length": "1667",
                "content-range": "-200",
                "accept-ranges": "bytes",
                "some-other-header": "some-value",
              },
              data: stream,
            };

            mockGET
              .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
              .mockImplementationOnce(() =>
                Promise.resolve(ok(getSongXml(track)))
              )
              .mockImplementationOnce(() =>
                Promise.resolve(ok(getAlbumXml(artist, album, [])))
              )
              .mockImplementationOnce(() => Promise.resolve(streamResponse));

            const result = await navidrome
              .generateToken({ username, password })
              .then((it) => it as AuthSuccess)
              .then((it) => navidrome.login(it.authToken))
              .then((it) => it.stream({ trackId, range: undefined }));

            expect(result.headers).toEqual({
              "content-type": "audio/mpeg",
              "content-length": "1667",
              "content-range": "-200",
              "accept-ranges": "bytes",
            });
            expect(result.stream).toEqual(stream);

            expect(axios.get).toHaveBeenCalledWith(`${url}/rest/stream`, {
              params: {
                id: trackId,
                ...authParams,
              },
              headers: {
                "User-Agent": "bonob",
              },
              responseType: "stream",
            });
          });
        });

        describe("navidrome returns something other than a 200", () => {
          it("should return the content", async () => {
            const trackId = "track123";

            const streamResponse = {
              status: 400,
            };

            mockGET
              .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
              .mockImplementationOnce(() =>
                Promise.resolve(ok(getSongXml(track)))
              )
              .mockImplementationOnce(() =>
                Promise.resolve(ok(getAlbumXml(artist, album, [])))
              )
              .mockImplementationOnce(() => Promise.resolve(streamResponse));

            const musicLibrary = await navidrome
              .generateToken({ username, password })
              .then((it) => it as AuthSuccess)
              .then((it) => navidrome.login(it.authToken));

            return expect(
              musicLibrary.stream({ trackId, range: undefined })
            ).rejects.toEqual(`Navidrome failed with a 400`);
          });
        });
      });

      describe("with range specified", () => {
        it("should send the range to navidrome", async () => {
          const stream = {
            pipe: jest.fn()
          };

          const range = "1000-2000";
          const streamResponse = {
            status: 200,
            headers: {
              "content-type": "audio/flac",
              "content-length": "66",
              "content-range": "100-200",
              "accept-ranges": "none",
              "some-other-header": "some-value",
            },
            data: stream,
          };

          mockGET
            .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getSongXml(track)))
            )
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getAlbumXml(artist, album, [])))
            )
            .mockImplementationOnce(() => Promise.resolve(streamResponse));

          const result = await navidrome
            .generateToken({ username, password })
            .then((it) => it as AuthSuccess)
            .then((it) => navidrome.login(it.authToken))
            .then((it) => it.stream({ trackId, range }));

          expect(result.headers).toEqual({
            "content-type": "audio/flac",
            "content-length": "66",
            "content-range": "100-200",
            "accept-ranges": "none",
          });
          expect(result.stream).toEqual(stream);

          expect(axios.get).toHaveBeenCalledWith(`${url}/rest/stream`, {
            params: {
              id: trackId,
              ...authParams,
            },
            headers: {
              "User-Agent": "bonob",
              Range: range,
            },
            responseType: "stream",
          });
        });
      });
    });

    describe("when navidrome has a custom StreamClientApplication registered", () => {
      describe("when no range specified", () => {
        it("should user the custom StreamUserAgent when calling navidrome", async () => {
          const clientApplication = `bonob-${uuid()}`;
          streamClientApplication.mockReturnValue(clientApplication);
  
          const streamResponse = {
            status: 200,
            headers: {
              "content-type": "audio/mpeg",
            },
            data: Buffer.from("the track", "ascii"),
          };
  
          mockGET
            .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
            .mockImplementationOnce(() => Promise.resolve(ok(getSongXml(track))))
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getAlbumXml(artist, album, [track])))
            )
            .mockImplementationOnce(() => Promise.resolve(streamResponse));
  
          await navidrome
            .generateToken({ username, password })
            .then((it) => it as AuthSuccess)
            .then((it) => navidrome.login(it.authToken))
            .then((it) => it.stream({ trackId, range: undefined }));
  
          expect(streamClientApplication).toHaveBeenCalledWith(track);
          expect(axios.get).toHaveBeenCalledWith(`${url}/rest/stream`, {
            params: {
              id: trackId,
              ...authParams,
              c: clientApplication
            },
            headers: {
              "User-Agent": "bonob",
            },
            responseType: "stream",
          });
        });
      });
     
      describe("when range specified", () => {
        it("should user the custom StreamUserAgent when calling navidrome", async () => {
          const range = "1000-2000";
          const clientApplication = `bonob-${uuid()}`;
          streamClientApplication.mockReturnValue(clientApplication);
  
          const streamResponse = {
            status: 200,
            headers: {
              "content-type": "audio/mpeg",
            },
            data: Buffer.from("the track", "ascii"),
          };
  
          mockGET
            .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
            .mockImplementationOnce(() => Promise.resolve(ok(getSongXml(track))))
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getAlbumXml(artist, album, [track])))
            )
            .mockImplementationOnce(() => Promise.resolve(streamResponse));
  
          await navidrome
            .generateToken({ username, password })
            .then((it) => it as AuthSuccess)
            .then((it) => navidrome.login(it.authToken))
            .then((it) => it.stream({ trackId, range }));
  
          expect(streamClientApplication).toHaveBeenCalledWith(track);
          expect(axios.get).toHaveBeenCalledWith(`${url}/rest/stream`, {
            params: {
              id: trackId,
              ...authParams,
              c: clientApplication
            },
            headers: {
              "User-Agent": "bonob",
              Range: range,
            },
            responseType: "stream",
          });
        });
      });
    });
  });

  describe("fetching cover art", () => {
    describe("fetching album art", () => {
      describe("when no size is specified", () => {
        it("should fetch the image", async () => {
          const streamResponse = {
            status: 200,
            headers: {
              "content-type": "image/jpeg",
            },
            data: Buffer.from("the image", "ascii"),
          };
          const coverArtId = "someCoverArt";

          mockGET
            .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
            .mockImplementationOnce(() => Promise.resolve(streamResponse));

          const result = await navidrome
            .generateToken({ username, password })
            .then((it) => it as AuthSuccess)
            .then((it) => navidrome.login(it.authToken))
            .then((it) => it.coverArt(coverArtId, "album"));

          expect(result).toEqual({
            contentType: streamResponse.headers["content-type"],
            data: streamResponse.data,
          });

          expect(axios.get).toHaveBeenCalledWith(`${url}/rest/getCoverArt`, {
            params: {
              id: coverArtId,
              ...authParams,
            },
            headers,
            responseType: "arraybuffer",
          });
        });
      });

      describe("when size is specified", () => {
        it("should fetch the image", async () => {
          const streamResponse = {
            status: 200,
            headers: {
              "content-type": "image/jpeg",
            },
            data: Buffer.from("the image", "ascii"),
          };
          const coverArtId = "someCoverArt";
          const size = 1879;

          mockGET
            .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
            .mockImplementationOnce(() => Promise.resolve(streamResponse));

          const result = await navidrome
            .generateToken({ username, password })
            .then((it) => it as AuthSuccess)
            .then((it) => navidrome.login(it.authToken))
            .then((it) => it.coverArt(coverArtId, "album", size));

          expect(result).toEqual({
            contentType: streamResponse.headers["content-type"],
            data: streamResponse.data,
          });

          expect(axios.get).toHaveBeenCalledWith(`${url}/rest/getCoverArt`, {
            params: {
              id: coverArtId,
              size,
              ...authParams,
            },
            headers,
            responseType: "arraybuffer",
          });
        });
      });
    });

    describe("fetching artist art", () => {
      describe("when no size is specified", () => {
        describe("when the artist has a valid artist uri", () => {
          it("should fetch the image from the artist uri", async () => {
            const artistId = "someArtist123";

            const images: Images = {
              small: "http://example.com/images/small",
              medium: "http://example.com/images/medium",
              large: "http://example.com/images/large",
            };

            const streamResponse = {
              status: 200,
              headers: {
                "content-type": "image/jpeg",
              },
              data: Buffer.from("the image", "ascii"),
            };

            const artist = anArtist({ id: artistId, image: images });

            mockGET
              .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
              .mockImplementationOnce(() =>
                Promise.resolve(ok(artistXml(artist)))
              )
              .mockImplementationOnce(() =>
                Promise.resolve(ok(artistInfoXml(artist)))
              )
              .mockImplementationOnce(() => Promise.resolve(streamResponse));

            const result = await navidrome
              .generateToken({ username, password })
              .then((it) => it as AuthSuccess)
              .then((it) => navidrome.login(it.authToken))
              .then((it) => it.coverArt(artistId, "artist"));

            expect(result).toEqual({
              contentType: streamResponse.headers["content-type"],
              data: streamResponse.data,
            });

            expect(axios.get).toHaveBeenCalledWith(
              `${url}/rest/getArtistInfo`,
              {
                params: {
                  id: artistId,
                  ...authParams,
                },
                headers,
              }
            );

            expect(axios.get).toHaveBeenCalledWith(images.large, {
              headers: BROWSER_HEADERS,
              responseType: "arraybuffer",
            });
          });
        });

        describe("when the artist doest not have a valid artist uri", () => {
          describe("however has some albums", () => {
            it("should fetch the artists first album image", async () => {
              const artistId = "someArtist123";

              const images: Images = {
                small: undefined,
                medium: undefined,
                large: undefined,
              };

              const streamResponse = {
                status: 200,
                headers: {
                  "content-type": "image/jpeg",
                },
                data: Buffer.from("the image", "ascii"),
              };

              const album1 = anAlbum();
              const album2 = anAlbum();

              const artist = anArtist({
                id: artistId,
                albums: [album1, album2],
                image: images,
              });

              mockGET
                .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
                .mockImplementationOnce(() =>
                  Promise.resolve(ok(artistXml(artist)))
                )
                .mockImplementationOnce(() =>
                  Promise.resolve(ok(artistInfoXml(artist)))
                )
                .mockImplementationOnce(() => Promise.resolve(streamResponse));

              const result = await navidrome
                .generateToken({ username, password })
                .then((it) => it as AuthSuccess)
                .then((it) => navidrome.login(it.authToken))
                .then((it) => it.coverArt(artistId, "artist"));

              expect(result).toEqual({
                contentType: streamResponse.headers["content-type"],
                data: streamResponse.data,
              });

              expect(axios.get).toHaveBeenCalledWith(`${url}/rest/getArtist`, {
                params: {
                  id: artistId,
                  ...authParams,
                },
                headers,
              });

              expect(axios.get).toHaveBeenCalledWith(
                `${url}/rest/getArtistInfo`,
                {
                  params: {
                    id: artistId,
                    ...authParams,
                  },
                  headers,
                }
              );

              expect(axios.get).toHaveBeenCalledWith(
                `${url}/rest/getCoverArt`,
                {
                  params: {
                    id: album1.id,
                    ...authParams,
                  },
                  headers,
                  responseType: "arraybuffer",
                }
              );
            });
          });

          describe("and has no albums", () => {
            it("should return undefined", async () => {
              const artistId = "someArtist123";

              const images: Images = {
                small: undefined,
                medium: undefined,
                large: undefined,
              };

              const streamResponse = {
                status: 200,
                headers: {
                  "content-type": "image/jpeg",
                },
                data: Buffer.from("the image", "ascii"),
              };

              const artist = anArtist({
                id: artistId,
                albums: [],
                image: images,
              });

              mockGET
                .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
                .mockImplementationOnce(() =>
                  Promise.resolve(ok(artistXml(artist)))
                )
                .mockImplementationOnce(() =>
                  Promise.resolve(ok(artistInfoXml(artist)))
                )
                .mockImplementationOnce(() => Promise.resolve(streamResponse));

              const result = await navidrome
                .generateToken({ username, password })
                .then((it) => it as AuthSuccess)
                .then((it) => navidrome.login(it.authToken))
                .then((it) => it.coverArt(artistId, "artist"));

              expect(result).toBeUndefined();

              expect(axios.get).toHaveBeenCalledWith(`${url}/rest/getArtist`, {
                params: {
                  id: artistId,
                  ...authParams,
                },
                headers,
              });

              expect(axios.get).toHaveBeenCalledWith(
                `${url}/rest/getArtistInfo`,
                {
                  params: {
                    id: artistId,
                    ...authParams,
                  },
                  headers,
                }
              );
            });
          });
        });
      });

      describe("when size is specified", () => {
        const size = 189;

        describe("when the artist has a valid artist uri", () => {
          it("should fetch the image from the artist uri and resize it", async () => {
            const artistId = "someArtist123";

            const images: Images = {
              small: "http://example.com/images/small",
              medium: "http://example.com/images/medium",
              large: "http://example.com/images/large",
            };

            const originalImage = Buffer.from("original image", "ascii");
            const resizedImage = Buffer.from("resized image", "ascii");

            const streamResponse = {
              status: 200,
              headers: {
                "content-type": "image/jpeg",
              },
              data: originalImage,
            };

            const artist = anArtist({ id: artistId, image: images });

            mockGET
              .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
              .mockImplementationOnce(() =>
                Promise.resolve(ok(artistXml(artist)))
              )
              .mockImplementationOnce(() =>
                Promise.resolve(ok(artistInfoXml(artist)))
              )
              .mockImplementationOnce(() => Promise.resolve(streamResponse));

            const resize = jest.fn();
            ((sharp as unknown) as jest.Mock).mockReturnValue({ resize });
            resize.mockReturnValue({
              toBuffer: () => Promise.resolve(resizedImage),
            });

            const result = await navidrome
              .generateToken({ username, password })
              .then((it) => it as AuthSuccess)
              .then((it) => navidrome.login(it.authToken))
              .then((it) => it.coverArt(artistId, "artist", size));

            expect(result).toEqual({
              contentType: streamResponse.headers["content-type"],
              data: resizedImage,
            });

            expect(axios.get).toHaveBeenCalledWith(
              `${url}/rest/getArtistInfo`,
              {
                params: {
                  id: artistId,
                  ...authParams,
                },
                headers,
              }
            );

            expect(axios.get).toHaveBeenCalledWith(images.large, {
              headers: BROWSER_HEADERS,
              responseType: "arraybuffer",
            });

            expect(sharp).toHaveBeenCalledWith(streamResponse.data);
            expect(resize).toHaveBeenCalledWith(size);
          });
        });

        describe("when the artist does not have a valid artist uri", () => {
          describe("however has some albums", () => {
            it("should fetch the artists first album image", async () => {
              const artistId = "someArtist123";

              const images: Images = {
                small: undefined,
                medium: undefined,
                large: undefined,
              };

              const streamResponse = {
                status: 200,
                headers: {
                  "content-type": "image/jpeg",
                },
                data: Buffer.from("the image", "ascii"),
              };

              const album1 = anAlbum({ id: "album1Id" });
              const album2 = anAlbum({ id: "album2Id" });

              const artist = anArtist({
                id: artistId,
                albums: [album1, album2],
                image: images,
              });

              mockGET
                .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
                .mockImplementationOnce(() =>
                  Promise.resolve(ok(artistXml(artist)))
                )
                .mockImplementationOnce(() =>
                  Promise.resolve(ok(artistInfoXml(artist)))
                )
                .mockImplementationOnce(() => Promise.resolve(streamResponse));

              const result = await navidrome
                .generateToken({ username, password })
                .then((it) => it as AuthSuccess)
                .then((it) => navidrome.login(it.authToken))
                .then((it) => it.coverArt(artistId, "artist", size));

              expect(result).toEqual({
                contentType: streamResponse.headers["content-type"],
                data: streamResponse.data,
              });

              expect(axios.get).toHaveBeenCalledWith(`${url}/rest/getArtist`, {
                params: {
                  id: artistId,
                  ...authParams,
                },
                headers,
              });

              expect(axios.get).toHaveBeenCalledWith(
                `${url}/rest/getArtistInfo`,
                {
                  params: {
                    id: artistId,
                    ...authParams,
                  },
                  headers,
                }
              );

              expect(axios.get).toHaveBeenCalledWith(
                `${url}/rest/getCoverArt`,
                {
                  params: {
                    id: album1.id,
                    size,
                    ...authParams,
                  },
                  headers,
                  responseType: "arraybuffer",
                }
              );
            });
          });

          describe("and has no albums", () => {
            it("should return undefined", async () => {
              const artistId = "someArtist123";

              const images: Images = {
                small: undefined,
                medium: undefined,
                large: undefined,
              };

              const streamResponse = {
                status: 200,
                headers: {
                  "content-type": "image/jpeg",
                },
                data: Buffer.from("the image", "ascii"),
              };

              const artist = anArtist({
                id: artistId,
                albums: [],
                image: images,
              });

              mockGET
                .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
                .mockImplementationOnce(() =>
                  Promise.resolve(ok(artistXml(artist)))
                )
                .mockImplementationOnce(() =>
                  Promise.resolve(ok(artistInfoXml(artist)))
                )
                .mockImplementationOnce(() => Promise.resolve(streamResponse));

              const result = await navidrome
                .generateToken({ username, password })
                .then((it) => it as AuthSuccess)
                .then((it) => navidrome.login(it.authToken))
                .then((it) => it.coverArt(artistId, "artist"));

              expect(result).toBeUndefined();

              expect(axios.get).toHaveBeenCalledWith(`${url}/rest/getArtist`, {
                params: {
                  id: artistId,
                  ...authParams,
                },
                headers,
              });

              expect(axios.get).toHaveBeenCalledWith(
                `${url}/rest/getArtistInfo`,
                {
                  params: {
                    id: artistId,
                    ...authParams,
                  },
                  headers,
                }
              );
            });
          });
        });

        describe("when the artist has a dodgy looking artist uri", () => {
          describe("however has some albums", () => {
            it("should fetch the artists first album image", async () => {
              const artistId = "someArtist123";

              const images: Images = {
                small: `http://localhost:111/${DODGY_IMAGE_NAME}`,
                medium: `http://localhost:111/${DODGY_IMAGE_NAME}`,
                large: `http://localhost:111/${DODGY_IMAGE_NAME}`,
              };

              const streamResponse = {
                status: 200,
                headers: {
                  "content-type": "image/jpeg",
                },
                data: Buffer.from("the image", "ascii"),
              };

              const album1 = anAlbum({ id: "album1Id" });
              const album2 = anAlbum({ id: "album2Id" });

              const artist = anArtist({
                id: artistId,
                albums: [album1, album2],
                image: images,
              });

              mockGET
                .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
                .mockImplementationOnce(() =>
                  Promise.resolve(ok(artistXml(artist)))
                )
                .mockImplementationOnce(() =>
                  Promise.resolve(ok(artistInfoXml(artist)))
                )
                .mockImplementationOnce(() => Promise.resolve(streamResponse));

              const result = await navidrome
                .generateToken({ username, password })
                .then((it) => it as AuthSuccess)
                .then((it) => navidrome.login(it.authToken))
                .then((it) => it.coverArt(artistId, "artist", size));

              expect(result).toEqual({
                contentType: streamResponse.headers["content-type"],
                data: streamResponse.data,
              });

              expect(axios.get).toHaveBeenCalledWith(`${url}/rest/getArtist`, {
                params: {
                  id: artistId,
                  ...authParams,
                },
                headers,
              });

              expect(axios.get).toHaveBeenCalledWith(
                `${url}/rest/getArtistInfo`,
                {
                  params: {
                    id: artistId,
                    ...authParams,
                  },
                  headers,
                }
              );

              expect(axios.get).toHaveBeenCalledWith(
                `${url}/rest/getCoverArt`,
                {
                  params: {
                    id: album1.id,
                    size,
                    ...authParams,
                  },
                  headers,
                  responseType: "arraybuffer",
                }
              );
            });
          });

          describe("and has no albums", () => {
            it("should return undefined", async () => {
              const artistId = "someArtist123";

              const images: Images = {
                small: `http://localhost:111/${DODGY_IMAGE_NAME}`,
                medium: `http://localhost:111/${DODGY_IMAGE_NAME}`,
                large: `http://localhost:111/${DODGY_IMAGE_NAME}`,
              };

              const streamResponse = {
                status: 200,
                headers: {
                  "content-type": "image/jpeg",
                },
                data: Buffer.from("the image", "ascii"),
              };

              const artist = anArtist({
                id: artistId,
                albums: [],
                image: images,
              });

              mockGET
                .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
                .mockImplementationOnce(() =>
                  Promise.resolve(ok(artistXml(artist)))
                )
                .mockImplementationOnce(() =>
                  Promise.resolve(ok(artistInfoXml(artist)))
                )
                .mockImplementationOnce(() => Promise.resolve(streamResponse));

              const result = await navidrome
                .generateToken({ username, password })
                .then((it) => it as AuthSuccess)
                .then((it) => navidrome.login(it.authToken))
                .then((it) => it.coverArt(artistId, "artist"));

              expect(result).toBeUndefined();

              expect(axios.get).toHaveBeenCalledWith(`${url}/rest/getArtist`, {
                params: {
                  id: artistId,
                  ...authParams,
                },
                headers,
              });

              expect(axios.get).toHaveBeenCalledWith(
                `${url}/rest/getArtistInfo`,
                {
                  params: {
                    id: artistId,
                    ...authParams,
                  },
                  headers,
                }
              );
            });
          });
        });
      });
    });
  });

  describe("scrobble", () => {
    describe("when scrobbling succeeds", () => {
      it("should return true", async () => {
        const id = uuid();

        mockGET
          .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
          .mockImplementationOnce(() => Promise.resolve(ok(EMPTY)));

        const result = await navidrome
          .generateToken({ username, password })
          .then((it) => it as AuthSuccess)
          .then((it) => navidrome.login(it.authToken))
          .then((it) => it.scrobble(id));

        expect(result).toEqual(true);

        expect(mockGET).toHaveBeenCalledWith(`${url}/rest/scrobble`, {
          params: {
            id,
            submission: true,
            ...authParams,
          },
          headers,
        });
      });
    });

    describe("when scrobbling fails", () => {
      it("should return false", async () => {
        const id = uuid();

        mockGET
          .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
          .mockImplementationOnce(() =>
            Promise.resolve({
              status: 500,
              data: {},
            })
          );

        const result = await navidrome
          .generateToken({ username, password })
          .then((it) => it as AuthSuccess)
          .then((it) => navidrome.login(it.authToken))
          .then((it) => it.scrobble(id));

        expect(result).toEqual(false);

        expect(mockGET).toHaveBeenCalledWith(`${url}/rest/scrobble`, {
          params: {
            id,
            submission: true,
            ...authParams,
          },
          headers,
        });
      });
    });
  });
});
