import { Md5 } from "ts-md5/dist/md5";
import { v4 as uuid } from "uuid";

import {
  isDodgyImage,
  Navidrome,
  t,
  BROWSER_HEADERS,
  DODGY_IMAGE_NAME,
  asGenre,
  appendMimeTypeToClientFor,
  asURLSearchParams
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
  PlaylistSummary,
  Playlist,
  ArtistSummary,
} from "../src/music_service";
import {
  anAlbum,
  anArtist,
  aPlaylist,
  aPlaylistSummary,
  aTrack,
} from "./builders";

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

describe("asURLSearchParams", () => {
  describe("empty q", () => {
    it("should return empty params", () => {
      const q = {};
      const expected = new URLSearchParams();
      expect(asURLSearchParams(q)).toEqual(expected);
    });
  });

  describe("singular params", () => {
    it("should append each", () => {
      const q = {
        a: 1,
        b: "bee",
        c: false,
        d: true
      };
      const expected = new URLSearchParams();
      expected.append("a", "1");
      expected.append("b", "bee");
      expected.append("c", "false");
      expected.append("d", "true");

      expect(asURLSearchParams(q)).toEqual(expected);
    });
  });

  describe("list params", () => {
    it("should append each", () => {
      const q = {
        a: [1, "two", false, true],
        b: "yippee"
      };

      const expected = new URLSearchParams();
      expected.append("a", "1");
      expected.append("a", "two");
      expected.append("a", "false");
      expected.append("a", "true");
      expected.append("b", "yippee");

      expect(asURLSearchParams(q)).toEqual(expected);
    });
  });  
});

const ok = (data: string) => ({
  status: 200,
  data,
});

const similarArtistXml = (artistSummary: ArtistSummary) =>
  `<similarArtist id="${artistSummary.id}" name="${artistSummary.name}" albumCount="3"></similarArtist>`;

const getArtistInfoXml = (
  artist: Artist
) => `<subsonic-response xmlns="http://subsonic.org/restapi" status="ok" version="1.16.1" type="navidrome" serverVersion="0.40.0 (8799358a)">
          <artistInfo>
              <biography></biography>
              <musicBrainzId></musicBrainzId>
              <lastFmUrl></lastFmUrl>
              <smallImageUrl>${artist.image.small || ""}</smallImageUrl>
              <mediumImageUrl>${artist.image.medium || ""}</mediumImageUrl>
              <largeImageUrl>${artist.image.large || ""}</largeImageUrl>
              ${artist.similarArtists.map(similarArtistXml).join("")}
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
            isVideo="false">${tracks.map(songXml).join("")}</album>`;

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
                      ${albums
                        .map(([artist, album]) => albumXml(artist, album))
                        .join("")}
                    </albumList>
                  </subsonic-response>`;

const artistXml = (artist: Artist) => `<artist id="${artist.id}" name="${
  artist.name
}" albumCount="${artist.albums.length}" artistImageUrl="....">
                                        ${artist.albums
                                          .map((album) =>
                                            albumXml(artist, album)
                                          )
                                          .join("")}
                                      </artist>`;

const getArtistXml = (
  artist: Artist
) => `<subsonic-response xmlns="http://subsonic.org/restapi" status="ok" version="1.16.1" type="navidrome" serverVersion="0.40.0 (8799358a)">
          ${artistXml(artist)}
        </subsonic-response>`;

const genreXml = (genre: string) =>
  `<genre songCount="1475" albumCount="86">${genre}</genre>`;

const genresXml = (
  genres: string[]
) => `<subsonic-response xmlns="http://subsonic.org/restapi" status="ok" version="1.16.1" type="navidrome" serverVersion="0.40.0 (8799358a)">
                                          <genres>
                                            ${genres.map(genreXml).join("")}
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

export type ArtistWithAlbum = {
  artist: Artist;
  album: Album;
};

const playlistXml = (playlist: PlaylistSummary) =>
  `<playlist id="${playlist.id}" name="${playlist.name}" songCount="1" duration="190" public="true" owner="bob" created="2021-05-06T02:07:24.308007023Z" changed="2021-05-06T02:08:06Z"></playlist>`;

const getPlayLists = (
  playlists: PlaylistSummary[]
) => `<subsonic-response xmlns="http://subsonic.org/restapi" status="ok" version="1.16.1" type="navidrome" serverVersion="0.42.0 (f1bd736b)">
<playlists>
  ${playlists.map(playlistXml).join("")}
</playlists>
</subsonic-response>`;

const error = (code: string, message: string) =>
  `<subsonic-response xmlns="http://subsonic.org/restapi" status="failed" version="1.16.1" type="navidrome" serverVersion="0.42.0 (f1bd736b)"><error code="${code}" message="${message}"></error></subsonic-response>`;

const createPlayList = (playlist: PlaylistSummary) => `<subsonic-response xmlns="http://subsonic.org/restapi" status="ok" version="1.16.1" type="navidrome" serverVersion="0.42.0 (f1bd736b)">
  ${playlistXml(playlist)}
  </subsonic-response>`

const getPlayList = (
  playlist: Playlist
) => `<subsonic-response xmlns="http://subsonic.org/restapi" status="ok" version="1.16.1" type="navidrome" serverVersion="0.42.0 (f1bd736b)">
<playlist id="${playlist.id}" name="${playlist.name}" songCount="${
  playlist.entries.length
}" duration="627" public="true" owner="bob" created="2021-05-06T02:07:30.460465988Z" changed="2021-05-06T02:40:04Z">
  ${playlist.entries
    .map(
      (it) => `<entry 
        id="${it.id}" 
        parent="..." 
        isDir="false" 
        title="${it.name}" 
        album="${it.album.name}" 
        artist="${it.artist.name}" 
        track="${it.number}" 
        year="${it.album.year}" 
        genre="${it.album.genre?.name}" 
        coverArt="..." 
        size="123" 
        contentType="${it.mimeType}" 
        suffix="mp3" 
        duration="${it.duration}" 
        bitRate="128" 
        path="..." 
        discNumber="1" 
        created="2019-09-04T04:07:00.138169924Z" 
        albumId="${it.album.id}" 
        artistId="${it.artist.id}" 
        type="music" 
        isVideo="false"></entry>`
    )
    .join("")}
</playlist>
</subsonic-response>`;

const searchResult3 = ({
  artists,
  albums,
  tracks,
}: Partial<{
  artists: Artist[];
  albums: ArtistWithAlbum[];
  tracks: Track[];
}>) => `<subsonic-response xmlns="http://subsonic.org/restapi" status="ok" version="1.16.1" type="navidrome" serverVersion="0.41.1 (43bb0758)">
<searchResult3>
  ${(artists || [])
    .map((it) =>
      artistXml({
        ...it,
        albums: [],
      })
    )
    .join("")}
  ${(albums || []).map((it) => albumXml(it.artist, it.album, [])).join("")}
  ${(tracks || []).map((it) => songXml(it)).join("")}
</searchResult3>
</subsonic-response>`;

const EMPTY = `<subsonic-response xmlns="http://subsonic.org/restapi" status="ok" version="1.16.1" type="navidrome" serverVersion="0.40.0 (8799358a)"></subsonic-response>`;

const PING_OK = `<subsonic-response xmlns="http://subsonic.org/restapi" status="ok" version="1.16.1" type="navidrome" serverVersion="0.40.0 (8799358a)"></subsonic-response>`;

describe("Navidrome", () => {
  const url = "http://127.0.0.22:4567";
  const username = "user1";
  const password = "pass1";
  const salt = "saltysalty";

  const streamClientApplication = jest.fn();
  const navidrome = new Navidrome(
    url,
    encryption("secret"),
    streamClientApplication
  );

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
    v: "1.16.1",
    c: "bonob",
    t: t(password, salt),
    s: salt,
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
          params: asURLSearchParams(authParams),
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
          params: asURLSearchParams(authParams),
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
          params: asURLSearchParams(authParams),
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
              Promise.resolve(ok(getArtistXml(artist)))
            )
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getArtistInfoXml(artist)))
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
            params:asURLSearchParams( {
              ...authParams,
              id: artist.id,
            }),
            headers,
          });

          expect(axios.get).toHaveBeenCalledWith(`${url}/rest/getArtistInfo`, {
            params: asURLSearchParams({
              ...authParams,
              id: artist.id,
            }),
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
              Promise.resolve(ok(getArtistXml(artist)))
            )
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getArtistInfoXml(artist)))
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
            params: asURLSearchParams({
              ...authParams,
              id: artist.id,
            }),
            headers,
          });

          expect(axios.get).toHaveBeenCalledWith(`${url}/rest/getArtistInfo`, {
            params: asURLSearchParams({
              ...authParams,
              id: artist.id,
            }),
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
              Promise.resolve(ok(getArtistXml(artist)))
            )
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getArtistInfoXml(artist)))
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
            params: asURLSearchParams({
              ...authParams,
              id: artist.id,
            }),
            headers,
          });

          expect(axios.get).toHaveBeenCalledWith(`${url}/rest/getArtistInfo`, {
            params: asURLSearchParams({
              ...authParams,
              id: artist.id,
            }),
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
              Promise.resolve(ok(getArtistXml(artist)))
            )
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getArtistInfoXml(artist)))
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
            params: asURLSearchParams({
              ...authParams,
              id: artist.id,
            }),
            headers,
          });

          expect(axios.get).toHaveBeenCalledWith(`${url}/rest/getArtistInfo`, {
            params: asURLSearchParams({
              ...authParams,
              id: artist.id,
            }),
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
              Promise.resolve(ok(getArtistXml(artist)))
            )
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getArtistInfoXml(artist)))
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
            params: asURLSearchParams({
              ...authParams,
              id: artist.id,
            }),
            headers,
          });

          expect(axios.get).toHaveBeenCalledWith(`${url}/rest/getArtistInfo`, {
            params: asURLSearchParams({
              ...authParams,
              id: artist.id,
            }),
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
              Promise.resolve(ok(getArtistXml(artist)))
            )
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getArtistInfoXml(artist)))
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
            params: asURLSearchParams({
              ...authParams,
              id: artist.id,
            }),
            headers,
          });

          expect(axios.get).toHaveBeenCalledWith(`${url}/rest/getArtistInfo`, {
            params: asURLSearchParams({
              ...authParams,
              id: artist.id,
            }),
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
              Promise.resolve(ok(getArtistXml(artist)))
            )
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getArtistInfoXml(artist)))
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
            params: asURLSearchParams({
              ...authParams,
              id: artist.id,
            }),
            headers,
          });

          expect(axios.get).toHaveBeenCalledWith(`${url}/rest/getArtistInfo`, {
            params: asURLSearchParams({
              ...authParams,
              id: artist.id,
            }),
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
            params: asURLSearchParams(authParams),
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
            params: asURLSearchParams(authParams),
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
            params: asURLSearchParams({
              ...authParams,
              type: "byGenre",
              genre: "Pop",
              size: 500,
              offset: 0,
            }),
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
            params: asURLSearchParams({
              ...authParams,
              type: "newest",
              size: 500,
              offset: 0,
            }),
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
            params: asURLSearchParams({
              ...authParams,
              type: "recent",
              size: 500,
              offset: 0,
            }),
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
            params: asURLSearchParams({
              ...authParams,
              type: "frequent",
              size: 500,
              offset: 0,
            }),
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
          params: asURLSearchParams({
            ...authParams,
            type: "alphabeticalByArtist",
            size: 500,
            offset: 0,
          }),
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
          params: asURLSearchParams({
            ...authParams,
            type: "alphabeticalByArtist",
            size: 500,
            offset: 0,
          }),
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
            params: asURLSearchParams({
              ...authParams,
              type: "alphabeticalByArtist",
              size: 500,
              offset: 0,
            }),
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
            params: asURLSearchParams({
              ...authParams,
              type: "alphabeticalByArtist",
              size: 2,
              offset: 2,
            }),
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
            params: asURLSearchParams({
              ...authParams,
              type: "alphabeticalByArtist",
              size: 500,
              offset: 0,
            }),
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
          params: asURLSearchParams({
            ...authParams,
            id: album.id,
          }),
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

        const artist = anArtist({
          id: "artist1",
          name: "Bob Marley",
          albums: [album],
        });

        const tracks = [
          aTrack({
            artist: artistToArtistSummary(artist),
            album: albumToAlbumSummary(album),
            genre: hipHop,
          }),
          aTrack({
            artist: artistToArtistSummary(artist),
            album: albumToAlbumSummary(album),
            genre: hipHop,
          }),
          aTrack({
            artist: artistToArtistSummary(artist),
            album: albumToAlbumSummary(album),
            genre: tripHop,
          }),
          aTrack({
            artist: artistToArtistSummary(artist),
            album: albumToAlbumSummary(album),
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
            params: asURLSearchParams({
              ...authParams,
              id: album.id,
            }),
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

        const artist = anArtist({
          id: "artist1",
          name: "Bob Marley",
          albums: [album],
        });

        const tracks = [
          aTrack({
            artist: artistToArtistSummary(artist),
            album: albumToAlbumSummary(album),
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
            params: asURLSearchParams({
              ...authParams,
              id: album.id,
            }),
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
            params: asURLSearchParams({
              ...authParams,
              id: album.id,
            }),
            headers,
          });
        });
      });
    });

    describe("a single track", () => {
      const pop = asGenre("Pop");

      const album = anAlbum({ id: "album1", name: "Burnin", genre: pop });

      const artist = anArtist({
        id: "artist1",
        name: "Bob Marley",
        albums: [album],
      });

      const track = aTrack({
        artist: artistToArtistSummary(artist),
        album: albumToAlbumSummary(album),
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
          params: asURLSearchParams({
            ...authParams,
            id: track.id,
          }),
          headers,
        });

        expect(axios.get).toHaveBeenCalledWith(`${url}/rest/getAlbum`, {
          params: asURLSearchParams({
            ...authParams,
            id: album.id,
          }),
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
            pipe: jest.fn(),
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
            pipe: jest.fn(),
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
              pipe: jest.fn(),
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
              params: asURLSearchParams({
                ...authParams,
                id: trackId,
              }),
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
            ).rejects.toEqual(`Navidrome failed with a 400 status`);
          });
        });
      });

      describe("with range specified", () => {
        it("should send the range to navidrome", async () => {
          const stream = {
            pipe: jest.fn(),
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
            params: asURLSearchParams({
              ...authParams,
              id: trackId,
            }),
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
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getSongXml(track)))
            )
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
            params: asURLSearchParams({
              ...authParams,
              id: trackId,
              c: clientApplication,
            }),
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
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getSongXml(track)))
            )
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
            params:asURLSearchParams( {
              ...authParams,
              id: trackId,
              c: clientApplication,
            }),
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
            params: asURLSearchParams({
              ...authParams,
              id: coverArtId
            }),
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
            params: asURLSearchParams({
              ...authParams,
              id: coverArtId,
              size,
            }),
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
                Promise.resolve(ok(getArtistXml(artist)))
              )
              .mockImplementationOnce(() =>
                Promise.resolve(ok(getArtistInfoXml(artist)))
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
                params: asURLSearchParams({
                  ...authParams,
                  id: artistId,
                }),
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
                  Promise.resolve(ok(getArtistXml(artist)))
                )
                .mockImplementationOnce(() =>
                  Promise.resolve(ok(getArtistInfoXml(artist)))
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
                params: asURLSearchParams({
                  ...authParams,
                  id: artistId,
                }),
                headers,
              });

              expect(axios.get).toHaveBeenCalledWith(
                `${url}/rest/getArtistInfo`,
                {
                  params: asURLSearchParams({
                    ...authParams,
                    id: artistId,
                  }),
                  headers,
                }
              );

              expect(axios.get).toHaveBeenCalledWith(
                `${url}/rest/getCoverArt`,
                {
                  params: asURLSearchParams({
                    ...authParams,
                    id: album1.id,
                  }),
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
                  Promise.resolve(ok(getArtistXml(artist)))
                )
                .mockImplementationOnce(() =>
                  Promise.resolve(ok(getArtistInfoXml(artist)))
                )
                .mockImplementationOnce(() => Promise.resolve(streamResponse));

              const result = await navidrome
                .generateToken({ username, password })
                .then((it) => it as AuthSuccess)
                .then((it) => navidrome.login(it.authToken))
                .then((it) => it.coverArt(artistId, "artist"));

              expect(result).toBeUndefined();

              expect(axios.get).toHaveBeenCalledWith(`${url}/rest/getArtist`, {
                params: asURLSearchParams({
                  ...authParams,
                  id: artistId,
                }),
                headers,
              });

              expect(axios.get).toHaveBeenCalledWith(
                `${url}/rest/getArtistInfo`,
                {
                  params: asURLSearchParams({
                    ...authParams,
                    id: artistId,
                  }),
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
                Promise.resolve(ok(getArtistXml(artist)))
              )
              .mockImplementationOnce(() =>
                Promise.resolve(ok(getArtistInfoXml(artist)))
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
                params: asURLSearchParams({
                  ...authParams,
                  id: artistId,
                }),
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
                  Promise.resolve(ok(getArtistXml(artist)))
                )
                .mockImplementationOnce(() =>
                  Promise.resolve(ok(getArtistInfoXml(artist)))
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
                params: asURLSearchParams({
                  ...authParams,
                  id: artistId,
                }),
                headers,
              });

              expect(axios.get).toHaveBeenCalledWith(
                `${url}/rest/getArtistInfo`,
                {
                  params: asURLSearchParams({
                    ...authParams,
                    id: artistId,
                  }),
                  headers,
                }
              );

              expect(axios.get).toHaveBeenCalledWith(
                `${url}/rest/getCoverArt`,
                {
                  params: asURLSearchParams({
                    ...authParams,
                    id: album1.id,
                    size,
                  }),
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
                  Promise.resolve(ok(getArtistXml(artist)))
                )
                .mockImplementationOnce(() =>
                  Promise.resolve(ok(getArtistInfoXml(artist)))
                )
                .mockImplementationOnce(() => Promise.resolve(streamResponse));

              const result = await navidrome
                .generateToken({ username, password })
                .then((it) => it as AuthSuccess)
                .then((it) => navidrome.login(it.authToken))
                .then((it) => it.coverArt(artistId, "artist"));

              expect(result).toBeUndefined();

              expect(axios.get).toHaveBeenCalledWith(`${url}/rest/getArtist`, {
                params: asURLSearchParams({
                  ...authParams,
                  id: artistId,
                }),
                headers,
              });

              expect(axios.get).toHaveBeenCalledWith(
                `${url}/rest/getArtistInfo`,
                {
                  params: asURLSearchParams({
                    ...authParams,
                    id: artistId,
                  }),
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
                  Promise.resolve(ok(getArtistXml(artist)))
                )
                .mockImplementationOnce(() =>
                  Promise.resolve(ok(getArtistInfoXml(artist)))
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
                params: asURLSearchParams({
                  ...authParams,
                  id: artistId,
                }),
                headers,
              });

              expect(axios.get).toHaveBeenCalledWith(
                `${url}/rest/getArtistInfo`,
                {
                  params: asURLSearchParams({
                    ...authParams,
                    id: artistId,
                  }),
                  headers,
                }
              );

              expect(axios.get).toHaveBeenCalledWith(
                `${url}/rest/getCoverArt`,
                {
                  params: asURLSearchParams({
                    ...authParams,
                    id: album1.id,
                    size,
                  }),
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
                  Promise.resolve(ok(getArtistXml(artist)))
                )
                .mockImplementationOnce(() =>
                  Promise.resolve(ok(getArtistInfoXml(artist)))
                )
                .mockImplementationOnce(() => Promise.resolve(streamResponse));

              const result = await navidrome
                .generateToken({ username, password })
                .then((it) => it as AuthSuccess)
                .then((it) => navidrome.login(it.authToken))
                .then((it) => it.coverArt(artistId, "artist"));

              expect(result).toBeUndefined();

              expect(axios.get).toHaveBeenCalledWith(`${url}/rest/getArtist`, {
                params: asURLSearchParams({
                  ...authParams,
                  id: artistId,
                }),
                headers,
              });

              expect(axios.get).toHaveBeenCalledWith(
                `${url}/rest/getArtistInfo`,
                {
                  params: asURLSearchParams({
                    ...authParams,
                    id: artistId,
                  }),
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
    describe("when succeeds", () => {
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
          params: asURLSearchParams({
            ...authParams,
            id,
            submission: true,
          }),
          headers,
        });
      });
    });

    describe("when fails", () => {
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
          params: asURLSearchParams({
            ...authParams,
            id,
            submission: true,
          }),
          headers,
        });
      });
    });
  });

  describe("nowPlaying", () => {
    describe("when succeeds", () => {
      it("should return true", async () => {
        const id = uuid();

        mockGET
          .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
          .mockImplementationOnce(() => Promise.resolve(ok(EMPTY)));

        const result = await navidrome
          .generateToken({ username, password })
          .then((it) => it as AuthSuccess)
          .then((it) => navidrome.login(it.authToken))
          .then((it) => it.nowPlaying(id));

        expect(result).toEqual(true);

        expect(mockGET).toHaveBeenCalledWith(`${url}/rest/scrobble`, {
          params: asURLSearchParams({
            ...authParams,
            id,
            submission: false,
          }),
          headers,
        });
      });
    });

    describe("when fails", () => {
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
          .then((it) => it.nowPlaying(id));

        expect(result).toEqual(false);

        expect(mockGET).toHaveBeenCalledWith(`${url}/rest/scrobble`, {
          params: asURLSearchParams({
            ...authParams,
            id,
            submission: false,
          }),
          headers,
        });
      });
    });
  });

  describe("searchArtists", () => {
    describe("when there is 1 search results", () => {
      it("should return true", async () => {
        const artist1 = anArtist({ name: "foo woo" });

        mockGET
          .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
          .mockImplementationOnce(() =>
            Promise.resolve(ok(searchResult3({ artists: [artist1] })))
          );

        const result = await navidrome
          .generateToken({ username, password })
          .then((it) => it as AuthSuccess)
          .then((it) => navidrome.login(it.authToken))
          .then((it) => it.searchArtists("foo"));

        expect(result).toEqual([artistToArtistSummary(artist1)]);

        expect(mockGET).toHaveBeenCalledWith(`${url}/rest/search3`, {
          params: asURLSearchParams({
            ...authParams,
            artistCount: 20,
            albumCount: 0,
            songCount: 0,
            query: "foo",
          }),
          headers,
        });
      });
    });

    describe("when there are many search results", () => {
      it("should return true", async () => {
        const artist1 = anArtist({ name: "foo woo" });
        const artist2 = anArtist({ name: "foo choo" });

        mockGET
          .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
          .mockImplementationOnce(() =>
            Promise.resolve(ok(searchResult3({ artists: [artist1, artist2] })))
          );

        const result = await navidrome
          .generateToken({ username, password })
          .then((it) => it as AuthSuccess)
          .then((it) => navidrome.login(it.authToken))
          .then((it) => it.searchArtists("foo"));

        expect(result).toEqual([
          artistToArtistSummary(artist1),
          artistToArtistSummary(artist2),
        ]);

        expect(mockGET).toHaveBeenCalledWith(`${url}/rest/search3`, {
          params: asURLSearchParams({
            ...authParams,
            artistCount: 20,
            albumCount: 0,
            songCount: 0,
            query: "foo",
          }),
          headers,
        });
      });
    });

    describe("when there are no search results", () => {
      it("should return []", async () => {
        mockGET
          .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
          .mockImplementationOnce(() =>
            Promise.resolve(ok(searchResult3({ artists: [] })))
          );

        const result = await navidrome
          .generateToken({ username, password })
          .then((it) => it as AuthSuccess)
          .then((it) => navidrome.login(it.authToken))
          .then((it) => it.searchArtists("foo"));

        expect(result).toEqual([]);

        expect(mockGET).toHaveBeenCalledWith(`${url}/rest/search3`, {
          params: asURLSearchParams({
            ...authParams,
            artistCount: 20,
            albumCount: 0,
            songCount: 0,
            query: "foo",
          }),
          headers,
        });
      });
    });
  });

  describe("searchAlbums", () => {
    describe("when there is 1 search results", () => {
      it("should return true", async () => {
        const album = anAlbum({
          name: "foo woo",
          genre: { id: "pop", name: "pop" },
        });
        const artist = anArtist({ name: "#1", albums: [album] });

        mockGET
          .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
          .mockImplementationOnce(() =>
            Promise.resolve(ok(searchResult3({ albums: [{ artist, album }] })))
          );

        const result = await navidrome
          .generateToken({ username, password })
          .then((it) => it as AuthSuccess)
          .then((it) => navidrome.login(it.authToken))
          .then((it) => it.searchAlbums("foo"));

        expect(result).toEqual([albumToAlbumSummary(album)]);

        expect(mockGET).toHaveBeenCalledWith(`${url}/rest/search3`, {
          params: asURLSearchParams({
            ...authParams,
            artistCount: 0,
            albumCount: 20,
            songCount: 0,
            query: "foo",
          }),
          headers,
        });
      });
    });

    describe("when there are many search results", () => {
      it("should return true", async () => {
        const album1 = anAlbum({
          name: "album1",
          genre: { id: "pop", name: "pop" },
        });
        const artist1 = anArtist({ name: "artist1", albums: [album1] });

        const album2 = anAlbum({
          name: "album2",
          genre: { id: "pop", name: "pop" },
        });
        const artist2 = anArtist({ name: "artist2", albums: [album2] });

        mockGET
          .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
          .mockImplementationOnce(() =>
            Promise.resolve(
              ok(
                searchResult3({
                  albums: [
                    { artist: artist1, album: album1 },
                    { artist: artist2, album: album2 },
                  ],
                })
              )
            )
          );

        const result = await navidrome
          .generateToken({ username, password })
          .then((it) => it as AuthSuccess)
          .then((it) => navidrome.login(it.authToken))
          .then((it) => it.searchAlbums("moo"));

        expect(result).toEqual([
          albumToAlbumSummary(album1),
          albumToAlbumSummary(album2),
        ]);

        expect(mockGET).toHaveBeenCalledWith(`${url}/rest/search3`, {
          params: asURLSearchParams({
            ...authParams,
            artistCount: 0,
            albumCount: 20,
            songCount: 0,
            query: "moo",
          }),
          headers,
        });
      });
    });

    describe("when there are no search results", () => {
      it("should return []", async () => {
        mockGET
          .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
          .mockImplementationOnce(() =>
            Promise.resolve(ok(searchResult3({ albums: [] })))
          );

        const result = await navidrome
          .generateToken({ username, password })
          .then((it) => it as AuthSuccess)
          .then((it) => navidrome.login(it.authToken))
          .then((it) => it.searchAlbums("foo"));

        expect(result).toEqual([]);

        expect(mockGET).toHaveBeenCalledWith(`${url}/rest/search3`, {
          params: asURLSearchParams({
            ...authParams,
            artistCount: 0,
            albumCount: 20,
            songCount: 0,
            query: "foo",
          }),
          headers,
        });
      });
    });
  });

  describe("searchSongs", () => {
    describe("when there is 1 search results", () => {
      it("should return true", async () => {
        const pop = asGenre("Pop");

        const album = anAlbum({ id: "album1", name: "Burnin", genre: pop });
        const artist = anArtist({
          id: "artist1",
          name: "Bob Marley",
          albums: [album],
        });
        const track = aTrack({
          artist: artistToArtistSummary(artist),
          album: albumToAlbumSummary(album),
          genre: pop,
        });

        mockGET
          .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
          .mockImplementationOnce(() =>
            Promise.resolve(ok(searchResult3({ tracks: [track] })))
          )
          .mockImplementationOnce(() => Promise.resolve(ok(getSongXml(track))))
          .mockImplementationOnce(() =>
            Promise.resolve(ok(getAlbumXml(artist, album, [])))
          );

        const result = await navidrome
          .generateToken({ username, password })
          .then((it) => it as AuthSuccess)
          .then((it) => navidrome.login(it.authToken))
          .then((it) => it.searchTracks("foo"));

        expect(result).toEqual([track]);

        expect(mockGET).toHaveBeenCalledWith(`${url}/rest/search3`, {
          params: asURLSearchParams({
            ...authParams,
            artistCount: 0,
            albumCount: 0,
            songCount: 20,
            query: "foo",
          }),
          headers,
        });
      });
    });

    describe("when there are many search results", () => {
      it("should return true", async () => {
        const pop = asGenre("Pop");

        const album1 = anAlbum({ id: "album1", name: "Burnin", genre: pop });
        const artist1 = anArtist({
          id: "artist1",
          name: "Bob Marley",
          albums: [album1],
        });
        const track1 = aTrack({
          id: "track1",
          artist: artistToArtistSummary(artist1),
          album: albumToAlbumSummary(album1),
          genre: pop,
        });

        const album2 = anAlbum({ id: "album2", name: "Bobbin", genre: pop });
        const artist2 = anArtist({
          id: "artist2",
          name: "Jane Marley",
          albums: [album2],
        });
        const track2 = aTrack({
          id: "track2",
          artist: artistToArtistSummary(artist2),
          album: albumToAlbumSummary(album2),
          genre: pop,
        });

        mockGET
          .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
          .mockImplementationOnce(() =>
            Promise.resolve(
              ok(
                searchResult3({
                  tracks: [track1, track2],
                })
              )
            )
          )
          .mockImplementationOnce(() => Promise.resolve(ok(getSongXml(track1))))
          .mockImplementationOnce(() => Promise.resolve(ok(getSongXml(track2))))
          .mockImplementationOnce(() =>
            Promise.resolve(ok(getAlbumXml(artist1, album1, [])))
          )
          .mockImplementationOnce(() =>
            Promise.resolve(ok(getAlbumXml(artist2, album2, [])))
          );

        const result = await navidrome
          .generateToken({ username, password })
          .then((it) => it as AuthSuccess)
          .then((it) => navidrome.login(it.authToken))
          .then((it) => it.searchTracks("moo"));

        expect(result).toEqual([track1, track2]);

        expect(mockGET).toHaveBeenCalledWith(`${url}/rest/search3`, {
          params: asURLSearchParams({
            ...authParams,
            artistCount: 0,
            albumCount: 0,
            songCount: 20,
            query: "moo",
          }),
          headers,
        });
      });
    });

    describe("when there are no search results", () => {
      it("should return []", async () => {
        mockGET
          .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
          .mockImplementationOnce(() =>
            Promise.resolve(ok(searchResult3({ tracks: [] })))
          );

        const result = await navidrome
          .generateToken({ username, password })
          .then((it) => it as AuthSuccess)
          .then((it) => navidrome.login(it.authToken))
          .then((it) => it.searchTracks("foo"));

        expect(result).toEqual([]);

        expect(mockGET).toHaveBeenCalledWith(`${url}/rest/search3`, {
          params: asURLSearchParams({
            ...authParams,
            artistCount: 0,
            albumCount: 0,
            songCount: 20,
            query: "foo",
          }),
          headers,
        });
      });
    });
  });

  describe("playlists", () => {
    describe("getting playlists", () => {
      describe("when there is 1 playlist results", () => {
        it("should return it", async () => {
          const playlist = aPlaylistSummary();

          mockGET
            .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getPlayLists([playlist])))
            );

          const result = await navidrome
            .generateToken({ username, password })
            .then((it) => it as AuthSuccess)
            .then((it) => navidrome.login(it.authToken))
            .then((it) => it.playlists());

          expect(result).toEqual([playlist]);

          expect(mockGET).toHaveBeenCalledWith(`${url}/rest/getPlaylists`, {
            params: asURLSearchParams(authParams),
            headers,
          });
        });
      });

      describe("when there are many playlists", () => {
        it("should return them", async () => {
          const playlist1 = aPlaylistSummary();
          const playlist2 = aPlaylistSummary();
          const playlist3 = aPlaylistSummary();
          const playlists = [playlist1, playlist2, playlist3];

          mockGET
            .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getPlayLists(playlists)))
            );

          const result = await navidrome
            .generateToken({ username, password })
            .then((it) => it as AuthSuccess)
            .then((it) => navidrome.login(it.authToken))
            .then((it) => it.playlists());

          expect(result).toEqual(playlists);

          expect(mockGET).toHaveBeenCalledWith(`${url}/rest/getPlaylists`, {
            params: asURLSearchParams(authParams),
            headers,
          });
        });
      });

      describe("when there are no playlists", () => {
        it("should return []", async () => {
          mockGET
            .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getPlayLists([])))
            );

          const result = await navidrome
            .generateToken({ username, password })
            .then((it) => it as AuthSuccess)
            .then((it) => navidrome.login(it.authToken))
            .then((it) => it.playlists());

          expect(result).toEqual([]);

          expect(mockGET).toHaveBeenCalledWith(`${url}/rest/getPlaylists`, {
            params: asURLSearchParams(authParams),
            headers,
          });
        });
      });
    });

    describe("getting a single playlist", () => {
      describe("when there is no playlist with the id", () => {
        it("should raise error", async () => {
          const id = "id404";

          mockGET
            .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
            .mockImplementationOnce(() =>
              Promise.resolve(ok(error("70", "not there")))
            );

          return expect(
            navidrome
              .generateToken({ username, password })
              .then((it) => it as AuthSuccess)
              .then((it) => navidrome.login(it.authToken))
              .then((it) => it.playlist(id))
          ).rejects.toEqual("not there");
        });
      });

      describe("when there is a playlist with the id", () => {
        describe("and it has tracks", () => {
          it("should return the playlist with entries", async () => {
            const id = uuid();
            const name = "Great Playlist";
            const track1 = aTrack({
              genre: { id: "pop", name: "pop" },
              number: 66,
            });
            const track2 = aTrack({
              genre: { id: "rock", name: "rock" },
              number: 77,
            });

            mockGET
              .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
              .mockImplementationOnce(() =>
                Promise.resolve(
                  ok(
                    getPlayList({
                      id,
                      name,
                      entries: [track1, track2],
                    })
                  )
                )
              );

            const result = await navidrome
              .generateToken({ username, password })
              .then((it) => it as AuthSuccess)
              .then((it) => navidrome.login(it.authToken))
              .then((it) => it.playlist(id));

            expect(result).toEqual({
              id,
              name,
              entries: [
                { ...track1, number: 1 },
                { ...track2, number: 2 },
              ],
            });

            expect(mockGET).toHaveBeenCalledWith(`${url}/rest/getPlaylist`, {
              params: asURLSearchParams({
                ...authParams,
                id,
              }),
              headers,
            });
          });
        });

        describe("and it has no tracks", () => {
          it("should return the playlist with empty entries", async () => {
            const playlist = aPlaylist({
              entries: [],
            });

            mockGET
              .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
              .mockImplementationOnce(() =>
                Promise.resolve(ok(getPlayList(playlist)))
              );

            const result = await navidrome
              .generateToken({ username, password })
              .then((it) => it as AuthSuccess)
              .then((it) => navidrome.login(it.authToken))
              .then((it) => it.playlist(playlist.id));

            expect(result).toEqual(playlist);

            expect(mockGET).toHaveBeenCalledWith(`${url}/rest/getPlaylist`, {
              params: asURLSearchParams({
                ...authParams,
                id: playlist.id,
              }),
              headers,
            });
          });
        });
      });
    });

    describe("creating a playlist", () => {
      it("should create a playlist with the given name", async () => {
        const name = "ThePlaylist";
        const id = uuid();

        mockGET
            .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
            .mockImplementationOnce(() =>
              Promise.resolve(ok(createPlayList({id, name})))
            );

          const result = await navidrome
            .generateToken({ username, password })
            .then((it) => it as AuthSuccess)
            .then((it) => navidrome.login(it.authToken))
            .then((it) => it.createPlaylist(name));

          expect(result).toEqual({ id, name });

          expect(mockGET).toHaveBeenCalledWith(`${url}/rest/createPlaylist`, {
            params: asURLSearchParams({
              ...authParams,
              name, 
            }),
            headers,
          });
      });
    });

    describe("deleting a playlist", () => {
      it("should delete the playlist by id", async () => {
        const id = "id-to-delete";

        mockGET
            .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
            .mockImplementationOnce(() =>
              Promise.resolve(ok(EMPTY))
            );

          const result = await navidrome
            .generateToken({ username, password })
            .then((it) => it as AuthSuccess)
            .then((it) => navidrome.login(it.authToken))
            .then((it) => it.deletePlaylist(id));

          expect(result).toEqual(true);

          expect(mockGET).toHaveBeenCalledWith(`${url}/rest/deletePlaylist`, {
            params: asURLSearchParams({
              ...authParams,
              id, 
            }),
            headers,
          });
      });
    });

    describe("editing playlists", () => {
      describe("adding a track to a playlist", () => {
        it("should add it", async () => {
          const playlistId = uuid();
          const trackId = uuid();

          mockGET
            .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
            .mockImplementationOnce(() =>
              Promise.resolve(ok(EMPTY))
            );

          const result = await navidrome
            .generateToken({ username, password })
            .then((it) => it as AuthSuccess)
            .then((it) => navidrome.login(it.authToken))
            .then((it) => it.addToPlaylist(playlistId, trackId));

          expect(result).toEqual(true);

          expect(mockGET).toHaveBeenCalledWith(`${url}/rest/updatePlaylist`, {
            params: asURLSearchParams({
              ...authParams,
              playlistId,
              songIdToAdd: trackId, 
            }),
            headers,
          });
        });
      });

      describe("removing a track from a playlist", () => {
        it("should remove it", async () => {
          const playlistId = uuid();
          const indicies =[6, 100, 33];

          mockGET
            .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
            .mockImplementationOnce(() =>
              Promise.resolve(ok(EMPTY))
            );

          const result = await navidrome
            .generateToken({ username, password })
            .then((it) => it as AuthSuccess)
            .then((it) => navidrome.login(it.authToken))
            .then((it) => it.removeFromPlaylist(playlistId, indicies));

          expect(result).toEqual(true);

          expect(mockGET).toHaveBeenCalledWith(`${url}/rest/updatePlaylist`, {
            params: asURLSearchParams({
              ...authParams,
              playlistId,
              songIndexToRemove: indicies, 
            }),
            headers,
          });
        });
      });
    });    
  });
});
