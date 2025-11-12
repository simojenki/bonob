import { v4 as uuid } from "uuid";
import { pipe } from "fp-ts/lib/function";
import { option as O, taskEither as TE, task as T, either as E } from "fp-ts";

import axios from "axios";
jest.mock("axios");

import randomstring from "randomstring";
jest.mock("randomstring");

import {
  Subsonic,
  t,
  asGenre,
  asURLSearchParams,
  parseToken,
  asToken,
  CustomPlayers,
  PingResponse,
  images,
  artistImageURN
} from "../src/subsonic";

import {
  SubsonicMusicService,
  SubsonicMusicLibrary,
} from "../src/subsonic_music_library";

import {
  Album,
  Artist,
  albumToAlbumSummary,
  asArtistAlbumPairs,
  Track,
  artistToArtistSummary,
  AlbumQuery,
  PlaylistSummary,
  Playlist,
  SimilarArtist,
  Credentials,
  AuthFailure,
  RadioStation,
  AlbumSummary,
  trackToTrackSummary,
} from "../src/music_library";
import {
  aGenre,
  anAlbum,
  anArtist,
  aPlaylist,
  aPlaylistSummary,
  aTrack,
  POP,
  ROCK,
  aRadioStation,
  anAlbumSummary,
  anArtistSummary,
} from "./builders";
import { b64Encode } from "../src/b64";
import { BUrn } from "../src/burn";
import { URLBuilder } from "../src/url_builder";

import { getAlbumJson } from "./subsonic.test";

const EMPTY = {
  "subsonic-response": {
    status: "ok",
    version: "1.16.1",
    type: "subsonic",
    serverVersion: "0.45.1 (c55e6590)",
  },
};

const FAILURE = {
  "subsonic-response": {
    status: "failed",
    version: "1.16.1",
    type: "subsonic",
    serverVersion: "0.45.1 (c55e6590)",
    error: { code: 10, message: 'Missing required parameter "v"' },
  },
};

const ok = (data: string | object) => ({
  status: 200,
  data,
});

const pingJson = (pingResponse: Partial<PingResponse> = {}) => ({
  "subsonic-response": {
    status: "ok",
    version: "1.16.1",
    type: "subsonic",
    serverVersion: "0.45.1 (c55e6590)",
    ...pingResponse,
  },
});

const PING_OK = pingJson({ status: "ok" });

const error = (code: string, message: string) => ({
  "subsonic-response": {
    status: "failed",
    version: "1.16.1",
    type: "subsonic",
    serverVersion: "0.45.1 (c55e6590)",
    error: { code, message },
  },
});


const maybeIdFromCoverArtUrn = (coverArt: BUrn | undefined) =>
  pipe(
    coverArt,
    O.fromNullable,
    O.map((it) => it.resource.split(":")[1]),
    O.getOrElseW(() => "")
  );



const getSongJson = (track: Track) => subsonicOK({ song: asSongJson(track) });

export const getArtistJson = (
  artist: Artist,
  extras: ArtistExtras = { artistImageUrl: undefined }
) =>
  subsonicOK({
    artist: {
      id: artist.id,
      name: artist.name,
      coverArt: "art-123",
      albumCount: artist.albums.length,
      artistImageUrl: extras.artistImageUrl,
      starred: "sometime",
      album: artist.albums.map((album) => ({
        id: album.id,
        parent: artist.id,
        album: album.name,
        title: album.name,
        name: album.name,
        isDir: "true",
        coverArt: maybeIdFromCoverArtUrn(album.coverArt),
        songCount: 19,
        created: "2021-01-07T08:19:55.834207205Z",
        duration: 123,
        playCount: 4,
        artistId: artist.id,
        artist: artist.name,
        year: album.year,
        genre: album.genre?.name,
        userRating: 5,
        averageRating: 3,
        starred: "2021-01-07T08:19:55.834207205Z",
      }))
    },
  });

const getRadioStationsJson = (radioStations: RadioStation[]) =>
  subsonicOK({
    internetRadioStations: {
      internetRadioStation: radioStations.map((it) => ({
        id: it.id,
        name: it.name,
        streamUrl: it.url,
        homePageUrl: it.homePage,
      })),
    },
  });

const subsonicOK = (body: any = {}) => ({
  "subsonic-response": {
    status: "ok",
    version: "1.16.1",
    type: "subsonic",
    serverVersion: "0.45.1 (c55e6590)",
    ...body,
  },
});

const getSimilarSongsJson = (tracks: Track[]) =>
  subsonicOK({ similarSongs2: { song: tracks.map(asSongJson) } });

const getTopSongsJson = (tracks: Track[]) =>
  subsonicOK({ topSongs: { song: tracks.map(asSongJson) } });

const asPlaylistJson = (playlist: PlaylistSummary) => ({
  id: playlist.id,
  name: playlist.name,
  songCount: 1,
  duration: 190,
  public: true,
  owner: "bob",
  created: "2021-05-06T02:07:24.308007023Z",
  changed: "2021-05-06T02:08:06Z",
});

export type ArtistWithAlbum = {
  artist: Artist;
  album: Album;
};

type ArtistExtras = { artistImageUrl: string | undefined };

const asSongJson = (track: Track) => ({
  id: track.id,
  parent: track.album.id,
  title: track.name,
  album: track.album.name,
  artist: track.artist.name,
  track: track.number,
  genre: track.genre?.name,
  isDir: "false",
  coverArt: maybeIdFromCoverArtUrn(track.coverArt),
  created: "2004-11-08T23:36:11",
  duration: track.duration,
  bitRate: 128,
  size: "5624132",
  suffix: "mp3",
  contentType: track.encoding.mimeType,
  transcodedContentType: undefined,
  isVideo: "false",
  path: "ACDC/High voltage/ACDC - The Jack.mp3",
  albumId: track.album.id,
  artistId: track.artist.id,
  type: "music",
  starred: track.rating.love ? "sometime" : undefined,
  userRating: track.rating.stars,
  year: "",
});

export const getArtistInfoJson = (
  artist: Artist,
  images: images = {
    smallImageUrl: undefined,
    mediumImageUrl: undefined,
    largeImageUrl: undefined,
  }
) =>
  subsonicOK({
    artistInfo2: {
      ...images,
      similarArtist: artist.similarArtists.map(asSimilarArtistJson),
    },
  });

const asSimilarArtistJson = (similarArtist: SimilarArtist) => {
  if (similarArtist.inLibrary)
    return {
      id: similarArtist.id,
      name: similarArtist.name,
      albumCount: 3,
    };
  else
    return {
      id: -1,
      name: similarArtist.name,
      albumCount: 3,
    };
};

const getPlayListsJson = (playlists: PlaylistSummary[]) =>
  subsonicOK({
    playlists: {
      playlist: playlists.map(asPlaylistJson),
    },
  });

const createPlayListJson = (playlist: PlaylistSummary) =>
  subsonicOK({
    playlist: asPlaylistJson(playlist),
  });


const getAlbumListJson = (albums: [Artist, AlbumSummary][]) =>
  subsonicOK({
    albumList2: {
      album: albums.map(([artist, album]) => ({
        id: album.id,
        name: album.name,
        coverArt: maybeIdFromCoverArtUrn(album.coverArt),
        songCount: "19",
        created: "2021-01-07T08:19:55.834207205Z",
        duration: "123",
        artist: artist.name,
        artistId: artist.id,
        year: album.year,
        genre: album.genre?.name
      })),
    },
  });

const getPlayListJson = (playlist: Playlist) =>
  subsonicOK({
    playlist: {
      id: playlist.id,
      name: playlist.name,
      songCount: playlist.entries.length,
      duration: 627,
      public: true,
      owner: "bob",
      created: "2021-05-06T02:07:30.460465988Z",
      changed: "2021-05-06T02:40:04Z",
      entry: playlist.entries.map((it) => ({
        id: it.id,
        parent: "...",
        isDir: false,
        title: it.name,
        album: it.album.name,
        artist: it.artist.name,
        track: it.number,
        year: it.album.year,
        genre: it.album.genre?.name,
        coverArt: maybeIdFromCoverArtUrn(it.coverArt),
        size: 123,
        contentType: it.encoding.mimeType,
        suffix: "mp3",
        duration: it.duration,
        bitRate: 128,
        path: "...",
        discNumber: 1,
        created: "2019-09-04T04:07:00.138169924Z",
        albumId: it.album.id,
        artistId: it.artist.id,
        type: "music",
        isVideo: false,
        starred: it.rating.love ? "sometime" : undefined,
        userRating: it.rating.stars,
      })),
    },
  });

const getSearchResult3Json = ({
  artists,
  albums,
  tracks,
}: Partial<{
  artists: Artist[];
  albums: ArtistWithAlbum[];
  tracks: Track[];
}>) =>
  subsonicOK({
    searchResult3: {
      artist: (artists || []).map((it) => ({
        id: it.id,
        name: it.name,
        // coverArt??
        albumCount: it.albums.length,
        userRating: -1,
        //artistImageUrl?
      })),
      album: (albums || []).map(({ artist, album }) => ({
        id: album.id,
        name: album.name,
        artist: artist.name,
        year: album.year,
        coverArt: maybeIdFromCoverArtUrn(album.coverArt),
        //starred
        //duration
        //playCount
        //played
        //created
        artistId: artist.id,
        //userRating
        songCount: album.tracks.length
      })),
      song: (tracks || []).map((track) => ({
        id: track.id,
        parent: track.album.id,
        isDir: "false",
        title: track.name,
        album: track.album.name,
        artist: track.artist.name,
        track: track.number,
        year: "",
        coverArt: maybeIdFromCoverArtUrn(track.coverArt),
        size: "5624132",
        contentType: track.encoding.mimeType,
        suffix: "mp3",
        starred: track.rating.love ? "sometime" : undefined,
        duration: track.duration,
        bitRate: 128,
        //bitDepth
        //samplingRate
        //channelCount
        path: "ACDC/High voltage/ACDC - The Jack.mp3",
        //path
        //playCount
        //played
        //discNumber
        created: "2004-11-08T23:36:11",
        albumId: track.album.id,
        artistId: track.artist.id,
        type: "music",
        isVideo: "false",
      })),
    },
  });

export const asArtistsJson = (artists: Artist[]) => {
  const as: Artist[] = [];
  const bs: Artist[] = [];
  const cs: Artist[] = [];
  const rest: Artist[] = [];
  artists.forEach((it) => {
    const firstChar = it.name.toLowerCase()[0];
    switch (firstChar) {
      case "a":
        as.push(it);
        break;
      case "b":
        bs.push(it);
        break;
      case "c":
        cs.push(it);
        break;
      default:
        rest.push(it);
        break;
    }
  });

  const asArtistSummary = (artist: Artist) => ({
    id: artist.id,
    name: artist.name,
    albumCount: artist.albums.length,
  });

  return subsonicOK({
    artists: {
      index: [
        {
          name: "A",
          artist: as.map(asArtistSummary),
        },
        {
          name: "B",
          artist: bs.map(asArtistSummary),
        },
        {
          name: "C",
          artist: cs.map(asArtistSummary),
        },
        {
          name: "D-Z",
          artist: rest.map(asArtistSummary),
        },
      ],
    },
  });
};

describe("SubsonicMusicService", () => {
  const url = new URLBuilder("http://127.0.0.22:4567/some-context-path");
  const username = `user1-${uuid()}`;
  const password = `pass1-${uuid()}`;
  const salt = "saltysalty";

  const customPlayers = {
    encodingFor: jest.fn(),
  };

  const subsonic = new SubsonicMusicService(
    new Subsonic(url, customPlayers),
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

  const tokenFor = (credentials: Credentials) =>
    pipe(
      subsonic.generateToken(credentials),
      TE.fold((e) => {
        throw e;
      }, T.of)
    );

  describe("generateToken", () => {
    describe("when the credentials are valid", () => {
      describe("when the backend is generic subsonic", () => {
        it("should be able to generate a token and then login using it", async () => {
          (axios.get as jest.Mock).mockResolvedValue(ok(PING_OK));

          const token = await tokenFor({
            username,
            password,
          })();

          expect(token.serviceToken).toBeDefined();
          expect(token.nickname).toEqual(username);
          expect(token.userId).toEqual(username);

          expect(parseToken(token.serviceToken)).toEqual({
            username,
            password,
            type: PING_OK["subsonic-response"].type,
          });

          expect(axios.get).toHaveBeenCalledWith(
            url.append({ pathname: "/rest/ping.view" }).href(),
            {
              params: asURLSearchParams(authParamsPlusJson),
              headers,
            }
          );
        });

        it("should store the type of the subsonic server on the token", async () => {
          const type = "someSubsonicClone";
          (axios.get as jest.Mock).mockResolvedValue(ok(pingJson({ type })));

          const token = await tokenFor({
            username,
            password,
          })();

          expect(token.serviceToken).toBeDefined();
          expect(token.nickname).toEqual(username);
          expect(token.userId).toEqual(username);

          expect(parseToken(token.serviceToken)).toEqual({
            username,
            password,
            type,
          });

          expect(axios.get).toHaveBeenCalledWith(
            url.append({ pathname: "/rest/ping.view" }).href(),
            {
              params: asURLSearchParams(authParamsPlusJson),
              headers,
            }
          );
        });
      });

      describe("when the backend is navidrome", () => {
        it("should login to nd and get the nd bearer token", async () => {
          const navidromeToken = `nd-${uuid()}`;

          (axios.get as jest.Mock).mockResolvedValue(
            ok(pingJson({ type: "navidrome" }))
          );
          (axios.post as jest.Mock).mockResolvedValue(
            ok({ token: navidromeToken })
          );

          const token = await tokenFor({
            username,
            password,
          })();

          expect(token.serviceToken).toBeDefined();
          expect(token.nickname).toEqual(username);
          expect(token.userId).toEqual(username);

          expect(parseToken(token.serviceToken)).toEqual({
            username,
            password,
            type: "navidrome",
            bearer: navidromeToken,
          });

          expect(axios.get).toHaveBeenCalledWith(
            url.append({ pathname: "/rest/ping.view" }).href(),
            {
              params: asURLSearchParams(authParamsPlusJson),
              headers,
            }
          );
          expect(axios.post).toHaveBeenCalledWith(
            url.append({ pathname: "/auth/login" }).href(),
            {
              username,
              password,
            }
          );
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
        expect(token).toEqual(
          E.left(new AuthFailure("Subsonic error:Wrong username or password"))
        );
      });
    });
  });

  describe("refreshToken", () => {
    describe("when the credentials are valid", () => {
      describe("when the backend is generic subsonic", () => {
        it("should be able to generate a token and then login using it", async () => {
          const type = `subsonic-clone-${uuid()}`;
          (axios.get as jest.Mock).mockResolvedValue(ok(pingJson({ type })));

          const credentials = {
            username,
            password,
            type: "foo",
            bearer: undefined,
          };
          const originalToken = asToken(credentials);

          const refreshedToken = await pipe(
            subsonic.refreshToken(originalToken),
            TE.fold((e) => {
              throw e;
            }, T.of)
          )();

          expect(refreshedToken.serviceToken).toBeDefined();
          expect(refreshedToken.nickname).toEqual(credentials.username);
          expect(refreshedToken.userId).toEqual(credentials.username);

          expect(parseToken(refreshedToken.serviceToken)).toEqual({
            username,
            password,
            type,
          });

          expect(axios.get).toHaveBeenCalledWith(
            url.append({ pathname: "/rest/ping.view" }).href(),
            {
              params: asURLSearchParams(authParamsPlusJson),
              headers,
            }
          );
        });
      });

      describe("when the backend is navidrome", () => {
        it("should login to nd and get the nd bearer token", async () => {
          const navidromeToken = `nd-${uuid()}`;

          (axios.get as jest.Mock).mockResolvedValue(
            ok(pingJson({ type: "navidrome" }))
          );
          (axios.post as jest.Mock).mockResolvedValue(
            ok({ token: navidromeToken })
          );

          const credentials = {
            username,
            password,
            type: "navidrome",
            bearer: undefined,
          };
          const originalToken = asToken(credentials);

          const refreshedToken = await pipe(
            subsonic.refreshToken(originalToken),
            TE.fold((e) => {
              throw e;
            }, T.of)
          )();

          expect(refreshedToken.serviceToken).toBeDefined();
          expect(refreshedToken.nickname).toEqual(username);
          expect(refreshedToken.userId).toEqual(username);

          expect(parseToken(refreshedToken.serviceToken)).toEqual({
            username,
            password,
            type: "navidrome",
            bearer: navidromeToken,
          });

          expect(axios.get).toHaveBeenCalledWith(
            url.append({ pathname: "/rest/ping.view" }).href(),
            {
              params: asURLSearchParams(authParamsPlusJson),
              headers,
            }
          );
          expect(axios.post).toHaveBeenCalledWith(
            url.append({ pathname: "/auth/login" }).href(),
            {
              username,
              password,
            }
          );
        });
      });
    });

    describe("when the credentials are not valid", () => {
      it("should be able to generate a token and then login using it", async () => {
        (axios.get as jest.Mock).mockResolvedValue({
          status: 200,
          data: error("40", "Wrong username or password"),
        });

        const credentials = {
          username,
          password,
          type: "foo",
          bearer: undefined,
        };
        const originalToken = asToken(credentials);

        const token = await subsonic.refreshToken(originalToken)();
        expect(token).toEqual(
          E.left(new AuthFailure("Subsonic error:Wrong username or password"))
        );
      });
    });
  });

  describe("login", () => {
    describe("when the token is for generic subsonic", () => {
      it("should return a subsonic client", async () => {
        const client = await subsonic.login(
          asToken({
            username: "foo",
            password: "bar",
            type: "subsonic",
            bearer: undefined,
          })
        );
        expect(client.flavour()).toEqual("subsonic");
      });
    });

    describe("when the token is for navidrome", () => {
      it("should return a navidrome client", async () => {
        const client = await subsonic.login(
          asToken({
            username: "foo",
            password: "bar",
            type: "navidrome",
            bearer: undefined,
          })
        );
        expect(client.flavour()).toEqual("navidrome");
      });
    });

    describe("when the token is for gonic", () => {
      it("should return a subsonic client", async () => {
        const client = await subsonic.login(
          asToken({
            username: "foo",
            password: "bar",
            type: "gonic",
            bearer: undefined,
          })
        );
        expect(client.flavour()).toEqual("subsonic");
      });
    });
  });

  describe("bearerToken", () => {
    describe("when flavour is generic subsonic", () => {
      it("should return undefined", async () => {
        const credentials = { username: "foo", password: "bar" };
        const token = { ...credentials, type: "subsonic", bearer: undefined };
        const client = await subsonic.login(asToken(token));

        const bearerToken = await pipe(client.bearerToken(credentials))();
        expect(bearerToken).toStrictEqual(E.right(undefined));
      });
    });

    describe("when flavour is navidrome", () => {
      it("should get a bearerToken from navidrome", async () => {
        const credentials = { username: "foo", password: "bar" };
        const token = { ...credentials, type: "navidrome", bearer: undefined };
        const client = await subsonic.login(asToken(token));

        mockPOST.mockImplementationOnce(() =>
          Promise.resolve(ok({ token: "theBearerToken" }))
        );

        const bearerToken = await pipe(client.bearerToken(credentials))();
        expect(bearerToken).toStrictEqual(E.right("theBearerToken"));

        expect(axios.post).toHaveBeenCalledWith(
          url.append({ pathname: "/auth/login" }).href(),
          credentials
        );
      });
    });
  });
});

describe("SubsonicMusicLibrary_new", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetAllMocks();
  });

  const credentials = { username: `user-${uuid()}`, password: `pw-${uuid()}` }

  const customPlayers = {}

  const subsonic = {
    getArtist: jest.fn(),
    getArtistInfo: jest.fn(),
    getArtists: jest.fn()
  };

  const library = new SubsonicMusicLibrary(
    subsonic as unknown as Subsonic,
    credentials,
    customPlayers as unknown as CustomPlayers
  );

  describe("getting an artist", () => {
    const id = `artist-${uuid()}`;
    const name = `artistName-${uuid()}`;

    // todo: what happens when the artist is missing?
    describe("when the artist exists", () => {
      describe("when the artist has albums, similar artists and a valid artistImageUrl" , () => {
        const artistImageUrl = "http://someImage";
        const albums = [
          anAlbumSummary(),
          anAlbumSummary(),
        ];
        const similarArtist = [
          { ...anArtistSummary(), isInLibrary: true },
          { ...anArtistSummary(), isInLibrary: true },
          { ...anArtistSummary(), isInLibrary: true },
        ];

        beforeEach(() => {
          subsonic.getArtist.mockResolvedValue({ id, name, artistImageUrl, albums });
          subsonic.getArtistInfo.mockResolvedValue({ similarArtist, images: { s: "s", m: "m", l: "l" }});
        });

        it("should fetch the artist and artistInfo and merge", async () => {
          const result = await library.artist(id)
  
          expect(result).toEqual({
            id,
            name,
            image: artistImageURN({ artistImageURL: artistImageUrl }),
            albums,
            similarArtists: similarArtist
          });
  
          expect(subsonic.getArtist).toHaveBeenCalledWith(credentials, id);
          expect(subsonic.getArtistInfo).toHaveBeenCalledWith(credentials, id);
        });  
      });

      describe("when the artist has no valid artistImageUrl, or valid images in artistInfo" , () => {
        it("should use the artistId for the image", async () => {
          subsonic.getArtist.mockResolvedValue({ id, name, artistImageUrl: undefined, albums: [] });
          subsonic.getArtistInfo.mockResolvedValue({ similarArtist: [], images: { s: undefined, m: undefined, l: undefined }});
  
          const result = await library.artist(id)
  
          expect(result.image).toEqual(artistImageURN({ artistId: id }));
        });  
      });

      describe("when the artist has a valid image.s value" , () => {
        it("should use the artistId for the image", async () => {
          subsonic.getArtist.mockResolvedValue({ id, name, artistImageUrl: undefined, albums: [] });
          subsonic.getArtistInfo.mockResolvedValue({ similarArtist: [], images: { s: "http://smallimage", m: undefined, l: undefined }});
  
          const result = await library.artist(id)
  
          expect(result.image).toEqual(artistImageURN({ artistImageURL: "http://smallimage" }));
        });  
      });

      describe("when the artist has a valid image.m value" , () => {
        it("should use the artistId for the image", async () => {
          subsonic.getArtist.mockResolvedValue({ id, name, artistImageUrl: undefined, albums: [] });
          subsonic.getArtistInfo.mockResolvedValue({ similarArtist: [], images: { s: "http://smallimage", m: "http://mediumimage", l: undefined }});
  
          const result = await library.artist(id)
  
          expect(result.image).toEqual(artistImageURN({ artistImageURL: "http://mediumimage" }));
        });  
      });

      describe("when the artist has a valid image.l value" , () => {
        it("should use the artistId for the image", async () => {
          subsonic.getArtist.mockResolvedValue({ id, name, artistImageUrl: undefined, albums: [] });
          subsonic.getArtistInfo.mockResolvedValue({ similarArtist: [], images: { s: "http://smallimage", m: "http://mediumimage", l: "http://largeimage" }});
  
          const result = await library.artist(id)
  
          expect(result.image).toEqual(artistImageURN({ artistImageURL: "http://largeimage" }));
        });  
      });
    });
  });

  describe("getting artists", () => {
    describe("when there are no artists", () => {
      beforeEach(() => {
        subsonic.getArtists.mockResolvedValue([])
      });

      it("should return empty", async () => {
        const result = await library.artists({ _index: 0, _count: 100 });

        expect(result).toEqual({
          results: [],
          total: 0,
        });

        expect(subsonic.getArtists).toHaveBeenCalledWith(credentials)
      });
    });

    describe("when there is one artist", () => {
      const artist = { id: "1", name: "bob1", albumCount: 1, image: undefined }

      describe("when it all fits on one page", () => {
        beforeEach(() => {
          subsonic.getArtists.mockResolvedValue([artist])
        });

        it("should return the single artist", async () => {
          const result = await library.artists({ _index: 0, _count: 100 });

          expect(result).toEqual({
            results: [artist],
            total: 1,
          });
        });
      });
    });

    describe("when there are artists", () => {
      const artist1 = { id: "1", name: "bob1", albumCount: 1, image: undefined }
      const artist2 = { id: "2", name: "bob2", albumCount: 2, image: undefined }
      const artist3 = { id: "3", name: "bob3", albumCount: 3, image: undefined }
      const artist4 = { id: "4", name: "bob4", albumCount: 4, image: undefined }
      const artists = [artist1, artist2, artist3, artist4];

      beforeEach(() => {
        subsonic.getArtists.mockResolvedValue(artists)
      });

      describe("when no paging is in effect", () => {
        it("should return all the artists", async () => {
          const result = await library.artists({ _index: 0, _count: 100 });

          expect(result).toEqual({
            results: artists,
            total: 4,
          });
        });
      });

      describe("when paging specified", () => {
        it("should return only the correct page of artists", async () => {
          const artists = await library.artists({ _index: 1, _count: 2 });

          expect(artists).toEqual({ 
            results: [artist2, artist3], 
            total: 4 
          });
        });
      });
    });
  });
});

describe("SubsonicMusicLibrary", () => {
  const url = new URLBuilder("http://127.0.0.22:4567/some-context-path");
  const username = `user1-${uuid()}`;
  const password = `pass1-${uuid()}`;
  const salt = "saltysalty";

  const customPlayers = {
    encodingFor: jest.fn(),
  };

  const subsonic = new SubsonicMusicLibrary(
    // todo: this should be a mock...
    new Subsonic(url, customPlayers),
    { username, password },
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


  describe("getting albums", () => {
    describe("filtering", () => {
      const album1 = anAlbum({ id: "album1", genre: asGenre("Pop") });
      const album2 = anAlbum({ id: "album2", genre: asGenre("Rock") });
      const album3 = anAlbum({ id: "album3", genre: asGenre("Pop") });
      const album4 = anAlbum({ id: "album4", genre: asGenre("Pop") });
      const album5 = anAlbum({ id: "album5", genre: asGenre("Pop") });

      const artist = anArtist({
        albums: [album1, album2, album3, album4, album5],
      });

      describe("by genre", () => {
        beforeEach(() => {
          mockGET
            .mockImplementationOnce(() =>
              Promise.resolve(ok(asArtistsJson([artist])))
            )
            .mockImplementationOnce(() =>
              Promise.resolve(
                ok(
                  getAlbumListJson([
                    [artist, album1],
                    // album2 is not Pop
                    [artist, album3],
                  ])
                )
              )
            );
        });

        it("should map the 64 encoded genre back into the subsonic genre", async () => {
          const q: AlbumQuery = {
            _index: 0,
            _count: 100,
            genre: b64Encode("Pop"),
            type: "byGenre",
          };
          const result = await subsonic.albums(q);

          expect(result).toEqual({
            results: [album1, album3].map(albumToAlbumSummary),
            total: 2,
          });

          expect(axios.get).toHaveBeenCalledWith(
            url.append({ pathname: "/rest/getArtists" }).href(),
            {
              params: asURLSearchParams(authParamsPlusJson),
              headers,
            }
          );

          expect(axios.get).toHaveBeenCalledWith(
            url.append({ pathname: "/rest/getAlbumList2" }).href(),
            {
              params: asURLSearchParams({
                ...authParamsPlusJson,
                type: "byGenre",
                genre: "Pop",
                size: 500,
                offset: 0,
              }),
              headers,
            }
          );
        });
      });

      describe("by newest", () => {
        beforeEach(() => {
          mockGET
            .mockImplementationOnce(() =>
              Promise.resolve(ok(asArtistsJson([artist])))
            )
            .mockImplementationOnce(() =>
              Promise.resolve(
                ok(
                  getAlbumListJson([
                    [artist, album3],
                    [artist, album2],
                    [artist, album1],
                  ])
                )
              )
            );
        });

        it("should pass the filter to navidrome", async () => {
          const q: AlbumQuery = {
            _index: 0,
            _count: 100,
            type: "recentlyAdded",
          };
          const result = await subsonic.albums(q);

          expect(result).toEqual({
            results: [album3, album2, album1].map(albumToAlbumSummary),
            total: 3,
          });

          expect(axios.get).toHaveBeenCalledWith(
            url.append({ pathname: "/rest/getArtists" }).href(),
            {
              params: asURLSearchParams(authParamsPlusJson),
              headers,
            }
          );

          expect(axios.get).toHaveBeenCalledWith(
            url.append({ pathname: "/rest/getAlbumList2" }).href(),
            {
              params: asURLSearchParams({
                ...authParamsPlusJson,
                type: "newest",
                size: 500,
                offset: 0,
              }),
              headers,
            }
          );
        });
      });

      describe("by recently played", () => {
        beforeEach(() => {
          mockGET
            .mockImplementationOnce(() =>
              Promise.resolve(ok(asArtistsJson([artist])))
            )
            .mockImplementationOnce(() =>
              Promise.resolve(
                ok(
                  getAlbumListJson([
                    [artist, album3],
                    [artist, album2],
                    // album1 never played
                  ])
                )
              )
            );
        });

        it("should pass the filter to navidrome", async () => {
          const q: AlbumQuery = {
            _index: 0,
            _count: 100,
            type: "recentlyPlayed",
          };
          const result = await subsonic.albums(q);

          expect(result).toEqual({
            results: [album3, album2].map(albumToAlbumSummary),
            total: 2,
          });

          expect(axios.get).toHaveBeenCalledWith(
            url.append({ pathname: "/rest/getArtists" }).href(),
            {
              params: asURLSearchParams(authParamsPlusJson),
              headers,
            }
          );

          expect(axios.get).toHaveBeenCalledWith(
            url.append({ pathname: "/rest/getAlbumList2" }).href(),
            {
              params: asURLSearchParams({
                ...authParamsPlusJson,
                type: "recent",
                size: 500,
                offset: 0,
              }),
              headers,
            }
          );
        });
      });

      describe("by frequently played", () => {
        beforeEach(() => {
          mockGET
            .mockImplementationOnce(() =>
              Promise.resolve(ok(asArtistsJson([artist])))
            )
            .mockImplementationOnce(
              () =>
                // album1 never played
                Promise.resolve(ok(getAlbumListJson([[artist, album2]])))
              // album3 never played
            );
        });

        it("should pass the filter to navidrome", async () => {
          const q: AlbumQuery = { _index: 0, _count: 100, type: "mostPlayed" };
          const result = await subsonic.albums(q);

          expect(result).toEqual({
            results: [album2].map(albumToAlbumSummary),
            total: 1,
          });

          expect(axios.get).toHaveBeenCalledWith(
            url.append({ pathname: "/rest/getArtists" }).href(),
            {
              params: asURLSearchParams(authParamsPlusJson),
              headers,
            }
          );

          expect(axios.get).toHaveBeenCalledWith(
            url.append({ pathname: "/rest/getAlbumList2" }).href(),
            {
              params: asURLSearchParams({
                ...authParamsPlusJson,
                type: "frequent",
                size: 500,
                offset: 0,
              }),
              headers,
            }
          );
        });
      });

      describe("by starred", () => {
        beforeEach(() => {
          mockGET
            .mockImplementationOnce(() =>
              Promise.resolve(ok(asArtistsJson([artist])))
            )
            .mockImplementationOnce(
              () =>
                // album1 never played
                Promise.resolve(ok(getAlbumListJson([[artist, album2]])))
              // album3 never played
            );
        });

        it("should pass the filter to navidrome", async () => {
          const q: AlbumQuery = { _index: 0, _count: 100, type: "starred" };
          const result = await subsonic.albums(q);

          expect(result).toEqual({
            results: [album2].map(albumToAlbumSummary),
            total: 1,
          });

          expect(axios.get).toHaveBeenCalledWith(
            url.append({ pathname: "/rest/getArtists" }).href(),
            {
              params: asURLSearchParams(authParamsPlusJson),
              headers,
            }
          );

          expect(axios.get).toHaveBeenCalledWith(
            url.append({ pathname: "/rest/getAlbumList2" }).href(),
            {
              params: asURLSearchParams({
                ...authParamsPlusJson,
                type: "highest",
                size: 500,
                offset: 0,
              }),
              headers,
            }
          );
        });
      });
    });

    describe("when the artist has only 1 album", () => {
      const artist = anArtist({
        name: "one hit wonder",
        albums: [anAlbumSummary({ genre: asGenre("Pop") })],
      });
      const artists = [artist];
      const albums = artists.flatMap((artist) => artist.albums);

      beforeEach(() => {
        mockGET
          .mockImplementationOnce(() =>
            Promise.resolve(ok(asArtistsJson(artists)))
          )
          .mockImplementationOnce(() =>
            Promise.resolve(ok(getAlbumListJson(asArtistAlbumPairs(artists))))
          );
      });

      it("should return the album", async () => {
        const q: AlbumQuery = {
          _index: 0,
          _count: 100,
          type: "alphabeticalByArtist",
        };
        const result = await subsonic.albums(q);

        expect(result).toEqual({
          results: albums,
          total: 1,
        });

        expect(axios.get).toHaveBeenCalledWith(
          url.append({ pathname: "/rest/getArtists" }).href(),
          {
            params: asURLSearchParams(authParamsPlusJson),
            headers,
          }
        );

        expect(axios.get).toHaveBeenCalledWith(
          url.append({ pathname: "/rest/getAlbumList2" }).href(),
          {
            params: asURLSearchParams({
              ...authParamsPlusJson,
              type: "alphabeticalByArtist",
              size: 500,
              offset: 0,
            }),
            headers,
          }
        );
      });
    });

    describe("when the only artist has no albums", () => {
      const artist = anArtist({
        name: "no hit wonder",
        albums: [],
      });
      const artists = [artist];
      const albums = artists.flatMap((artist) => artist.albums);

      beforeEach(() => {
        mockGET
          .mockImplementationOnce(() =>
            Promise.resolve(ok(asArtistsJson(artists)))
          )
          .mockImplementationOnce(() =>
            Promise.resolve(ok(getAlbumListJson(asArtistAlbumPairs(artists))))
          );
      });

      it("should return the album", async () => {
        const q: AlbumQuery = {
          _index: 0,
          _count: 100,
          type: "alphabeticalByArtist",
        };
        const result = await subsonic.albums(q);

        expect(result).toEqual({
          results: albums,
          total: 0,
        });

        expect(axios.get).toHaveBeenCalledWith(
          url.append({ pathname: "/rest/getArtists" }).href(),
          {
            params: asURLSearchParams(authParamsPlusJson),
            headers,
          }
        );

        expect(axios.get).toHaveBeenCalledWith(
          url.append({ pathname: "/rest/getAlbumList2" }).href(),
          {
            params: asURLSearchParams({
              ...authParamsPlusJson,
              type: "alphabeticalByArtist",
              size: 500,
              offset: 0,
            }),
            headers,
          }
        );
      });
    });

    describe("when there are 6 albums in total", () => {
      const genre1 = asGenre("genre1");
      const genre2 = asGenre("genre2");
      const genre3 = asGenre("genre3");

      const artist1 = anArtist({
        name: "abba",
        albums: [
          anAlbumSummary({ name: "album1", genre: genre1 }),
          anAlbumSummary({ name: "album2", genre: genre2 }),
          anAlbumSummary({ name: "album3", genre: genre3 }),
        ],
      });
      const artist2 = anArtist({
        name: "babba",
        albums: [
          anAlbumSummary({ name: "album4", genre: genre1 }),
          anAlbumSummary({ name: "album5", genre: genre2 }),
          anAlbumSummary({ name: "album6", genre: genre3 }),
        ],
      });
      const artists = [artist1, artist2];
      const albums = artists.flatMap((artist) => artist.albums);

      describe("querying for all of them", () => {
        it("should return all of them with corrent paging information", async () => {
          mockGET
            .mockImplementationOnce(() =>
              Promise.resolve(ok(asArtistsJson(artists)))
            )
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getAlbumListJson(asArtistAlbumPairs(artists))))
            );

          const q: AlbumQuery = {
            _index: 0,
            _count: 100,
            type: "alphabeticalByArtist",
          };
          const result = await subsonic.albums(q);

          expect(result).toEqual({
            results: albums,
            total: 6,
          });

          expect(axios.get).toHaveBeenCalledWith(
            url.append({ pathname: "/rest/getArtists" }).href(),
            {
              params: asURLSearchParams(authParamsPlusJson),
              headers,
            }
          );

          expect(axios.get).toHaveBeenCalledWith(
            url.append({ pathname: "/rest/getAlbumList2" }).href(),
            {
              params: asURLSearchParams({
                ...authParamsPlusJson,
                type: "alphabeticalByArtist",
                size: 500,
                offset: 0,
              }),
              headers,
            }
          );
        });
      });

      describe("querying for a page of them", () => {
        it("should return the page with the corrent paging information", async () => {
          mockGET
            .mockImplementationOnce(() =>
              Promise.resolve(ok(asArtistsJson(artists)))
            )
            .mockImplementationOnce(() =>
              Promise.resolve(
                ok(
                  getAlbumListJson([
                    [artist1, artist1.albums[2]!],
                    [artist2, artist2.albums[0]!],
                    // due to pre-fetch will get next 2 albums also
                    [artist2, artist2.albums[1]!],
                    [artist2, artist2.albums[2]!],
                  ])
                )
              )
            );

          const q: AlbumQuery = {
            _index: 2,
            _count: 2,
            type: "alphabeticalByArtist",
          };
          const result = await subsonic.albums(q);

          expect(result).toEqual({
            results: [artist1.albums[2], artist2.albums[0]],
            total: 6,
          });

          expect(axios.get).toHaveBeenCalledWith(
            url.append({ pathname: "/rest/getArtists" }).href(),
            {
              params: asURLSearchParams(authParamsPlusJson),
              headers,
            }
          );

          expect(axios.get).toHaveBeenCalledWith(
            url.append({ pathname: "/rest/getAlbumList2" }).href(),
            {
              params: asURLSearchParams({
                ...authParamsPlusJson,
                type: "alphabeticalByArtist",
                size: 500,
                offset: 2,
              }),
              headers,
            }
          );
        });
      });
    });

    describe("when the number of albums reported by getArtists does not match that of getAlbums", () => {
      const genre = asGenre("lofi");

      const album1 = anAlbumSummary({ name: "album1", genre });
      const album2 = anAlbumSummary({ name: "album2", genre });
      const album3 = anAlbumSummary({ name: "album3", genre });
      const album4 = anAlbumSummary({ name: "album4", genre });
      const album5 = anAlbumSummary({ name: "album5", genre });

      // the artists have 5 albums in the getArtists endpoint
      const artist1 = anArtist({
        albums: [album1, album2, album3, album4],
      });
      const artist2 = anArtist({
        albums: [album5],
      });
      const artists = [artist1, artist2];

      describe("when the number of albums returned from getAlbums is less the number of albums in the getArtists endpoint", () => {
        describe("when the query comes back on 1 page", () => {
          beforeEach(() => {
            mockGET
              .mockImplementationOnce(() =>
                Promise.resolve(ok(asArtistsJson(artists)))
              )
              .mockImplementationOnce(() =>
                Promise.resolve(
                  ok(
                    getAlbumListJson([
                      [artist1, album1],
                      [artist1, album2],
                      [artist1, album3],
                      // album4 is missing from the albums end point for some reason
                      [artist2, album5],
                    ])
                  )
                )
              );
          });

          it("should return the page of albums, updating the total to be accurate", async () => {
            const q: AlbumQuery = {
              _index: 0,
              _count: 100,
              type: "alphabeticalByArtist",
            };
            const result = await subsonic.albums(q);

            expect(result).toEqual({
              results: [album1, album2, album3, album5],
              total: 4,
            });

            expect(axios.get).toHaveBeenCalledWith(
              url.append({ pathname: "/rest/getArtists" }).href(),
              {
                params: asURLSearchParams(authParamsPlusJson),
                headers,
              }
            );

            expect(axios.get).toHaveBeenCalledWith(
              url.append({ pathname: "/rest/getAlbumList2" }).href(),
              {
                params: asURLSearchParams({
                  ...authParamsPlusJson,
                  type: "alphabeticalByArtist",
                  size: 500,
                  offset: q._index,
                }),
                headers,
              }
            );
          });
        });

        describe("when the query is for the first page", () => {
          beforeEach(() => {
            mockGET
              .mockImplementationOnce(() =>
                Promise.resolve(ok(asArtistsJson(artists)))
              )
              .mockImplementationOnce(() =>
                Promise.resolve(
                  ok(
                    getAlbumListJson([
                      [artist1, album1],
                      [artist1, album2],
                      // album3 & album5 is returned due to the prefetch
                      [artist1, album3],
                      // album4 is missing from the albums end point for some reason
                      [artist2, album5],
                    ])
                  )
                )
              );
          });

          it("should filter out the pre-fetched albums", async () => {
            const q: AlbumQuery = {
              _index: 0,
              _count: 2,
              type: "alphabeticalByArtist",
            };
            const result = await subsonic.albums(q);

            expect(result).toEqual({
              results: [album1, album2],
              total: 4,
            });

            expect(axios.get).toHaveBeenCalledWith(
              url.append({ pathname: "/rest/getArtists" }).href(),
              {
                params: asURLSearchParams(authParamsPlusJson),
                headers,
              }
            );

            expect(axios.get).toHaveBeenCalledWith(
              url.append({ pathname: "/rest/getAlbumList2" }).href(),
              {
                params: asURLSearchParams({
                  ...authParamsPlusJson,
                  type: "alphabeticalByArtist",
                  size: 500,
                  offset: q._index,
                }),
                headers,
              }
            );
          });
        });

        describe("when the query is for the last page only", () => {
          beforeEach(() => {
            mockGET
              .mockImplementationOnce(() =>
                Promise.resolve(ok(asArtistsJson(artists)))
              )
              .mockImplementationOnce(() =>
                Promise.resolve(
                  ok(
                    getAlbumListJson([
                      // album1 is on the first page
                      // album2 is on the first page
                      [artist1, album3],
                      // album4 is missing from the albums end point for some reason
                      [artist2, album5],
                    ])
                  )
                )
              );
          });

          it("should return the last page of albums, updating the total to be accurate", async () => {
            const q: AlbumQuery = {
              _index: 2,
              _count: 100,
              type: "alphabeticalByArtist",
            };
            const result = await subsonic.albums(q);

            expect(result).toEqual({
              results: [album3, album5],
              total: 4,
            });

            expect(axios.get).toHaveBeenCalledWith(
              url.append({ pathname: "/rest/getArtists" }).href(),
              {
                params: asURLSearchParams(authParamsPlusJson),
                headers,
              }
            );

            expect(axios.get).toHaveBeenCalledWith(
              url.append({ pathname: "/rest/getAlbumList2" }).href(),
              {
                params: asURLSearchParams({
                  ...authParamsPlusJson,
                  type: "alphabeticalByArtist",
                  size: 500,
                  offset: q._index,
                }),
                headers,
              }
            );
          });
        });
      });

      describe("when the number of albums returned from getAlbums is more than the number of albums in the getArtists endpoint", () => {
        describe("when the query comes back on 1 page", () => {
          beforeEach(() => {
            mockGET
              .mockImplementationOnce(() =>
                Promise.resolve(
                  ok(
                    asArtistsJson([
                      // artist1 has lost 2 albums on the getArtists end point
                      { ...artist1, albums: [album1, album2] },
                      artist2,
                    ])
                  )
                )
              )
              .mockImplementationOnce(() =>
                Promise.resolve(
                  ok(
                    getAlbumListJson([
                      [artist1, album1],
                      [artist1, album2],
                      [artist1, album3],
                      [artist1, album4],
                      [artist2, album5],
                    ])
                  )
                )
              );
          });

          it("should return the page of albums, updating the total to be accurate", async () => {
            const q: AlbumQuery = {
              _index: 0,
              _count: 100,
              type: "alphabeticalByArtist",
            };
            const result = await subsonic.albums(q);

            expect(result).toEqual({
              results: [album1, album2, album3, album4, album5],
              total: 5,
            });

            expect(axios.get).toHaveBeenCalledWith(
              url.append({ pathname: "/rest/getArtists" }).href(),
              {
                params: asURLSearchParams(authParamsPlusJson),
                headers,
              }
            );

            expect(axios.get).toHaveBeenCalledWith(
              url.append({ pathname: "/rest/getAlbumList2" }).href(),
              {
                params: asURLSearchParams({
                  ...authParamsPlusJson,
                  type: "alphabeticalByArtist",
                  size: 500,
                  offset: q._index,
                }),
                headers,
              }
            );
          });
        });

        describe("when the query is for the first page", () => {
          beforeEach(() => {
            mockGET
              .mockImplementationOnce(() =>
                Promise.resolve(
                  ok(
                    asArtistsJson([
                      // artist1 has lost 2 albums on the getArtists end point
                      { ...artist1, albums: [album1, album2] },
                      artist2,
                    ])
                  )
                )
              )
              .mockImplementationOnce(() =>
                Promise.resolve(
                  ok(
                    getAlbumListJson([
                      [artist1, album1],
                      [artist1, album2],
                      [artist1, album3],
                      [artist1, album4],
                      [artist2, album5],
                    ])
                  )
                )
              );
          });

          it("should filter out the pre-fetched albums", async () => {
            const q: AlbumQuery = {
              _index: 0,
              _count: 2,
              type: "alphabeticalByArtist",
            };
            const result = await subsonic.albums(q);

            expect(result).toEqual({
              results: [album1, album2],
              total: 5,
            });

            expect(axios.get).toHaveBeenCalledWith(
              url.append({ pathname: "/rest/getArtists" }).href(),
              {
                params: asURLSearchParams(authParamsPlusJson),
                headers,
              }
            );

            expect(axios.get).toHaveBeenCalledWith(
              url.append({ pathname: "/rest/getAlbumList2" }).href(),
              {
                params: asURLSearchParams({
                  ...authParamsPlusJson,
                  type: "alphabeticalByArtist",
                  size: 500,
                  offset: q._index,
                }),
                headers,
              }
            );
          });
        });

        describe("when the query is for the last page only", () => {
          beforeEach(() => {
            mockGET
              .mockImplementationOnce(() =>
                Promise.resolve(
                  ok(
                    asArtistsJson([
                      // artist1 has lost 2 albums on the getArtists end point
                      anArtist({ ...artist1, albums: [album1, album2] }),
                      artist2,
                    ])
                  )
                )
              )
              .mockImplementationOnce(() =>
                Promise.resolve(
                  ok(
                    getAlbumListJson([
                      [artist1, album3],
                      [artist1, album4],
                      [artist2, album5],
                    ])
                  )
                )
              );
          });

          it("should return the last page of albums, updating the total to be accurate", async () => {
            const q: AlbumQuery = {
              _index: 2,
              _count: 100,
              type: "alphabeticalByArtist",
            };
            const result = await subsonic.albums(q);

            expect(result).toEqual({
              results: [
                album3,
                album4,
                album5
              ],
              total: 5,
            });

            expect(axios.get).toHaveBeenCalledWith(
              url.append({ pathname: "/rest/getArtists" }).href(),
              {
                params: asURLSearchParams(authParamsPlusJson),
                headers,
              }
            );

            expect(axios.get).toHaveBeenCalledWith(
              url.append({ pathname: "/rest/getAlbumList2" }).href(),
              {
                params: asURLSearchParams({
                  ...authParamsPlusJson,
                  type: "alphabeticalByArtist",
                  size: 500,
                  offset: q._index,
                }),
                headers,
              }
            );
          });
        });
      });
    });
  });

  describe("getting tracks", () => {
    describe("a single track", () => {
      const pop = asGenre("Pop");

      const album = anAlbum({ id: "album1", name: "Burnin", genre: pop });

      const artist = anArtist({
        id: "artist1",
        name: "Bob Marley",
        albums: [album],
      });

      describe("when there are no custom players", () => {
        beforeEach(() => {
          customPlayers.encodingFor.mockReturnValue(O.none);
        });

        describe("that is starred", () => {
          it("should return the track", async () => {
            const track = aTrack({
              artist: artistToArtistSummary(artist),
              album: albumToAlbumSummary(album),
              genre: pop,
              rating: {
                love: true,
                stars: 4,
              },
            });

            mockGET
              .mockImplementationOnce(() =>
                Promise.resolve(ok(getSongJson(track)))
              )
              .mockImplementationOnce(() =>
                Promise.resolve(ok(getAlbumJson(album)))
              );

            const result = await subsonic.track(track.id);

            expect(result).toEqual({
              ...track,
              rating: { love: true, stars: 4 },
            });

            expect(axios.get).toHaveBeenCalledWith(
              url.append({ pathname: "/rest/getSong" }).href(),
              {
                params: asURLSearchParams({
                  ...authParamsPlusJson,
                  id: track.id,
                }),
                headers,
              }
            );

            expect(axios.get).toHaveBeenCalledWith(
              url.append({ pathname: "/rest/getAlbum" }).href(),
              {
                params: asURLSearchParams({
                  ...authParamsPlusJson,
                  id: album.id,
                }),
                headers,
              }
            );
          });
        });

        describe("that is not starred", () => {
          it("should return the track", async () => {
            const track = aTrack({
              artist: artistToArtistSummary(artist),
              album: albumToAlbumSummary(album),
              genre: pop,
              rating: {
                love: false,
                stars: 0,
              },
            });

            mockGET
              .mockImplementationOnce(() =>
                Promise.resolve(ok(getSongJson(track)))
              )
              .mockImplementationOnce(() =>
                Promise.resolve(ok(getAlbumJson(album)))
              );

            const result = await subsonic.track(track.id);

            expect(result).toEqual({
              ...track,
              rating: { love: false, stars: 0 },
            });

            expect(axios.get).toHaveBeenCalledWith(
              url.append({ pathname: "/rest/getSong" }).href(),
              {
                params: asURLSearchParams({
                  ...authParamsPlusJson,
                  id: track.id,
                }),
                headers,
              }
            );

            expect(axios.get).toHaveBeenCalledWith(
              url.append({ pathname: "/rest/getAlbum" }).href(),
              {
                params: asURLSearchParams({
                  ...authParamsPlusJson,
                  id: album.id,
                }),
                headers,
              }
            );
          });
        });
      });
    });
  });

  describe("streaming a track", () => {
    const trackId = uuid();
    const genre = aGenre("foo");

    const album = anAlbum({ genre });
    const artist = anArtist({
      albums: [album],
    });
    const track = aTrack({
      id: trackId,
      album: albumToAlbumSummary(album),
      artist: artistToArtistSummary(artist),
      genre,
    });

    describe("when there are no custom players registered", () => {
      beforeEach(() => {
        customPlayers.encodingFor.mockReturnValue(O.none);
      });

      describe("content-range, accept-ranges or content-length", () => {
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
              .mockImplementationOnce(() =>
                Promise.resolve(ok(getSongJson(track)))
              )
              .mockImplementationOnce(() =>
                Promise.resolve(ok(getAlbumJson(album)))
              )
              .mockImplementationOnce(() => Promise.resolve(streamResponse));

            const result = await subsonic.stream({ trackId, range: undefined });

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
              .mockImplementationOnce(() =>
                Promise.resolve(ok(getSongJson(track)))
              )
              .mockImplementationOnce(() =>
                Promise.resolve(ok(getAlbumJson(album)))
              )
              .mockImplementationOnce(() => Promise.resolve(streamResponse));

            const result = await subsonic.stream({ trackId, range: undefined });

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
                .mockImplementationOnce(() =>
                  Promise.resolve(ok(getSongJson(track)))
                )
                .mockImplementationOnce(() =>
                  Promise.resolve(ok(getAlbumJson(album)))
                )
                .mockImplementationOnce(() => Promise.resolve(streamResponse));

              const result = await subsonic.stream({
                trackId,
                range: undefined,
              });

              expect(result.headers).toEqual({
                "content-type": "audio/mpeg",
                "content-length": "1667",
                "content-range": "-200",
                "accept-ranges": "bytes",
              });
              expect(result.stream).toEqual(stream);

              expect(axios.get).toHaveBeenCalledWith(
                url.append({ pathname: "/rest/stream" }).href(),
                {
                  params: asURLSearchParams({
                    ...authParams,
                    id: trackId,
                  }),
                  headers: {
                    "User-Agent": "bonob",
                  },
                  responseType: "stream",
                }
              );
            });
          });

          describe("navidrome returns something other than a 200", () => {
            it("should fail", async () => {
              const trackId = "track123";

              const streamResponse = {
                status: 400,
                headers: {
                  "content-type": "text/html",
                  "content-length": "33",
                },
              };

              mockGET
                .mockImplementationOnce(() =>
                  Promise.resolve(ok(getSongJson(track)))
                )
                .mockImplementationOnce(() =>
                  Promise.resolve(ok(getAlbumJson(album)))
                )
                .mockImplementationOnce(() => Promise.resolve(streamResponse));

              return expect(
                subsonic.stream({ trackId, range: undefined })
              ).rejects.toEqual(`Subsonic failed with a 400 status`);
            });
          });

          describe("io exception occurs", () => {
            it("should fail", async () => {
              const trackId = "track123";

              mockGET
                .mockImplementationOnce(() =>
                  Promise.resolve(ok(getSongJson(track)))
                )
                .mockImplementationOnce(() =>
                  Promise.resolve(ok(getAlbumJson(album)))
                )
                .mockImplementationOnce(() =>
                  Promise.reject("IO error occured")
                );

              return expect(
                subsonic.stream({ trackId, range: undefined })
              ).rejects.toEqual(`Subsonic failed with: IO error occured`);
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
              .mockImplementationOnce(() =>
                Promise.resolve(ok(getSongJson(track)))
              )
              .mockImplementationOnce(() =>
                Promise.resolve(ok(getAlbumJson(album)))
              )
              .mockImplementationOnce(() => Promise.resolve(streamResponse));

            const result = await subsonic.stream({ trackId, range });

            expect(result.headers).toEqual({
              "content-type": "audio/flac",
              "content-length": "66",
              "content-range": "100-200",
              "accept-ranges": "none",
            });
            expect(result.stream).toEqual(stream);

            expect(axios.get).toHaveBeenCalledWith(
              url.append({ pathname: "/rest/stream" }).href(),
              {
                params: asURLSearchParams({
                  ...authParams,
                  id: trackId,
                }),
                headers: {
                  "User-Agent": "bonob",
                  Range: range,
                },
                responseType: "stream",
              }
            );
          });
        });
      });
    });

    describe("when there are custom players registered", () => {
      const customEncoding = {
        player: `bonob-${uuid()}`,
        mimeType: "transocodedMimeType",
      };
      const trackWithCustomPlayer: Track = {
        ...track,
        encoding: customEncoding,
      };

      beforeEach(() => {
        customPlayers.encodingFor.mockReturnValue(O.of(customEncoding));
      });

      describe("when no range specified", () => {
        it("should user the custom client specified by the stream client", async () => {
          const streamResponse = {
            status: 200,
            headers: {
              "content-type": "audio/mpeg",
            },
            data: Buffer.from("the track", "ascii"),
          };

          mockGET
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getSongJson(trackWithCustomPlayer)))
            )
            .mockImplementationOnce(() =>
              Promise.resolve(
                ok(getAlbumJson(album))
              )
            )
            .mockImplementationOnce(() => Promise.resolve(streamResponse));

          await subsonic.stream({ trackId, range: undefined });

          expect(axios.get).toHaveBeenCalledWith(
            url.append({ pathname: "/rest/stream" }).href(),
            {
              params: asURLSearchParams({
                ...authParams,
                id: trackId,
                c: trackWithCustomPlayer.encoding.player,
              }),
              headers: {
                "User-Agent": "bonob",
              },
              responseType: "stream",
            }
          );
        });
      });

      describe("when range specified", () => {
        it("should user the custom client specified by the stream client", async () => {
          const range = "1000-2000";

          const streamResponse = {
            status: 200,
            headers: {
              "content-type": "audio/mpeg",
            },
            data: Buffer.from("the track", "ascii"),
          };

          mockGET
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getSongJson(trackWithCustomPlayer)))
            )
            .mockImplementationOnce(() =>
              Promise.resolve(
                ok(getAlbumJson(album))
              )
            )
            .mockImplementationOnce(() => Promise.resolve(streamResponse));

          await subsonic.stream({ trackId, range });

          expect(axios.get).toHaveBeenCalledWith(
            url.append({ pathname: "/rest/stream" }).href(),
            {
              params: asURLSearchParams({
                ...authParams,
                id: trackId,
                c: trackWithCustomPlayer.encoding.player,
              }),
              headers: {
                "User-Agent": "bonob",
                Range: range,
              },
              responseType: "stream",
            }
          );
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
          const coverArtURN = {
            system: "subsonic",
            resource: `art:${coverArtId}`,
          };

          mockGET.mockImplementationOnce(() => Promise.resolve(streamResponse));

          const result = await subsonic.coverArt(coverArtURN);

          expect(result).toEqual({
            contentType: streamResponse.headers["content-type"],
            data: streamResponse.data,
          });

          expect(axios.get).toHaveBeenCalledWith(
            url.append({ pathname: "/rest/getCoverArt" }).href(),
            {
              params: asURLSearchParams({
                ...authParams,
                id: coverArtId,
              }),
              headers,
              responseType: "arraybuffer",
            }
          );
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
          const coverArtId = uuid();
          const coverArtURN = {
            system: "subsonic",
            resource: `art:${coverArtId}`,
          };
          const size = 1879;

          mockGET.mockImplementationOnce(() => Promise.resolve(streamResponse));

          const result = await subsonic.coverArt(coverArtURN, size);

          expect(result).toEqual({
            contentType: streamResponse.headers["content-type"],
            data: streamResponse.data,
          });

          expect(axios.get).toHaveBeenCalledWith(
            url.append({ pathname: "/rest/getCoverArt" }).href(),
            {
              params: asURLSearchParams({
                ...authParams,
                id: coverArtId,
                size,
              }),
              headers,
              responseType: "arraybuffer",
            }
          );
        });
      });

      describe("when an unexpected error occurs", () => {
        it("should return undefined", async () => {
          const size = 1879;

          mockGET.mockImplementationOnce(() => Promise.reject("BOOOM"));

          const result = await subsonic.coverArt(
            { system: "external", resource: "http://localhost:404" },
            size
          );

          expect(result).toBeUndefined();
        });
      });
    });

    describe("fetching cover art", () => {
      describe("when urn.resource is not subsonic", () => {
        it("should be undefined", async () => {
          const covertArtURN = {
            system: "notSubsonic",
            resource: `art:${uuid()}`,
          };

          const result = await subsonic.coverArt(covertArtURN, 190);

          expect(result).toBeUndefined();
        });
      });

      describe("when no size is specified", () => {
        it("should fetch the image", async () => {
          const coverArtId = uuid();
          const covertArtURN = {
            system: "subsonic",
            resource: `art:${coverArtId}`,
          };

          const streamResponse = {
            status: 200,
            headers: {
              "content-type": "image/jpeg",
            },
            data: Buffer.from("the image", "ascii"),
          };

          mockGET.mockImplementationOnce(() => Promise.resolve(streamResponse));

          const result = await subsonic.coverArt(covertArtURN);

          expect(result).toEqual({
            contentType: streamResponse.headers["content-type"],
            data: streamResponse.data,
          });

          expect(axios.get).toHaveBeenCalledWith(`${url}/rest/getCoverArt`, {
            params: asURLSearchParams({
              ...authParams,
              id: coverArtId,
            }),
            headers,
            responseType: "arraybuffer",
          });
        });

        describe("and an error occurs fetching the uri", () => {
          it("should return undefined", async () => {
            const coverArtId = uuid();
            const covertArtURN = {
              system: "subsonic",
              resource: `art:${coverArtId}`,
            };

            mockGET.mockImplementationOnce(() => Promise.reject("BOOOM"));

            const result = await subsonic.coverArt(covertArtURN);

            expect(result).toBeUndefined();
          });
        });
      });

      describe("when size is specified", () => {
        const size = 189;

        it("should fetch the image", async () => {
          const coverArtId = uuid();
          const covertArtURN = {
            system: "subsonic",
            resource: `art:${coverArtId}`,
          };

          const streamResponse = {
            status: 200,
            headers: {
              "content-type": "image/jpeg",
            },
            data: Buffer.from("the image", "ascii"),
          };

          mockGET.mockImplementationOnce(() => Promise.resolve(streamResponse));

          const result = await subsonic.coverArt(covertArtURN, size);

          expect(result).toEqual({
            contentType: streamResponse.headers["content-type"],
            data: streamResponse.data,
          });

          expect(axios.get).toHaveBeenCalledWith(
            url.append({ pathname: "/rest/getCoverArt" }).href(),
            {
              params: asURLSearchParams({
                ...authParams,
                id: coverArtId,
                size,
              }),
              headers,
              responseType: "arraybuffer",
            }
          );
        });

        describe("and an error occurs fetching the uri", () => {
          it("should return undefined", async () => {
            const coverArtId = uuid();
            const covertArtURN = {
              system: "subsonic",
              resource: `art:${coverArtId}`,
            };

            mockGET.mockImplementationOnce(() => Promise.reject("BOOOM"));

            const result = await subsonic.coverArt(covertArtURN, size);

            expect(result).toBeUndefined();
          });
        });
      });
    });
  });

  describe("rate", () => {
    const trackId = uuid();

    const artist = anArtist();
    const album = anAlbum({ id: "album1", name: "Burnin", genre: POP });

    beforeEach(() => {
      customPlayers.encodingFor.mockReturnValue(O.none);
    });

    describe("rating a track", () => {
      describe("loving a track that isnt already loved", () => {
        it("should mark the track as loved", async () => {
          const track = aTrack({
            id: trackId,
            artist,
            album: albumToAlbumSummary(album),
            rating: { love: false, stars: 0 },
          });

          mockGET
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getSongJson(track)))
            )
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getAlbumJson(album)))
            )
            .mockImplementationOnce(() => Promise.resolve(ok(EMPTY)));

          const result = await subsonic.rate(trackId, { love: true, stars: 0 });

          expect(result).toEqual(true);

          expect(mockGET).toHaveBeenCalledWith(
            url.append({ pathname: "/rest/star" }).href(),
            {
              params: asURLSearchParams({
                ...authParamsPlusJson,
                id: trackId,
              }),
              headers,
            }
          );
        });
      });

      describe("unloving a track that is loved", () => {
        it("should mark the track as loved", async () => {
          const track = aTrack({
            id: trackId,
            artist,
            album: albumToAlbumSummary(album),
            rating: { love: true, stars: 0 },
          });

          mockGET
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getSongJson(track)))
            )
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getAlbumJson(album)))
            )
            .mockImplementationOnce(() => Promise.resolve(ok(EMPTY)));

          const result = await subsonic.rate(trackId, {
            love: false,
            stars: 0,
          });

          expect(result).toEqual(true);

          expect(mockGET).toHaveBeenCalledWith(
            url.append({ pathname: "/rest/unstar" }).href(),
            {
              params: asURLSearchParams({
                ...authParamsPlusJson,
                id: trackId,
              }),
              headers,
            }
          );
        });
      });

      describe("loving a track that is already loved", () => {
        it("shouldn't do anything", async () => {
          const track = aTrack({
            id: trackId,
            artist,
            album: albumToAlbumSummary(album),
            rating: { love: true, stars: 0 },
          });

          mockGET
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getSongJson(track)))
            )
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getAlbumJson(album)))
            );

          const result = await subsonic.rate(trackId, { love: true, stars: 0 });

          expect(result).toEqual(true);

          expect(mockGET).toHaveBeenCalledTimes(2);
        });
      });

      describe("rating a track with a different rating", () => {
        it("should add the new rating", async () => {
          const track = aTrack({
            id: trackId,
            artist,
            album: albumToAlbumSummary(album),
            rating: { love: false, stars: 0 },
          });

          mockGET
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getSongJson(track)))
            )
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getAlbumJson(album)))
            )
            .mockImplementationOnce(() => Promise.resolve(ok(EMPTY)));

          const result = await subsonic.rate(trackId, {
            love: false,
            stars: 3,
          });

          expect(result).toEqual(true);

          expect(mockGET).toHaveBeenCalledWith(
            url.append({ pathname: "/rest/setRating" }).href(),
            {
              params: asURLSearchParams({
                ...authParamsPlusJson,
                id: trackId,
                rating: 3,
              }),
              headers,
            }
          );
        });
      });

      describe("rating a track with the same rating it already has", () => {
        it("shouldn't do anything", async () => {
          const track = aTrack({
            id: trackId,
            artist,
            album: albumToAlbumSummary(album),
            rating: { love: true, stars: 3 },
          });

          mockGET
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getSongJson(track)))
            )
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getAlbumJson(album)))
            );

          const result = await subsonic.rate(trackId, { love: true, stars: 3 });

          expect(result).toEqual(true);

          expect(mockGET).toHaveBeenCalledTimes(2);
        });
      });

      describe("loving and rating a track", () => {
        it("should return true", async () => {
          const track = aTrack({
            id: trackId,
            artist,
            album: albumToAlbumSummary(album),
            rating: { love: true, stars: 3 },
          });

          mockGET
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getSongJson(track)))
            )
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getAlbumJson(album)))
            )
            .mockImplementationOnce(() => Promise.resolve(ok(EMPTY)))
            .mockImplementationOnce(() => Promise.resolve(ok(EMPTY)));

          const result = await subsonic.rate(trackId, {
            love: false,
            stars: 5,
          });

          expect(result).toEqual(true);

          expect(mockGET).toHaveBeenCalledWith(
            url.append({ pathname: "/rest/unstar" }).href(),
            {
              params: asURLSearchParams({
                ...authParamsPlusJson,
                id: trackId,
              }),
              headers,
            }
          );
          expect(mockGET).toHaveBeenCalledWith(
            url.append({ pathname: "/rest/setRating" }).href(),
            {
              params: asURLSearchParams({
                ...authParamsPlusJson,
                id: trackId,
                rating: 5,
              }),
              headers,
            }
          );
        });
      });

      describe("invalid star values", () => {
        describe("stars of -1", () => {
          it("should return false", async () => {
            const result = await subsonic.rate(trackId, {
              love: true,
              stars: -1,
            });
            expect(result).toEqual(false);
          });
        });

        describe("stars of 6", () => {
          it("should return false", async () => {
            const result = await subsonic.rate(trackId, {
              love: true,
              stars: -1,
            });
            expect(result).toEqual(false);
          });
        });
      });

      describe("when fails", () => {
        it("should return false", async () => {
          mockGET
            .mockImplementationOnce(() => Promise.resolve(ok(FAILURE)))
            .mockImplementationOnce(() => Promise.resolve(ok(EMPTY)));

          const result = await subsonic.rate(trackId, { love: true, stars: 0 });

          expect(result).toEqual(false);
        });
      });
    });
  });

  describe("searchArtists", () => {
    describe("when there is 1 search results", () => {
      it("should return true", async () => {
        const artist1 = anArtist({ name: "foo woo" });

        mockGET.mockImplementationOnce(() =>
          Promise.resolve(ok(getSearchResult3Json({ artists: [artist1] })))
        );

        const result = await subsonic.searchArtists("foo");

        expect(result).toEqual([artistToArtistSummary(artist1)]);

        expect(mockGET).toHaveBeenCalledWith(
          url.append({ pathname: "/rest/search3" }).href(),
          {
            params: asURLSearchParams({
              ...authParamsPlusJson,
              artistCount: 20,
              albumCount: 0,
              songCount: 0,
              query: "foo",
            }),
            headers,
          }
        );
      });
    });

    describe("when there are many search results", () => {
      it("should return true", async () => {
        const artist1 = anArtist({ name: "foo woo" });
        const artist2 = anArtist({ name: "foo choo" });

        mockGET.mockImplementationOnce(() =>
          Promise.resolve(
            ok(getSearchResult3Json({ artists: [artist1, artist2] }))
          )
        );

        const result = await subsonic.searchArtists("foo");

        expect(result).toEqual([
          artistToArtistSummary(artist1),
          artistToArtistSummary(artist2),
        ]);

        expect(mockGET).toHaveBeenCalledWith(
          url.append({ pathname: "/rest/search3" }).href(),
          {
            params: asURLSearchParams({
              ...authParamsPlusJson,
              artistCount: 20,
              albumCount: 0,
              songCount: 0,
              query: "foo",
            }),
            headers,
          }
        );
      });
    });

    describe("when there are no search results", () => {
      it("should return []", async () => {
        mockGET.mockImplementationOnce(() =>
          Promise.resolve(ok(getSearchResult3Json({ artists: [] })))
        );

        const result = await subsonic.searchArtists("foo");

        expect(result).toEqual([]);

        expect(mockGET).toHaveBeenCalledWith(
          url.append({ pathname: "/rest/search3" }).href(),
          {
            params: asURLSearchParams({
              ...authParamsPlusJson,
              artistCount: 20,
              albumCount: 0,
              songCount: 0,
              query: "foo",
            }),
            headers,
          }
        );
      });
    });
  });

  describe("searchAlbums", () => {
    describe("when there is 1 search results", () => {
      it("should return true", async () => {
        const album = anAlbum({ name: "foo woo" });
        const artist = anArtist({ name: "#1", albums: [album] });

        mockGET.mockImplementationOnce(() =>
          Promise.resolve(
            ok(getSearchResult3Json({ albums: [{ artist, album }] }))
          )
        );

        const result = await subsonic.searchAlbums("foo");

        expect(result).toEqual([
          {
            ...albumToAlbumSummary(album),
            genre: undefined
          }
        ]);

        expect(mockGET).toHaveBeenCalledWith(
          url.append({ pathname: "/rest/search3" }).href(),
          {
            params: asURLSearchParams({
              ...authParamsPlusJson,
              artistCount: 0,
              albumCount: 20,
              songCount: 0,
              query: "foo",
            }),
            headers,
          }
        );
      });
    });

    describe("when there are many search results", () => {
      it("should return true", async () => {
        const album1 = anAlbum({ name: "album1" });
        const artist1 = anArtist({ name: "artist1", albums: [album1] });

        const album2 = anAlbum({ name: "album2" });
        const artist2 = anArtist({ name: "artist2", albums: [album2] });

        mockGET.mockImplementationOnce(() =>
          Promise.resolve(
            ok(
              getSearchResult3Json({
                albums: [
                  { artist: artist1, album: album1 },
                  { artist: artist2, album: album2 },
                ],
              })
            )
          )
        );

        const result = await subsonic.searchAlbums("moo");

        expect(result).toEqual([
          {
            ...albumToAlbumSummary(album1),
            genre: undefined
          },
          {
            ...albumToAlbumSummary(album2),
            genre: undefined
          },
        ]);

        expect(mockGET).toHaveBeenCalledWith(
          url.append({ pathname: "/rest/search3" }).href(),
          {
            params: asURLSearchParams({
              ...authParamsPlusJson,
              artistCount: 0,
              albumCount: 20,
              songCount: 0,
              query: "moo",
            }),
            headers,
          }
        );
      });
    });

    describe("when there are no search results", () => {
      it("should return []", async () => {
        mockGET.mockImplementationOnce(() =>
          Promise.resolve(ok(getSearchResult3Json({ albums: [] })))
        );

        const result = await subsonic.searchAlbums("foo");

        expect(result).toEqual([]);

        expect(mockGET).toHaveBeenCalledWith(
          url.append({ pathname: "/rest/search3" }).href(),
          {
            params: asURLSearchParams({
              ...authParamsPlusJson,
              artistCount: 0,
              albumCount: 20,
              songCount: 0,
              query: "foo",
            }),
            headers,
          }
        );
      });
    });
  });

  describe("searchSongs", () => {
    beforeEach(() => {
      customPlayers.encodingFor.mockReturnValue(O.none);
    });

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
          .mockImplementationOnce(() =>
            Promise.resolve(ok(getSearchResult3Json({ tracks: [track] })))
          )
          .mockImplementationOnce(() => Promise.resolve(ok(getSongJson(track))))
          .mockImplementationOnce(() =>
            Promise.resolve(ok(getAlbumJson(album)))
          );

        const result = await subsonic.searchTracks("foo");

        expect(result).toEqual([track]);

        expect(mockGET).toHaveBeenCalledWith(
          url.append({ pathname: "/rest/search3" }).href(),
          {
            params: asURLSearchParams({
              ...authParamsPlusJson,
              artistCount: 0,
              albumCount: 0,
              songCount: 20,
              query: "foo",
            }),
            headers,
          }
        );
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
          .mockImplementationOnce(() =>
            Promise.resolve(
              ok(
                getSearchResult3Json({
                  tracks: [track1, track2],
                })
              )
            )
          )
          .mockImplementationOnce(() =>
            Promise.resolve(ok(getSongJson(track1)))
          )
          .mockImplementationOnce(() =>
            Promise.resolve(ok(getSongJson(track2)))
          )
          .mockImplementationOnce(() =>
            Promise.resolve(ok(getAlbumJson(album1)))
          )
          .mockImplementationOnce(() =>
            Promise.resolve(ok(getAlbumJson(album2)))
          );

        const result = await subsonic.searchTracks("moo");

        expect(result).toEqual([track1, track2]);

        expect(mockGET).toHaveBeenCalledWith(
          url.append({ pathname: "/rest/search3" }).href(),
          {
            params: asURLSearchParams({
              ...authParamsPlusJson,
              artistCount: 0,
              albumCount: 0,
              songCount: 20,
              query: "moo",
            }),
            headers,
          }
        );
      });
    });

    describe("when there are no search results", () => {
      it("should return []", async () => {
        mockGET.mockImplementationOnce(() =>
          Promise.resolve(ok(getSearchResult3Json({ tracks: [] })))
        );

        const result = await subsonic.searchTracks("foo");

        expect(result).toEqual([]);

        expect(mockGET).toHaveBeenCalledWith(
          url.append({ pathname: "/rest/search3" }).href(),
          {
            params: asURLSearchParams({
              ...authParamsPlusJson,
              artistCount: 0,
              albumCount: 0,
              songCount: 20,
              query: "foo",
            }),
            headers,
          }
        );
      });
    });
  });

  describe("playlists", () => {
    beforeEach(() => {
      customPlayers.encodingFor.mockReturnValue(O.none);
    });

    describe("getting playlists", () => {
      describe("when there is 1 playlist results", () => {
        it("should return it", async () => {
          const playlist = aPlaylistSummary();

          mockGET.mockImplementationOnce(() =>
            Promise.resolve(ok(getPlayListsJson([playlist])))
          );

          const result = await subsonic.playlists();

          expect(result).toEqual([playlist]);

          expect(mockGET).toHaveBeenCalledWith(
            url.append({ pathname: "/rest/getPlaylists" }).href(),
            {
              params: asURLSearchParams(authParamsPlusJson),
              headers,
            }
          );
        });
      });

      describe("when there are many playlists", () => {
        it("should return them", async () => {
          const playlist1 = aPlaylistSummary();
          const playlist2 = aPlaylistSummary();
          const playlist3 = aPlaylistSummary();
          const playlists = [playlist1, playlist2, playlist3];

          mockGET.mockImplementationOnce(() =>
            Promise.resolve(ok(getPlayListsJson(playlists)))
          );

          const result = await subsonic.playlists();

          expect(result).toEqual(playlists);

          expect(mockGET).toHaveBeenCalledWith(
            url.append({ pathname: "/rest/getPlaylists" }).href(),
            {
              params: asURLSearchParams(authParamsPlusJson),
              headers,
            }
          );
        });
      });

      describe("when there are no playlists", () => {
        it("should return []", async () => {
          mockGET.mockImplementationOnce(() =>
            Promise.resolve(ok(getPlayListsJson([])))
          );

          const result = await subsonic.playlists();

          expect(result).toEqual([]);

          expect(mockGET).toHaveBeenCalledWith(
            url.append({ pathname: "/rest/getPlaylists" }).href(),
            {
              params: asURLSearchParams(authParamsPlusJson),
              headers,
            }
          );
        });
      });
    });

    describe("getting a single playlist", () => {
      describe("when there is no playlist with the id", () => {
        it("should raise error", async () => {
          const id = "id404";

          mockGET.mockImplementationOnce(() =>
            Promise.resolve(ok(error("70", "data not found")))
          );

          return expect(subsonic.playlist(id)).rejects.toEqual(
            "Subsonic error:data not found"
          );
        });
      });

      describe("when there is a playlist with the id", () => {
        describe("and it has tracks", () => {
          it("should return the playlist with entries", async () => {
            const id = uuid();
            const name = "Great Playlist";
            const artist1 = anArtist();
            const album1 = anAlbum({
              artistId: artist1.id,
              artistName: artist1.name,
              genre: POP,
            });
            const track1 = aTrack({
              genre: POP,
              number: 66,
              coverArt: album1.coverArt,
              artist: artistToArtistSummary(artist1),
              album: albumToAlbumSummary(album1),
            });

            const artist2 = anArtist();
            const album2 = anAlbum({
              artistId: artist2.id,
              artistName: artist2.name,
              genre: ROCK,
            });
            const track2 = aTrack({
              genre: ROCK,
              number: 77,
              coverArt: album2.coverArt,
              artist: artistToArtistSummary(artist2),
              album: albumToAlbumSummary(album2),
            });

            mockGET.mockImplementationOnce(() =>
              Promise.resolve(
                ok(
                  getPlayListJson({
                    id,
                    name,
                    entries: [track1, track2],
                  })
                )
              )
            );

            const result = await subsonic.playlist(id);

            expect(result).toEqual({
              id,
              name,
              entries: [
                { ...track1, number: 1 },
                { ...track2, number: 2 },
              ],
            });

            expect(mockGET).toHaveBeenCalledWith(
              url.append({ pathname: "/rest/getPlaylist" }).href(),
              {
                params: asURLSearchParams({
                  ...authParamsPlusJson,
                  id,
                }),
                headers,
              }
            );
          });
        });

        describe("and it has no tracks", () => {
          it("should return the playlist with empty entries", async () => {
            const playlist = aPlaylist({
              entries: [],
            });

            mockGET.mockImplementationOnce(() =>
              Promise.resolve(ok(getPlayListJson(playlist)))
            );

            const result = await subsonic.playlist(playlist.id);

            expect(result).toEqual(playlist);

            expect(mockGET).toHaveBeenCalledWith(
              url.append({ pathname: "/rest/getPlaylist" }).href(),
              {
                params: asURLSearchParams({
                  ...authParamsPlusJson,
                  id: playlist.id,
                }),
                headers,
              }
            );
          });
        });
      });
    });

    describe("creating a playlist", () => {
      it("should create a playlist with the given name", async () => {
        const name = "ThePlaylist";
        const id = uuid();

        mockGET.mockImplementationOnce(() =>
          Promise.resolve(ok(createPlayListJson({ id, name })))
        );

        const result = await subsonic.createPlaylist(name);

        expect(result).toEqual({ id, name });

        expect(mockGET).toHaveBeenCalledWith(
          url.append({ pathname: "/rest/createPlaylist" }).href(),
          {
            params: asURLSearchParams({
              ...authParamsPlusJson,
              f: "json",
              name,
            }),
            headers,
          }
        );
      });
    });

    describe("deleting a playlist", () => {
      it("should delete the playlist by id", async () => {
        const id = "id-to-delete";

        mockGET.mockImplementationOnce(() => Promise.resolve(ok(EMPTY)));

        const result = await subsonic.deletePlaylist(id);

        expect(result).toEqual(true);

        expect(mockGET).toHaveBeenCalledWith(
          url.append({ pathname: "/rest/deletePlaylist" }).href(),
          {
            params: asURLSearchParams({
              ...authParamsPlusJson,
              id,
            }),
            headers,
          }
        );
      });
    });

    describe("editing playlists", () => {
      describe("adding a track to a playlist", () => {
        it("should add it", async () => {
          const playlistId = uuid();
          const trackId = uuid();

          mockGET.mockImplementationOnce(() => Promise.resolve(ok(EMPTY)));

          const result = await subsonic.addToPlaylist(playlistId, trackId);

          expect(result).toEqual(true);

          expect(mockGET).toHaveBeenCalledWith(
            url.append({ pathname: "/rest/updatePlaylist" }).href(),
            {
              params: asURLSearchParams({
                ...authParamsPlusJson,
                playlistId,
                songIdToAdd: trackId,
              }),
              headers,
            }
          );
        });
      });

      describe("removing a track from a playlist", () => {
        it("should remove it", async () => {
          const playlistId = uuid();
          const indicies = [6, 100, 33];

          mockGET.mockImplementationOnce(() => Promise.resolve(ok(EMPTY)));

          const result = await subsonic.removeFromPlaylist(
            playlistId,
            indicies
          );

          expect(result).toEqual(true);

          expect(mockGET).toHaveBeenCalledWith(
            url.append({ pathname: "/rest/updatePlaylist" }).href(),
            {
              params: asURLSearchParams({
                ...authParamsPlusJson,
                playlistId,
                songIndexToRemove: indicies,
              }),
              headers,
            }
          );
        });
      });
    });
  });

  describe("similarSongs", () => {
    beforeEach(() => {
      customPlayers.encodingFor.mockReturnValue(O.none);
    });

    describe("when there is one similar songs", () => {
      it("should return it", async () => {
        const id = "idWithTracks";
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
          album: album1,
          genre: pop,
        });

        mockGET
          .mockImplementationOnce(() =>
            Promise.resolve(ok(getSimilarSongsJson([track1])))
          );

        const result = await subsonic.similarSongs(id);

        expect(result).toEqual([trackToTrackSummary(track1)]);

        expect(mockGET).toHaveBeenCalledWith(
          url.append({ pathname: "/rest/getSimilarSongs2" }).href(),
          {
            params: asURLSearchParams({
              ...authParams,
              f: "json",
              id,
              count: 50,
            }),
            headers,
          }
        );
      });
    });

    describe("when there are similar songs", () => {
      it("should return them", async () => {
        const id = "idWithTracks";
        const pop = asGenre("Pop");

        const album1 = anAlbum({ id: "album1", name: "Burnin", genre: pop });
        const artist1 = anArtist({
          id: "artist1",
          name: "Bob Marley",
          albums: [album1],
        });

        const album2 = anAlbum({ id: "album2", name: "Walking", genre: pop });
        const artist2 = anArtist({
          id: "artist2",
          name: "Bob Jane",
          albums: [album2],
        });

        const track1 = aTrack({
          id: "track1",
          artist: artistToArtistSummary(artist1),
          album: albumToAlbumSummary(album1),
          genre: pop,
        });
        const track2 = aTrack({
          id: "track2",
          artist: artistToArtistSummary(artist2),
          album: albumToAlbumSummary(album2),
          genre: pop,
        });
        const track3 = aTrack({
          id: "track3",
          artist: artistToArtistSummary(artist1),
          album: albumToAlbumSummary(album1),
          genre: pop,
        });

        mockGET
          .mockImplementationOnce(() =>
            Promise.resolve(ok(getSimilarSongsJson([track1, track2, track3])))
          );

        const result = await subsonic.similarSongs(id);

        expect(result).toEqual([
          trackToTrackSummary(track1), 
          trackToTrackSummary(track2), 
          trackToTrackSummary(track3), 
        ]);

        expect(mockGET).toHaveBeenCalledWith(
          url.append({ pathname: "/rest/getSimilarSongs2" }).href(),
          {
            params: asURLSearchParams({
              ...authParams,
              f: "json",
              id,
              count: 50,
            }),
            headers,
          }
        );
      });
    });

    describe("when there are no similar songs", () => {
      it("should return []", async () => {
        const id = "idWithNoTracks";

        mockGET.mockImplementationOnce(() =>
          Promise.resolve(ok(getSimilarSongsJson([])))
        );

        const result = await subsonic.similarSongs(id);

        expect(result).toEqual([]);

        expect(mockGET).toHaveBeenCalledWith(
          url.append({ pathname: "/rest/getSimilarSongs2" }).href(),
          {
            params: asURLSearchParams({
              ...authParams,
              f: "json",
              id,
              count: 50,
            }),
            headers,
          }
        );
      });
    });

    describe("when the id doesnt exist", () => {
      it("should fail", async () => {
        const id = "idThatHasAnError";

        mockGET.mockImplementationOnce(() =>
          Promise.resolve(ok(error("70", "data not found")))
        );

        return expect(subsonic.similarSongs(id)).rejects.toEqual(
          "Subsonic error:data not found"
        );
      });
    });
  });

  describe("topSongs", () => {
    beforeEach(() => {
      customPlayers.encodingFor.mockReturnValue(O.none);
    });

    describe("when there is one top song", () => {
      it("should return it", async () => {
        const artistId = "bobMarleyId";
        const artistName = "Bob Marley";
        const pop = asGenre("Pop");

        const album1 = anAlbum({ name: "Burnin", genre: pop });
        const artist = anArtist({
          id: artistId,
          name: artistName,
          albums: [album1],
        });

        const track1 = aTrack({
          artist: artistToArtistSummary(artist),
          album: albumToAlbumSummary(album1),
          genre: pop,
        });

        mockGET
          .mockImplementationOnce(() =>
            Promise.resolve(ok(getArtistJson(artist)))
          )
          .mockImplementationOnce(() =>
            Promise.resolve(ok(getTopSongsJson([track1])))
          );

        const result = await subsonic.topSongs(artistId);

        expect(result).toEqual([
          trackToTrackSummary(track1)
        ]);

        expect(mockGET).toHaveBeenCalledWith(
          url.append({ pathname: "/rest/getTopSongs" }).href(),
          {
            params: asURLSearchParams({
              ...authParams,
              f: "json",
              artist: artistName,
              count: 50,
            }),
            headers,
          }
        );
      });
    });

    describe("when there are many top songs", () => {
      it("should return them", async () => {
        const artistId = "bobMarleyId";
        const artistName = "Bob Marley";

        const album1 = anAlbum({ name: "Burnin", genre: POP });
        const album2 = anAlbum({ name: "Churning", genre: POP });

        const artist = anArtist({
          id: artistId,
          name: artistName,
          albums: [album1, album2],
        });

        const track1 = aTrack({
          artist: artistToArtistSummary(artist),
          album: albumToAlbumSummary(album1),
          genre: POP,
        });

        const track2 = aTrack({
          artist: artistToArtistSummary(artist),
          album: albumToAlbumSummary(album2),
          genre: POP,
        });

        const track3 = aTrack({
          artist: artistToArtistSummary(artist),
          album: albumToAlbumSummary(album1),
          genre: POP,
        });

        mockGET
          .mockImplementationOnce(() =>
            Promise.resolve(ok(getArtistJson(artist)))
          )
          .mockImplementationOnce(() =>
            Promise.resolve(ok(getTopSongsJson([track1, track2, track3])))
          );

        const result = await subsonic.topSongs(artistId);

        expect(result).toEqual([
          trackToTrackSummary(track1), 
          trackToTrackSummary(track2), 
          trackToTrackSummary(track3), 
        ]);

        expect(mockGET).toHaveBeenCalledWith(
          url.append({ pathname: "/rest/getTopSongs" }).href(),
          {
            params: asURLSearchParams({
              ...authParams,
              f: "json",
              artist: artistName,
              count: 50,
            }),
            headers,
          }
        );
      });
    });

    describe("when there are no similar songs", () => {
      it("should return []", async () => {
        const artistId = "bobMarleyId";
        const artistName = "Bob Marley";
        const pop = asGenre("Pop");

        const album1 = anAlbum({ name: "Burnin", genre: pop });
        const artist = anArtist({
          id: artistId,
          name: artistName,
          albums: [album1],
        });

        mockGET
          .mockImplementationOnce(() =>
            Promise.resolve(ok(getArtistJson(artist)))
          )
          .mockImplementationOnce(() =>
            Promise.resolve(ok(getTopSongsJson([])))
          );

        const result = await subsonic.topSongs(artistId);

        expect(result).toEqual([]);

        expect(mockGET).toHaveBeenCalledWith(
          url.append({ pathname: "/rest/getTopSongs" }).href(),
          {
            params: asURLSearchParams({
              ...authParams,
              f: "json",
              artist: artistName,
              count: 50,
            }),
            headers,
          }
        );
      });
    });
  });

  describe("radioStations", () => {
    beforeEach(() => {
      customPlayers.encodingFor.mockReturnValue(O.none);
    });

    describe("when there some radio stations", () => {
      const station1 = aRadioStation();
      const station2 = aRadioStation();
      const station3 = aRadioStation();

      beforeEach(() => {
        mockGET.mockImplementationOnce(() =>
          Promise.resolve(
            ok(getRadioStationsJson([station1, station2, station3]))
          )
        );
      });

      describe("asking for all of them", () => {
        it("should return them all", async () => {
          const result = await subsonic.radioStations();

          expect(result).toEqual([station1, station2, station3]);

          expect(mockGET).toHaveBeenCalledWith(
            url.append({ pathname: "/rest/getInternetRadioStations" }).href(),
            {
              params: asURLSearchParams({
                ...authParams,
                f: "json",
              }),
              headers,
            }
          );
        });
      });

      describe("asking for one of them", () => {
        it("should return it", async () => {
          const result = await subsonic.radioStation(station2.id);

          expect(result).toEqual(station2);

          expect(mockGET).toHaveBeenCalledWith(
            url.append({ pathname: "/rest/getInternetRadioStations" }).href(),
            {
              params: asURLSearchParams({
                ...authParams,
                f: "json",
              }),
              headers,
            }
          );
        });
      });
    });

    describe("when there are no radio stations", () => {
      it("should return []", async () => {
        mockGET.mockImplementationOnce(() =>
          Promise.resolve(ok(getRadioStationsJson([])))
        );

        const result = await subsonic.radioStations();

        expect(result).toEqual([]);

        expect(mockGET).toHaveBeenCalledWith(
          url.append({ pathname: "/rest/getInternetRadioStations" }).href(),
          {
            params: asURLSearchParams({
              ...authParams,
              f: "json",
            }),
            headers,
          }
        );
      });
    });
  });
});
