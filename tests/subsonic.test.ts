import { Md5 } from "ts-md5";
import { v4 as uuid } from "uuid";
import tmp from "tmp";
import fse from "fs-extra";
import path from "path";
import {  pipe } from "fp-ts/lib/function";
import { option as O, taskEither as TE, task as T, either as E } from "fp-ts";

import {
  isValidImage,
  Subsonic,
  t,
  DODGY_IMAGE_NAME,
  asGenre,
  asURLSearchParams,
  cachingImageFetcher,
  asTrack,
  artistImageURN,
  images,
  song,
  PingResponse,
  parseToken,
  asToken,
  TranscodingCustomPlayers,
  CustomPlayers,
  NO_CUSTOM_PLAYERS,
  SubsonicMusicService,
  SubsonicMusicLibrary
} from "../src/subsonic";

import axios from "axios";
jest.mock("axios");

import sharp from "sharp";
jest.mock("sharp");

import randomstring from "randomstring";
jest.mock("randomstring");

import {
  Album,
  Artist,
  albumToAlbumSummary,
  asArtistAlbumPairs,
  Track,
  AlbumSummary,
  artistToArtistSummary,
  AlbumQuery,
  PlaylistSummary,
  Playlist,
  SimilarArtist,
  Credentials,
  AuthFailure,
  RadioStation
} from "../src/music_service";
import {
  aGenre,
  anAlbum,
  anArtist,
  aPlaylist,
  aPlaylistSummary,
  aSimilarArtist,
  aTrack,
  POP,
  ROCK,
  aRadioStation
} from "./builders";
import { b64Encode } from "../src/b64";
import { BUrn } from "../src/burn";
import { URLBuilder } from "../src/url_builder";

describe("t", () => {
  it("should be an md5 of the password and the salt", () => {
    const p = "password123";
    const s = "saltydog";
    expect(t(p, s)).toEqual(Md5.hashStr(`${p}${s}`));
  });
});

describe("isValidImage", () => {
  describe("when ends with 2a96cbd8b46e442fc41c2b86b821562f.png", () => {
    it("is dodgy", () => {
      expect(
        isValidImage("http://something/2a96cbd8b46e442fc41c2b86b821562f.png")
      ).toEqual(false);
    });
  });
  describe("when does not end with 2a96cbd8b46e442fc41c2b86b821562f.png", () => {
    it("is dodgy", () => {
      expect(isValidImage("http://something/somethingelse.png")).toEqual(true);
      expect(
        isValidImage(
          "http://something/2a96cbd8b46e442fc41c2b86b821562f.png?withsomequerystring=true"
        )
      ).toEqual(true);
    });
  });
});


describe("StreamClient(s)", () => {
  describe("CustomStreamClientApplications", () => {
    const customClients = TranscodingCustomPlayers.from("audio/flac,audio/mp3>audio/ogg")
  
    describe("clientFor", () => {
      describe("when there is a match", () => {
        it("should return the match", () => {
          expect(customClients.encodingFor({ mimeType: "audio/flac" })).toEqual(O.of({player: "bonob+audio/flac", mimeType:"audio/flac"}))
          expect(customClients.encodingFor({ mimeType: "audio/mp3" })).toEqual(O.of({player: "bonob+audio/mp3", mimeType:"audio/ogg"}))
        });
      });
  
      describe("when there is no match", () => {
        it("should return undefined", () => {
          expect(customClients.encodingFor({ mimeType: "audio/bob" })).toEqual(O.none)
        });
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
        d: true,
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
        b: "yippee",
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

describe("cachingImageFetcher", () => {
  const delegate = jest.fn();
  const url = "http://test.example.com/someimage.jpg";

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetAllMocks();
  });

  describe("when there is no image in the cache", () => {
    it("should fetch the image from the source and then cache and return it", async () => {
      const dir = tmp.dirSync();
      const cacheFile = path.join(dir.name, `${Md5.hashStr(url)}.png`);
      const jpgImage = Buffer.from("jpg-image", "utf-8");
      const pngImage = Buffer.from("png-image", "utf-8");

      delegate.mockResolvedValue({ contentType: "image/jpeg", data: jpgImage });
      const png = jest.fn();
      (sharp as unknown as jest.Mock).mockReturnValue({ png });
      png.mockReturnValue({
        toBuffer: () => Promise.resolve(pngImage),
      });

      const result = await cachingImageFetcher(dir.name, delegate)(url);

      expect(result!.contentType).toEqual("image/png");
      expect(result!.data).toEqual(pngImage);

      expect(delegate).toHaveBeenCalledWith(url);
      expect(fse.existsSync(cacheFile)).toEqual(true);
      expect(fse.readFileSync(cacheFile)).toEqual(pngImage);
    });
  });

  describe("when the image is already in the cache", () => {
    it("should fetch the image from the cache and return it", async () => {
      const dir = tmp.dirSync();
      const cacheFile = path.join(dir.name, `${Md5.hashStr(url)}.png`);
      const data = Buffer.from("foobar2", "utf-8");

      fse.writeFileSync(cacheFile, data);

      const result = await cachingImageFetcher(dir.name, delegate)(url);

      expect(result!.contentType).toEqual("image/png");
      expect(result!.data).toEqual(data);

      expect(delegate).not.toHaveBeenCalled();
    });
  });

  describe("when the delegate returns undefined", () => {
    it("should return undefined", async () => {
      const dir = tmp.dirSync();
      const cacheFile = path.join(dir.name, `${Md5.hashStr(url)}.png`);

      delegate.mockResolvedValue(undefined);

      const result = await cachingImageFetcher(dir.name, delegate)(url);

      expect(result).toBeUndefined();

      expect(delegate).toHaveBeenCalledWith(url);
      expect(fse.existsSync(cacheFile)).toEqual(false);
    });
  });
});

const ok = (data: string | object) => ({
  status: 200,
  data,
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

const getArtistInfoJson = (
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

const maybeIdFromCoverArtUrn = (coverArt: BUrn | undefined) => pipe(
  coverArt,
  O.fromNullable,
  O.map(it => it.resource.split(":")[1]),
  O.getOrElseW(() => "")
)

const asAlbumJson = (
  artist: { id: string | undefined; name: string | undefined },
  album: AlbumSummary,
  tracks: Track[] = []
) => ({
  id: album.id,
  parent: artist.id,
  isDir: "true",
  title: album.name,
  name: album.name,
  album: album.name,
  artist: artist.name,
  genre: album.genre?.name,
  coverArt: maybeIdFromCoverArtUrn(album.coverArt),
  duration: "123",
  playCount: "4",
  year: album.year,
  created: "2021-01-07T08:19:55.834207205Z",
  artistId: artist.id,
  songCount: "19",
  isVideo: false,
  song: tracks.map(asSongJson),
});

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

const getAlbumListJson = (albums: [Artist, Album][]) =>
  subsonicOK({
    albumList2: {
      album: albums.map(([artist, album]) => asAlbumJson(artist, album)),
    },
  });

type ArtistExtras = { artistImageUrl: string | undefined }

const asArtistJson = (
  artist: Artist,
  extras: ArtistExtras = { artistImageUrl: undefined }
) => ({
  id: artist.id,
  name: artist.name,
  albumCount: artist.albums.length,
  album: artist.albums.map((it) => asAlbumJson(artist, it)),
  ...extras,
});

const getArtistJson = (artist: Artist, extras: ArtistExtras = { artistImageUrl: undefined }) =>
  subsonicOK({
    artist: asArtistJson(artist, extras),
  });

const getRadioStationsJson = (radioStations: RadioStation[]) =>
  subsonicOK({
    internetRadioStations: {
      internetRadioStation: radioStations.map((it) => ({
        id: it.id,
        name: it.name,
        streamUrl: it.url,
        homePageUrl: it.homePage
      }))
    },
  });

const asGenreJson = (genre: { name: string; albumCount: number }) => ({
  songCount: 1475,
  albumCount: genre.albumCount,
  value: genre.name,
});

const getGenresJson = (genres: { name: string; albumCount: number }[]) =>
  subsonicOK({
    genres: {
      genre: genres.map(asGenreJson),
    },
  });

const getAlbumJson = (artist: Artist, album: Album, tracks: Track[]) =>
  subsonicOK({ album: asAlbumJson(artist, album, tracks) });

const getSongJson = (track: Track) => subsonicOK({ song: asSongJson(track) });

// const getStarredJson = ({ albums }: { albums: Album[] }) => subsonicOK({starred2: {
//   album: albums.map(it => asAlbumJson({ id: it.artistId, name: it.artistName }, it, [])),
//   song: [],
// }})

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

export type ArtistWithAlbum = {
  artist: Artist;
  album: Album;
};

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
      artist: (artists || []).map((it) => asArtistJson({ ...it, albums: [] })),
      album: (albums || []).map((it) => asAlbumJson(it.artist, it.album, [])),
      song: (tracks || []).map((it) => asSongJson(it)),
    },
  });

const asArtistsJson = (artists: Artist[]) => {
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

const error = (code: string, message: string) => ({
  "subsonic-response": {
    status: "failed",
    version: "1.16.1",
    type: "subsonic",
    serverVersion: "0.45.1 (c55e6590)",
    error: { code, message },
  },
});

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



const pingJson = (pingResponse: Partial<PingResponse> = {}) => ({
  "subsonic-response": {
    status: "ok",
    version: "1.16.1",
    type: "subsonic",
    serverVersion: "0.45.1 (c55e6590)",
    ...pingResponse
  }
})

const PING_OK = pingJson({ status: "ok" });

describe("artistURN", () => {
  describe("when artist URL is", () => {
    describe("a valid external URL", () => {
      it("should return an external URN", () => {
        expect(
          artistImageURN({ artistId: "someArtistId", artistImageURL: "http://example.com/image.jpg" })
        ).toEqual({ system: "external", resource: "http://example.com/image.jpg" });
      });
    });

    describe("an invalid external URL", () => {
      describe("and artistId is valid", () => {
        it("should return an external URN", () => {
          expect(
            artistImageURN({
              artistId: "someArtistId",
              artistImageURL: `http://example.com/${DODGY_IMAGE_NAME}`
            })
          ).toEqual({ system: "subsonic", resource: "art:someArtistId" });
        });
      });

      describe("and artistId is -1", () => {
        it("should return an error icon urn", () => {
          expect(
            artistImageURN({
              artistId: "-1",
              artistImageURL: `http://example.com/${DODGY_IMAGE_NAME}`
            })
          ).toBeUndefined();
        });
      });

      describe("and artistId is undefined", () => {
        it("should return an error icon urn", () => {
          expect(
            artistImageURN({
              artistId: undefined,
              artistImageURL: `http://example.com/${DODGY_IMAGE_NAME}`
            })
          ).toBeUndefined();
        });
      });
    });

    describe("undefined", () => {
      describe("and artistId is valid", () => {
        it("should return artist art by artist id URN", () => {
          expect(artistImageURN({ artistId: "someArtistId", artistImageURL: undefined })).toEqual({system:"subsonic", resource:"art:someArtistId"});
        });
      });

      describe("and artistId is -1", () => {
        it("should return error icon", () => {
          expect(artistImageURN({ artistId: "-1", artistImageURL: undefined })).toBeUndefined();
        });
      });

      describe("and artistId is undefined", () => {
        it("should return error icon", () => {
          expect(artistImageURN({ artistId: undefined, artistImageURL: undefined })).toBeUndefined();
        });
      });
    });
  });
});

describe("asTrack", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetAllMocks();
  });

  describe("when the song has no artistId", () => {
    const album = anAlbum();
    const track = aTrack({ artist: { id: undefined, name: "Not in library so no id", image: undefined }});

    it("should provide no artistId", () => {
      const result = asTrack(album, { ...asSongJson(track) }, NO_CUSTOM_PLAYERS);
      expect(result.artist.id).toBeUndefined();
      expect(result.artist.name).toEqual("Not in library so no id");
      expect(result.artist.image).toBeUndefined();
    });
  });

  describe("when the song has no artist name", () => {
    const album = anAlbum();

    it("should provide a ? to sonos", () => {
      const result = asTrack(album, { id: '1' } as any as song, NO_CUSTOM_PLAYERS);
      expect(result.artist.id).toBeUndefined();
      expect(result.artist.name).toEqual("?");
      expect(result.artist.image).toBeUndefined();
    });
  });

  describe("invalid rating.stars values", () => {
    const album = anAlbum();
    const track = aTrack();

    describe("a value greater than 5", () => {
      it("should be returned as 0", () => {
        const result = asTrack(album, { ...asSongJson(track), userRating: 6 }, NO_CUSTOM_PLAYERS);
        expect(result.rating.stars).toEqual(0);
      });
    });

    describe("a value less than 0", () => {
      it("should be returned as 0", () => {
        const result = asTrack(album, { ...asSongJson(track), userRating: -1 }, NO_CUSTOM_PLAYERS);
        expect(result.rating.stars).toEqual(0);
      });
    });
  });

  describe("content types", () => {
    const album = anAlbum();
    const track = aTrack();

    describe("when there are no custom players", () => {
      describe("when subsonic reports no transcodedContentType", () => {
        it("should use the default client and default contentType", () => {
          const result = asTrack(album, { 
            ...asSongJson(track),
            contentType: "nonTranscodedContentType",
            transcodedContentType: undefined 
          }, NO_CUSTOM_PLAYERS);

          expect(result.encoding).toEqual({ player: "bonob", mimeType: "nonTranscodedContentType" })
        });
      });

      describe("when subsonic reports a transcodedContentType", () => {
        it("should use the default client and transcodedContentType", () => {
          const result = asTrack(album, { 
            ...asSongJson(track),
            contentType: "nonTranscodedContentType",
            transcodedContentType: "transcodedContentType" 
          }, NO_CUSTOM_PLAYERS);

          expect(result.encoding).toEqual({ player: "bonob", mimeType: "transcodedContentType" })
        });
      });
    });

    describe("when there are custom players registered", () => {
      const streamClient = {
        encodingFor: jest.fn()
      }

      describe("however no player is found for the default mimeType", () => {
        describe("and there is no transcodedContentType", () => {
          it("should use the default player with the default content type", () => {
            streamClient.encodingFor.mockReturnValue(O.none)

            const result = asTrack(album, { 
              ...asSongJson(track),
              contentType: "nonTranscodedContentType",
              transcodedContentType: undefined 
            },  streamClient as unknown as CustomPlayers);
  
            expect(result.encoding).toEqual({ player: "bonob", mimeType: "nonTranscodedContentType" });
            expect(streamClient.encodingFor).toHaveBeenCalledWith({ mimeType: "nonTranscodedContentType" });
          });
        });

        describe("and there is a transcodedContentType", () => {
          it("should use the default player with the transcodedContentType", () => {
            streamClient.encodingFor.mockReturnValue(O.none)

            const result = asTrack(album, { 
              ...asSongJson(track),
              contentType: "nonTranscodedContentType",
              transcodedContentType: "transcodedContentType1" 
            },  streamClient as unknown as CustomPlayers);
  
            expect(result.encoding).toEqual({ player: "bonob", mimeType: "transcodedContentType1" });
            expect(streamClient.encodingFor).toHaveBeenCalledWith({ mimeType: "nonTranscodedContentType" });
          });
        });
      });

      describe("there is a player with the matching content type", () => {
        it("should use it", () => {
          const customEncoding = { player: "custom-player", mimeType: "audio/some-mime-type" };
          streamClient.encodingFor.mockReturnValue(O.of(customEncoding));
    
          const result = asTrack(album, { 
            ...asSongJson(track), 
            contentType: "sourced-from/subsonic", 
            transcodedContentType: "sourced-from/subsonic2" 
          }, streamClient as unknown as CustomPlayers);
    
          expect(result.encoding).toEqual(customEncoding);
          expect(streamClient.encodingFor).toHaveBeenCalledWith({ mimeType: "sourced-from/subsonic" });
        });    
      });
    });
  });
});

describe("SubsonicMusicService", () => {
  const url = new URLBuilder("http://127.0.0.22:4567/some-context-path");
  const username = `user1-${uuid()}`;
  const password = `pass1-${uuid()}`;
  const salt = "saltysalty";

  const customPlayers = {
    encodingFor: jest.fn()
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


  const tokenFor = (credentials: Credentials) => pipe(
    subsonic.generateToken(credentials),
    TE.fold(e => { throw e }, T.of)
  )


  describe("generateToken", () => {
    describe("when the credentials are valid", () => {
      describe("when the backend is generic subsonic", () => {
        it("should be able to generate a token and then login using it", async () => {
          (axios.get as jest.Mock).mockResolvedValue(ok(PING_OK));
  
          const token = await tokenFor({
            username,
            password,
          })()
  
          expect(token.serviceToken).toBeDefined();
          expect(token.nickname).toEqual(username);
          expect(token.userId).toEqual(username);
  
          expect(parseToken(token.serviceToken)).toEqual({ username, password, type: PING_OK["subsonic-response"].type })
  
          expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/ping.view' }).href(), {
            params: asURLSearchParams(authParamsPlusJson),
            headers,
          });
        });

        it("should store the type of the subsonic server on the token", async () => {
          const type = "someSubsonicClone";
          (axios.get as jest.Mock).mockResolvedValue(ok(pingJson({ type })));
  
          const token = await tokenFor({
            username,
            password,
          })()
  
          expect(token.serviceToken).toBeDefined();
          expect(token.nickname).toEqual(username);
          expect(token.userId).toEqual(username);
  
          expect(parseToken(token.serviceToken)).toEqual({ username, password, type })
  
          expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/ping.view' }).href(), {
            params: asURLSearchParams(authParamsPlusJson),
            headers,
          });
        });
      });

      describe("when the backend is navidrome", () => {
        it("should login to nd and get the nd bearer token", async () => {
          const navidromeToken = `nd-${uuid()}`;

          (axios.get as jest.Mock).mockResolvedValue(ok(pingJson({ type: "navidrome" })));
          (axios.post as jest.Mock).mockResolvedValue(ok({ token: navidromeToken }));
  
          const token = await tokenFor({
            username,
            password,
          })()
  
          expect(token.serviceToken).toBeDefined();
          expect(token.nickname).toEqual(username);
          expect(token.userId).toEqual(username);
  
          expect(parseToken(token.serviceToken)).toEqual({ username, password, type: "navidrome", bearer: navidromeToken })
  
          expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/ping.view' }).href(), {
            params: asURLSearchParams(authParamsPlusJson),
            headers,
          });
          expect(axios.post).toHaveBeenCalledWith(url.append({ pathname: '/auth/login' }).href(), {
            username,
            password,
          });
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
        expect(token).toEqual(E.left(new AuthFailure("Subsonic error:Wrong username or password")));
      });
    });
  });

  describe("refreshToken", () => {
    describe("when the credentials are valid", () => {
      describe("when the backend is generic subsonic", () => {
        it("should be able to generate a token and then login using it", async () => {
          const type = `subsonic-clone-${uuid()}`;
          (axios.get as jest.Mock).mockResolvedValue(ok(pingJson({ type })));
  
          const credentials = { username, password, type: "foo", bearer: undefined };
          const originalToken = asToken(credentials)

          const refreshedToken = await pipe(
            subsonic.refreshToken(originalToken),
            TE.fold(e => { throw e }, T.of)
          )();
  
          expect(refreshedToken.serviceToken).toBeDefined();
          expect(refreshedToken.nickname).toEqual(credentials.username);
          expect(refreshedToken.userId).toEqual(credentials.username);
  
          expect(parseToken(refreshedToken.serviceToken)).toEqual({ username, password, type })
  
          expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/ping.view' }).href(), {
            params: asURLSearchParams(authParamsPlusJson),
            headers,
          });
        });
      });

      describe("when the backend is navidrome", () => {
        it("should login to nd and get the nd bearer token", async () => {
          const navidromeToken = `nd-${uuid()}`;

          (axios.get as jest.Mock).mockResolvedValue(ok(pingJson({ type: "navidrome" })));
          (axios.post as jest.Mock).mockResolvedValue(ok({ token: navidromeToken }));
  
          const credentials = { username, password, type: "navidrome", bearer: undefined };
          const originalToken = asToken(credentials)

          const refreshedToken = await pipe(
            subsonic.refreshToken(originalToken),
            TE.fold(e => { throw e }, T.of)
          )();
  
          expect(refreshedToken.serviceToken).toBeDefined();
          expect(refreshedToken.nickname).toEqual(username);
          expect(refreshedToken.userId).toEqual(username);
  
          expect(parseToken(refreshedToken.serviceToken)).toEqual({ username, password, type: "navidrome", bearer: navidromeToken })
  
          expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/ping.view' }).href(), {
            params: asURLSearchParams(authParamsPlusJson),
            headers,
          });
          expect(axios.post).toHaveBeenCalledWith(url.append({ pathname: '/auth/login' }).href(), {
            username,
            password,
          });
        });
      });
    });

    describe("when the credentials are not valid", () => {
      it("should be able to generate a token and then login using it", async () => {
        (axios.get as jest.Mock).mockResolvedValue({
          status: 200,
          data: error("40", "Wrong username or password"),
        });

        const credentials = { username, password, type: "foo", bearer: undefined };
        const originalToken = asToken(credentials)

        const token = await subsonic.refreshToken(originalToken)();
        expect(token).toEqual(E.left(new AuthFailure("Subsonic error:Wrong username or password")));
      });
    });
  });

  describe("login", () => {
    describe("when the token is for generic subsonic", () => {
      it("should return a subsonic client", async () => {
        const client = await subsonic.login(asToken({ username: "foo", password: "bar", type: "subsonic", bearer: undefined }));
        expect(client.flavour()).toEqual("subsonic");
      });
    });

    describe("when the token is for navidrome", () => {
      it("should return a navidrome client", async () => {
        const client = await subsonic.login(asToken({ username: "foo", password: "bar", type: "navidrome", bearer: undefined }));
        expect(client.flavour()).toEqual("navidrome");
      });
    });

    describe("when the token is for gonic", () => {
      it("should return a subsonic client", async () => {
        const client = await subsonic.login(asToken({ username: "foo", password: "bar", type: "gonic", bearer: undefined }));
        expect(client.flavour()).toEqual("subsonic");
      });
    });
  });

  describe("bearerToken", () => {
    describe("when flavour is generic subsonic", () => {
      it("should return undefined", async () => {
        const credentials = { username: "foo", password: "bar" };
        const token = { ...credentials, type: "subsonic", bearer: undefined  }
        const client = await subsonic.login(asToken(token));
        
        const bearerToken = await pipe(client.bearerToken(credentials))();
        expect(bearerToken).toStrictEqual(E.right(undefined));
      });
    });

    describe("when flavour is navidrome", () => {
      it("should get a bearerToken from navidrome", async () => {
        const credentials = { username: "foo", password: "bar" };
        const token = { ...credentials, type: "navidrome", bearer: undefined  }
        const client = await subsonic.login(asToken(token));

        mockPOST.mockImplementationOnce(() => Promise.resolve(ok({ token: 'theBearerToken' })))
        
        const bearerToken = await pipe(client.bearerToken(credentials))();
        expect(bearerToken).toStrictEqual(E.right('theBearerToken'));

        expect(axios.post).toHaveBeenCalledWith(url.append({ pathname: '/auth/login' }).href(), credentials)
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
    encodingFor: jest.fn()
  };
  
  const subsonic = new SubsonicMusicLibrary(
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


  describe("getting genres", () => {
    describe("when there are none", () => {
      beforeEach(() => {
        mockGET
          .mockImplementationOnce(() => Promise.resolve(ok(getGenresJson([]))));
      });

      it("should return empty array", async () => {
        const result = await subsonic.genres();

        expect(result).toEqual([]);

        expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getGenres' }).href(), {
          params: asURLSearchParams(authParamsPlusJson),
          headers,
        });
      });
    });

    describe("when there is only 1 that has an albumCount > 0", () => {
      const genres = [
        { name: "genre1", albumCount: 1 },
        { name: "genreWithNoAlbums", albumCount: 0 },
      ];

      beforeEach(() => {
        mockGET
          .mockImplementationOnce(() =>
            Promise.resolve(ok(getGenresJson(genres)))
          );
      });

      it("should return them alphabetically sorted", async () => {
        const result = await subsonic.genres();

        expect(result).toEqual([{ id: b64Encode("genre1"), name: "genre1" }]);

        expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getGenres' }).href(), {
          params: asURLSearchParams(authParamsPlusJson),
          headers,
        });
      });
    });

    describe("when there are many that have an albumCount > 0", () => {
      const genres = [
        { name: "g1", albumCount: 1 },
        { name: "g2", albumCount: 1 },
        { name: "g3", albumCount: 1 },
        { name: "g4", albumCount: 1 },
        { name: "someGenreWithNoAlbums", albumCount: 0 },
      ];

      beforeEach(() => {
        mockGET
          .mockImplementationOnce(() =>
            Promise.resolve(ok(getGenresJson(genres)))
          );
      });

      it("should return them alphabetically sorted", async () => {
        const result = await subsonic.genres();

        expect(result).toEqual([
          { id: b64Encode("g1"), name: "g1" },
          { id: b64Encode("g2"), name: "g2" },
          { id: b64Encode("g3"), name: "g3" },
          { id: b64Encode("g4"), name: "g4" },
        ]);

        expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getGenres' }).href(), {
          params: asURLSearchParams(authParamsPlusJson),
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
          similarArtists: [
            aSimilarArtist({
              id: "similar1.id",
              name: "similar1",
              inLibrary: true,
            }),
            aSimilarArtist({ id: "-1", name: "similar2", inLibrary: false }),
            aSimilarArtist({
              id: "similar3.id",
              name: "similar3",
              inLibrary: true,
            }),
            aSimilarArtist({ id: "-1", name: "similar4", inLibrary: false }),
          ],
        });

        beforeEach(() => {
          mockGET
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getArtistJson(artist)))
            )
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getArtistInfoJson(artist)))
            );
        });

        it("should return the similar artists", async () => {
          const result: Artist = await subsonic.artist(artist.id!);

          expect(result).toEqual({
            id: `${artist.id}`,
            name: artist.name,
            image: { system:"subsonic", resource:`art:${artist.id}` },
            albums: artist.albums,
            similarArtists: artist.similarArtists,
          });

          expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getArtist' }).href(), {
            params: asURLSearchParams({
              ...authParamsPlusJson,
              id: artist.id,
            }),
            headers,
          });

          expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getArtistInfo2' }).href(), {
            params: asURLSearchParams({
              ...authParamsPlusJson,
              id: artist.id,
              count: 50,
              includeNotPresent: true,
            }),
            headers,
          });
        });
      });

      describe("and has one similar artist", () => {
        const album1: Album = anAlbum({ genre: asGenre("G1") });

        const album2: Album = anAlbum({ genre: asGenre("G2") });

        const artist: Artist = anArtist({
          albums: [album1, album2],
          similarArtists: [
            aSimilarArtist({
              id: "similar1.id",
              name: "similar1",
              inLibrary: true,
            }),
          ],
        });

        beforeEach(() => {
          mockGET
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getArtistJson(artist)))
            )
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getArtistInfoJson(artist)))
            );
        });

        it("should return the similar artists", async () => {
          const result: Artist = await subsonic.artist(artist.id!);

          expect(result).toEqual({
            id: artist.id,
            name: artist.name,
            image: { system:"subsonic", resource:`art:${artist.id}` },
            albums: artist.albums,
            similarArtists: artist.similarArtists,
          });

          expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getArtist' }).href(), {
            params: asURLSearchParams({
              ...authParamsPlusJson,
              id: artist.id,
            }),
            headers,
          });

          expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getArtistInfo2' }).href(), {
            params: asURLSearchParams({
              ...authParamsPlusJson,
              id: artist.id,
              count: 50,
              includeNotPresent: true,
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
          similarArtists: [],
        });

        beforeEach(() => {
          mockGET
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getArtistJson(artist)))
            )
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getArtistInfoJson(artist)))
            );
        });

        it("should return the similar artists", async () => {
          const result: Artist = await subsonic.artist(artist.id!);

          expect(result).toEqual({
            id: artist.id,
            name: artist.name,
            image: { system:"subsonic", resource: `art:${artist.id}` },
            albums: artist.albums,
            similarArtists: artist.similarArtists,
          });

          expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getArtist' }).href(), {
            params: asURLSearchParams({
              ...authParamsPlusJson,
              id: artist.id,
            }),
            headers,
          });

          expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getArtistInfo2' }).href(), {
            params: asURLSearchParams({
              ...authParamsPlusJson,
              id: artist.id,
              count: 50,
              includeNotPresent: true,
            }),
            headers,
          });
        });
      });

      describe("and has dodgy looking artist image uris", () => {
        const artist: Artist = anArtist({
          albums: [],
          similarArtists: [],
        });

        const dodgyImageUrl = `http://localhost:1234/${DODGY_IMAGE_NAME}`;

        beforeEach(() => {
          mockGET
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getArtistJson(artist, { artistImageUrl: dodgyImageUrl })))
            )
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getArtistInfoJson(artist, { smallImageUrl: dodgyImageUrl, mediumImageUrl: dodgyImageUrl, largeImageUrl: dodgyImageUrl})))
            );
        });

        it("should return remove the dodgy looking image uris and return urn for artist:id", async () => {
          const result: Artist = await subsonic.artist(artist.id!);

          expect(result).toEqual({
            id: artist.id,
            name: artist.name,
            image: {
              system: "subsonic",
              resource: `art:${artist.id}`,
            },
            albums: artist.albums,
            similarArtists: [],
          });

          expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getArtist' }).href(), {
            params: asURLSearchParams({
              ...authParamsPlusJson,
              id: artist.id,
            }),
            headers,
          });

          expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getArtistInfo2' }).href(), {
            params: asURLSearchParams({
              ...authParamsPlusJson,
              id: artist.id,
              count: 50,
              includeNotPresent: true,
            }),
            headers,
          });
        });
      });

      describe("and has a good external image uri from getArtist route", () => {
        const artist: Artist = anArtist({
          albums: [],
          similarArtists: [],
        });

        const dodgyImageUrl = `http://localhost:1234/${DODGY_IMAGE_NAME}`;

        beforeEach(() => {
          mockGET
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getArtistJson(artist, { artistImageUrl: 'http://example.com:1234/good/looking/image.png' })))
            )
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getArtistInfoJson(artist, { smallImageUrl: dodgyImageUrl, mediumImageUrl: dodgyImageUrl, largeImageUrl: dodgyImageUrl })))
            );
        });

        it("should use the external url", async () => {
          const result: Artist = await subsonic.artist(artist.id!);

          expect(result).toEqual({
            id: artist.id,
            name: artist.name,
            image: { system: "external", resource: 'http://example.com:1234/good/looking/image.png' },
            albums: artist.albums,
            similarArtists: [],
          });

          expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getArtist' }).href(), {
            params: asURLSearchParams({
              ...authParamsPlusJson,
              id: artist.id,
            }),
            headers,
          });

          expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getArtistInfo2' }).href(), {
            params: asURLSearchParams({
              ...authParamsPlusJson,
              id: artist.id,
              count: 50,
              includeNotPresent: true,
            }),
            headers,
          });
        });
      });      

      describe("and has a good large external image uri from getArtistInfo route", () => {
        const artist: Artist = anArtist({
          albums: [],
          similarArtists: [],
        });

        const dodgyImageUrl = `http://localhost:1234/${DODGY_IMAGE_NAME}`;

        beforeEach(() => {
          mockGET
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getArtistJson(artist, { artistImageUrl: dodgyImageUrl })))
            )
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getArtistInfoJson(artist, { smallImageUrl: dodgyImageUrl, mediumImageUrl: dodgyImageUrl, largeImageUrl: 'http://example.com:1234/good/large/image.png' })))
            );
        });

        it("should use the external url", async () => {
          const result: Artist = await subsonic.artist(artist.id!);

          expect(result).toEqual({
            id: artist.id,
            name: artist.name,
            image: { system: "external", resource: 'http://example.com:1234/good/large/image.png' },
            albums: artist.albums,
            similarArtists: [],
          });

          expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getArtist' }).href(), {
            params: asURLSearchParams({
              ...authParamsPlusJson,
              id: artist.id,
            }),
            headers,
          });

          expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getArtistInfo2' }).href(), {
            params: asURLSearchParams({
              ...authParamsPlusJson,
              id: artist.id,
              count: 50,
              includeNotPresent: true,
            }),
            headers,
          });
        });
      });   
      

      describe("and has a good medium external image uri from getArtistInfo route", () => {
        const artist: Artist = anArtist({
          albums: [],
          similarArtists: [],
        });

        const dodgyImageUrl = `http://localhost:1234/${DODGY_IMAGE_NAME}`;

        beforeEach(() => {
          mockGET
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getArtistJson(artist, { artistImageUrl: dodgyImageUrl })))
            )
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getArtistInfoJson(artist, { smallImageUrl: dodgyImageUrl, mediumImageUrl: 'http://example.com:1234/good/medium/image.png', largeImageUrl: dodgyImageUrl })))
            );
        });

        it("should use the external url", async () => {
          const result: Artist = await subsonic.artist(artist.id!);

          expect(result).toEqual({
            id: artist.id,
            name: artist.name,
            image: { system:"external", resource: 'http://example.com:1234/good/medium/image.png' },
            albums: artist.albums,
            similarArtists: [],
          });

          expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getArtist' }).href(), {
            params: asURLSearchParams({
              ...authParamsPlusJson,
              id: artist.id,
            }),
            headers,
          });

          expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getArtistInfo2' }).href(), {
            params: asURLSearchParams({
              ...authParamsPlusJson,
              id: artist.id,
              count: 50,
              includeNotPresent: true,
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
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getArtistJson(artist)))
            )
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getArtistInfoJson(artist)))
            );
        });

        it("should return it", async () => {
          const result: Artist = await subsonic.artist(artist.id!);

          expect(result).toEqual({
            id: artist.id,
            name: artist.name,
            image: artist.image,
            albums: artist.albums,
            similarArtists: [],
          });

          expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getArtist' }).href(), {
            params: asURLSearchParams({
              ...authParamsPlusJson,
              id: artist.id,
            }),
            headers,
          });

          expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getArtistInfo2' }).href(), {
            params: asURLSearchParams({
              ...authParamsPlusJson,
              id: artist.id,
              count: 50,
              includeNotPresent: true,
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
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getArtistJson(artist)))
            )
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getArtistInfoJson(artist)))
            );
        });

        it("should return it", async () => {
          const result: Artist = await subsonic.artist(artist.id!);

          expect(result).toEqual({
            id: artist.id,
            name: artist.name,
            image: artist.image,
            albums: artist.albums,
            similarArtists: [],
          });

          expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getArtist' }).href(), {
            params: asURLSearchParams({
              ...authParamsPlusJson,
              id: artist.id,
            }),
            headers,
          });

          expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getArtistInfo2' }).href(), {
            params: asURLSearchParams({
              ...authParamsPlusJson,
              id: artist.id,
              count: 50,
              includeNotPresent: true,
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
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getArtistJson(artist)))
            )
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getArtistInfoJson(artist)))
            );
        });

        it("should return it", async () => {
          const result: Artist = await subsonic.artist(artist.id!);

          expect(result).toEqual({
            id: artist.id,
            name: artist.name,
            image: artist.image,
            albums: [],
            similarArtists: [],
          });

          expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getArtist' }).href(), {
            params: asURLSearchParams({
              ...authParamsPlusJson,
              id: artist.id,
            }),
            headers,
          });

          expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getArtistInfo2' }).href(), {
            params: asURLSearchParams({
              ...authParamsPlusJson,
              id: artist.id,
              count: 50,
              includeNotPresent: true,
            }),
            headers,
          });
        });
      });
    });
  });

  describe("getting artists", () => {
    describe("when there are indexes, but no artists", () => {
      beforeEach(() => {
        mockGET
          .mockImplementationOnce(() =>
            Promise.resolve(
              ok(
                subsonicOK({
                  artists: {
                    index: [
                      {
                        name: "#",
                      },
                      {
                        name: "A",
                      },
                      {
                        name: "B",
                      },
                    ],
                  },
                })
              )
            )
          );
      });

      it("should return empty", async () => {
        const artists = await subsonic.artists({ _index: 0, _count: 100 });

        expect(artists).toEqual({
          results: [],
          total: 0,
        });
      });
    });

    describe("when there no indexes and no artists", () => {
      beforeEach(() => {
        mockGET
          .mockImplementationOnce(() =>
            Promise.resolve(
              ok(
                subsonicOK({
                  artists: {},
                })
              )
            )
          );
      });

      it("should return empty", async () => {
        const artists = await subsonic.artists({ _index: 0, _count: 100 });

        expect(artists).toEqual({
          results: [],
          total: 0,
        });
      });
    });

    describe("when there is one index and one artist", () => {
      const artist1 = anArtist({albums:[anAlbum(), anAlbum(), anAlbum(), anAlbum()]});

      const asArtistsJson = subsonicOK({
        artists: {
          index: [
            {
              name: "#",
              artist: [
                {
                  id: artist1.id,
                  name: artist1.name,
                  albumCount: artist1.albums.length,
                },
              ],
            },
          ],
        },
      });

      describe("when it all fits on one page", () => {
        beforeEach(() => {
          mockGET
            .mockImplementationOnce(() => Promise.resolve(ok(asArtistsJson)));
        });

        it("should return the single artist", async () => {
          const artists = await subsonic.artists({ _index: 0, _count: 100 });

          const expectedResults = [{
            id: artist1.id,
            image: artist1.image,
            name: artist1.name,
          }];

          expect(artists).toEqual({
            results: expectedResults,
            total: 1,
          });

          expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getArtists' }).href(), {
            params: asURLSearchParams(authParamsPlusJson),
            headers,
          });
        });
      });
    });

    describe("when there are artists", () => {
      const artist1 = anArtist({ name: "A Artist", albums:[anAlbum()] });
      const artist2 = anArtist({ name: "B Artist" });
      const artist3 = anArtist({ name: "C Artist" });
      const artist4 = anArtist({ name: "D Artist" });
      const artists = [artist1, artist2, artist3, artist4];

      describe("when no paging is in effect", () => {
        beforeEach(() => {
          mockGET
            .mockImplementationOnce(() =>
              Promise.resolve(ok(asArtistsJson(artists)))
            );
        });

        it("should return all the artists", async () => {
          const artists = await subsonic.artists({ _index: 0, _count: 100 });

          const expectedResults = [artist1, artist2, artist3, artist4].map(
            (it) => ({
              id: it.id,
              image: it.image,
              name: it.name,
            })
          );

          expect(artists).toEqual({
            results: expectedResults,
            total: 4,
          });

          expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getArtists' }).href(), {
            params: asURLSearchParams(authParamsPlusJson),
            headers,
          });
        });
      });

      describe("when paging specified", () => {
        beforeEach(() => {
          mockGET
            .mockImplementationOnce(() =>
              Promise.resolve(ok(asArtistsJson(artists)))
            );
        });

        it("should return only the correct page of artists", async () => {
          const artists = await subsonic.artists({ _index: 1, _count: 2 });

          const expectedResults = [artist2, artist3].map((it) => ({
            id: it.id,
            image: it.image,
            name: it.name,
          }));

          expect(artists).toEqual({ results: expectedResults, total: 4 });

          expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getArtists' }).href(), {
            params: asURLSearchParams(authParamsPlusJson),
            headers,
          });
        });
      });
    });
  });

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

          expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getArtists' }).href(), {
            params: asURLSearchParams(authParamsPlusJson),
            headers,
          });

          expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getAlbumList2' }).href(), {
            params: asURLSearchParams({
              ...authParamsPlusJson,
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

          expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getArtists' }).href(), {
            params: asURLSearchParams(authParamsPlusJson),
            headers,
          });

          expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getAlbumList2' }).href(), {
            params: asURLSearchParams({
              ...authParamsPlusJson,
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

          expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getArtists' }).href(), {
            params: asURLSearchParams(authParamsPlusJson),
            headers,
          });

          expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getAlbumList2' }).href(), {
            params: asURLSearchParams({
              ...authParamsPlusJson,
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

          expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getArtists' }).href(), {
            params: asURLSearchParams(authParamsPlusJson),
            headers,
          });

          expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getAlbumList2' }).href(), {
            params: asURLSearchParams({
              ...authParamsPlusJson,
              type: "frequent",
              size: 500,
              offset: 0,
            }),
            headers,
          });
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

          expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getArtists' }).href(), {
            params: asURLSearchParams(authParamsPlusJson),
            headers,
          });

          expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getAlbumList2' }).href(), {
            params: asURLSearchParams({
              ...authParamsPlusJson,
              type: "highest",
              size: 500,
              offset: 0,
            }),
            headers,
          });
        });
      });
    });

    describe("when the artist has only 1 album", () => {
      const artist = anArtist({
        name: "one hit wonder",
        albums: [anAlbum({ genre: asGenre("Pop") })],
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

        expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getArtists' }).href(), {
          params: asURLSearchParams(authParamsPlusJson),
          headers,
        });

        expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getAlbumList2' }).href(), {
          params: asURLSearchParams({
            ...authParamsPlusJson,
            type: "alphabeticalByArtist",
            size: 500,
            offset: 0,
          }),
          headers,
        });
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

        expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getArtists' }).href(), {
          params: asURLSearchParams(authParamsPlusJson),
          headers,
        });

        expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getAlbumList2' }).href(), {
          params: asURLSearchParams({
            ...authParamsPlusJson,
            type: "alphabeticalByArtist",
            size: 500,
            offset: 0,
          }),
          headers,
        });
      });
    });

    describe("when there are 6 albums in total", () => {
      const genre1 = asGenre("genre1");
      const genre2 = asGenre("genre2");
      const genre3 = asGenre("genre3");

      const artist1 = anArtist({
        name: "abba",
        albums: [
          anAlbum({ name: "album1", genre: genre1 }),
          anAlbum({ name: "album2", genre: genre2 }),
          anAlbum({ name: "album3", genre: genre3 }),
        ],
      });
      const artist2 = anArtist({
        name: "babba",
        albums: [
          anAlbum({ name: "album4", genre: genre1 }),
          anAlbum({ name: "album5", genre: genre2 }),
          anAlbum({ name: "album6", genre: genre3 }),
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

          expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getArtists' }).href(), {
            params: asURLSearchParams(authParamsPlusJson),
            headers,
          });

          expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getAlbumList2' }).href(), {
            params: asURLSearchParams({
              ...authParamsPlusJson,
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

          expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getArtists' }).href(), {
            params: asURLSearchParams(authParamsPlusJson),
            headers,
          });

          expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getAlbumList2' }).href(), {
            params: asURLSearchParams({
              ...authParamsPlusJson,
              type: "alphabeticalByArtist",
              size: 500,
              offset: 2,
            }),
            headers,
          });
        });
      });
    });

    describe("when the number of albums reported by getArtists does not match that of getAlbums", () => {
      const genre = asGenre("lofi");

      const album1 = anAlbum({ name: "album1", genre });
      const album2 = anAlbum({ name: "album2", genre });
      const album3 = anAlbum({ name: "album3", genre });
      const album4 = anAlbum({ name: "album4", genre });
      const album5 = anAlbum({ name: "album5", genre });

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

            expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getArtists' }).href(), {
              params: asURLSearchParams(authParamsPlusJson),
              headers,
            });

            expect(axios.get).toHaveBeenCalledWith(
              url.append({ pathname: '/rest/getAlbumList2' }).href(),
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

            expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getArtists' }).href(), {
              params: asURLSearchParams(authParamsPlusJson),
              headers,
            });

            expect(axios.get).toHaveBeenCalledWith(
              url.append({ pathname: '/rest/getAlbumList2' }).href(),
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

            expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getArtists' }).href(), {
              params: asURLSearchParams(authParamsPlusJson),
              headers,
            });

            expect(axios.get).toHaveBeenCalledWith(
              url.append({ pathname: '/rest/getAlbumList2' }).href(),
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

            expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getArtists' }).href(), {
              params: asURLSearchParams(authParamsPlusJson),
              headers,
            });

            expect(axios.get).toHaveBeenCalledWith(
              url.append({ pathname: '/rest/getAlbumList2' }).href(),
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

            expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getArtists' }).href(), {
              params: asURLSearchParams(authParamsPlusJson),
              headers,
            });

            expect(axios.get).toHaveBeenCalledWith(
              url.append({ pathname: '/rest/getAlbumList2' }).href(),
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
              results: [album3, album4, album5],
              total: 5,
            });

            expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getArtists' }).href(), {
              params: asURLSearchParams(authParamsPlusJson),
              headers,
            });

            expect(axios.get).toHaveBeenCalledWith(
              url.append({ pathname: '/rest/getAlbumList2' }).href(),
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

  describe("getting an album", () => {
    beforeEach(() => {
      customPlayers.encodingFor.mockReturnValue(O.none);
    });

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
          .mockImplementationOnce(() =>
            Promise.resolve(ok(getAlbumJson(artist, album, tracks)))
          );
      });

      it("should return the album", async () => {
        const result = await subsonic.album(album.id);

        expect(result).toEqual(album);

        expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getAlbum' }).href(), {
          params: asURLSearchParams({
            ...authParamsPlusJson,
            id: album.id,
          }),
          headers,
        });
      });
    });
  });

  describe("getting tracks", () => {
    describe("for an album", () => {
      describe("when there are no custom players", () => {
        beforeEach(() => {
          customPlayers.encodingFor.mockReturnValue(O.none);
        });

        describe("when the album has multiple tracks, some of which are rated", () => {
          const hipHop = asGenre("Hip-Hop");
          const tripHop = asGenre("Trip-Hop");
  
          const album = anAlbum({ id: "album1", name: "Burnin", genre: hipHop });
  
          const artist = anArtist({
            id: "artist1",
            name: "Bob Marley",
            albums: [album],
          });
  
          const track1 = aTrack({
            artist: artistToArtistSummary(artist),
            album: albumToAlbumSummary(album),
            genre: hipHop,
            rating: {
              love: true,
              stars: 3,
            },
          });
          const track2 = aTrack({
            artist: artistToArtistSummary(artist),
            album: albumToAlbumSummary(album),
            genre: hipHop,
            rating: {
              love: false,
              stars: 0,
            },
          });
          const track3 = aTrack({
            artist: artistToArtistSummary(artist),
            album: albumToAlbumSummary(album),
            genre: tripHop,
            rating: {
              love: true,
              stars: 5,
            },
          });
          const track4 = aTrack({
            artist: artistToArtistSummary(artist),
            album: albumToAlbumSummary(album),
            genre: tripHop,
            rating: {
              love: false,
              stars: 1,
            },
          });
  
          const tracks = [track1, track2, track3, track4];
  
          beforeEach(() => {
            mockGET
              .mockImplementationOnce(() =>
                Promise.resolve(ok(getAlbumJson(artist, album, tracks)))
              );
          });
  
          it("should return the album", async () => {
            const result = await subsonic.tracks(album.id);
  
            expect(result).toEqual([track1, track2, track3, track4]);
  
            expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getAlbum' }).href(), {
              params: asURLSearchParams({
                ...authParamsPlusJson,
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
  
          const track = aTrack({
            artist: artistToArtistSummary(artist),
            album: albumToAlbumSummary(album),
            genre: flipFlop,
          });
  
          const tracks = [track];
  
          beforeEach(() => {
            mockGET
              .mockImplementationOnce(() =>
                Promise.resolve(ok(getAlbumJson(artist, album, tracks)))
              );
          });
  
          it("should return the album", async () => {
            const result = await subsonic.tracks(album.id);
  
            expect(result).toEqual([track]);
  
            expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getAlbum' }).href(), {
              params: asURLSearchParams({
                ...authParamsPlusJson,
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
              .mockImplementationOnce(() =>
                Promise.resolve(ok(getAlbumJson(artist, album, tracks)))
              );
          });
  
          it("should empty array", async () => {
            const result = await subsonic.tracks(album.id);
  
            expect(result).toEqual([]);
  
            expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getAlbum' }).href(), {
              params: asURLSearchParams({
                ...authParamsPlusJson,
                id: album.id,
              }),
              headers,
            });
          });
        });
      });

      describe("when a custom player is configured for the mime type", () => {
        const hipHop = asGenre("Hip-Hop");
        const tripHop = asGenre("Trip-Hop");
  
        const album = anAlbum({ id: "album1", name: "Burnin", genre: hipHop });
  
        const artist = anArtist({
          id: "artist1",
          name: "Bob Marley",
          albums: [album],
        });
  
        const alac = aTrack({
          artist: artistToArtistSummary(artist),
          album: albumToAlbumSummary(album),
          encoding: {
            player: "bonob",
            mimeType: "audio/alac"
          },
          genre: hipHop,
          rating: {
            love: true,
            stars: 3,
          },
        });
        const m4a = aTrack({
          artist: artistToArtistSummary(artist),
          album: albumToAlbumSummary(album),
          encoding: {
            player: "bonob",
            mimeType: "audio/m4a"
          },
          genre: hipHop,
          rating: {
            love: false,
            stars: 0,
          },
        });
        const mp3 = aTrack({
          artist: artistToArtistSummary(artist),
          album: albumToAlbumSummary(album),
          encoding: {
            player: "bonob",
            mimeType: "audio/mp3"
          },
          genre: tripHop,
          rating: {
            love: true,
            stars: 5,
          },
        });
  
        beforeEach(() => {
          customPlayers.encodingFor
            .mockReturnValueOnce(O.of({ player: "bonob+audio/alac", mimeType: "audio/flac" }))
            .mockReturnValueOnce(O.of({ player: "bonob+audio/m4a", mimeType: "audio/opus" }))
            .mockReturnValueOnce(O.none)
          
          mockGET
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getAlbumJson(artist, album, [alac, m4a, mp3])))
            );
        });
  
        it("should return the album with custom players applied", async () => {
          const result = await subsonic.tracks(album.id);
  
          expect(result).toEqual([
            {
              ...alac,
              encoding: { 
                player: "bonob+audio/alac", 
                mimeType: "audio/flac" 
              }
            },
            {
              ...m4a,
              encoding: { 
                player: "bonob+audio/m4a", 
                mimeType: "audio/opus" 
              }
            },
            {
              ...mp3,
              encoding: {
                player: "bonob",
                mimeType: "audio/mp3"
              }
            },
          ]);
  
          expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getAlbum' }).href(), {
            params: asURLSearchParams({
              ...authParamsPlusJson,
              id: album.id,
            }),
            headers,
          });
  
          expect(customPlayers.encodingFor).toHaveBeenCalledTimes(3);
          expect(customPlayers.encodingFor).toHaveBeenNthCalledWith(1, { mimeType: "audio/alac" })
          expect(customPlayers.encodingFor).toHaveBeenNthCalledWith(2, { mimeType: "audio/m4a" })
          expect(customPlayers.encodingFor).toHaveBeenNthCalledWith(3, { mimeType: "audio/mp3" })
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
                Promise.resolve(ok(getAlbumJson(artist, album, [])))
              );
  
            const result = await subsonic.track(track.id);
  
            expect(result).toEqual({
              ...track,
              rating: { love: true, stars: 4 },
            });
  
            expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getSong' }).href(), {
              params: asURLSearchParams({
                ...authParamsPlusJson,
                id: track.id,
              }),
              headers,
            });
  
            expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getAlbum' }).href(), {
              params: asURLSearchParams({
                ...authParamsPlusJson,
                id: album.id,
              }),
              headers,
            });
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
                Promise.resolve(ok(getAlbumJson(artist, album, [])))
              );
  
            const result = await subsonic.track(track.id);
  
            expect(result).toEqual({
              ...track,
              rating: { love: false, stars: 0 },
            });
  
            expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getSong' }).href(), {
              params: asURLSearchParams({
                ...authParamsPlusJson,
                id: track.id,
              }),
              headers,
            });
  
            expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getAlbum' }).href(), {
              params: asURLSearchParams({
                ...authParamsPlusJson,
                id: album.id,
              }),
              headers,
            });
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
      albums: [album]
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
                Promise.resolve(ok(getAlbumJson(artist, album, [])))
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
                Promise.resolve(ok(getAlbumJson(artist, album, [])))
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
                  Promise.resolve(ok(getAlbumJson(artist, album, [])))
                )
                .mockImplementationOnce(() => Promise.resolve(streamResponse));
  
              const result = await subsonic.stream({ trackId, range: undefined });
  
              expect(result.headers).toEqual({
                "content-type": "audio/mpeg",
                "content-length": "1667",
                "content-range": "-200",
                "accept-ranges": "bytes",
              });
              expect(result.stream).toEqual(stream);
  
              expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/stream' }).href(), {
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
            it("should fail", async () => {
              const trackId = "track123";
  
              const streamResponse = {
                status: 400,
                headers: {
                  'content-type': 'text/html',
                  'content-length': '33'
                }
              };
  
              mockGET
                .mockImplementationOnce(() =>
                  Promise.resolve(ok(getSongJson(track)))
                )
                .mockImplementationOnce(() =>
                  Promise.resolve(ok(getAlbumJson(artist, album, [])))
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
                  Promise.resolve(ok(getAlbumJson(artist, album, [])))
                )
                .mockImplementationOnce(() => Promise.reject("IO error occured"));
  
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
                Promise.resolve(ok(getAlbumJson(artist, album, [])))
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
  
            expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/stream' }).href(), {
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
    });

    describe("when there are custom players registered", () => {
      const customEncoding = {
        player: `bonob-${uuid()}`,
        mimeType: "transocodedMimeType"
      };
      const trackWithCustomPlayer: Track = {
        ...track,
        encoding: customEncoding
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
              Promise.resolve(ok(getAlbumJson(artist, album, [trackWithCustomPlayer])))
            )
            .mockImplementationOnce(() => Promise.resolve(streamResponse));

          await subsonic.stream({ trackId, range: undefined });

          expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/stream' }).href(), {
            params: asURLSearchParams({
              ...authParams,
              id: trackId,
              c: trackWithCustomPlayer.encoding.player,
            }),
            headers: {
              "User-Agent": "bonob",
            },
            responseType: "stream",
          });
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
              Promise.resolve(ok(getAlbumJson(artist, album, [trackWithCustomPlayer])))
            )
            .mockImplementationOnce(() => Promise.resolve(streamResponse));

          await subsonic.stream({ trackId, range });

          expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/stream' }).href(), {
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
          const coverArtURN = { system: "subsonic", resource: `art:${coverArtId}` };

          mockGET
            .mockImplementationOnce(() => Promise.resolve(streamResponse));

          const result = await subsonic.coverArt(coverArtURN);

          expect(result).toEqual({
            contentType: streamResponse.headers["content-type"],
            data: streamResponse.data,
          });

          expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getCoverArt' }).href(), {
            params: asURLSearchParams({
              ...authParams,
              id: coverArtId,
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
          const coverArtId = uuid();
          const coverArtURN = { system: "subsonic", resource: `art:${coverArtId}` }
          const size = 1879;

          mockGET
            .mockImplementationOnce(() => Promise.resolve(streamResponse));

          const result = await subsonic.coverArt(coverArtURN, size);

          expect(result).toEqual({
            contentType: streamResponse.headers["content-type"],
            data: streamResponse.data,
          });

          expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getCoverArt' }).href(), {
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

      describe("when an unexpected error occurs", () => {
        it("should return undefined", async () => {
          const size = 1879;

          mockGET
            .mockImplementationOnce(() => Promise.reject("BOOOM"));

          const result = await subsonic.coverArt({ system: "external", resource: "http://localhost:404" }, size);

          expect(result).toBeUndefined();
        });
      });
    });

    describe("fetching cover art", () => {
      describe("when urn.resource is not subsonic", () => {
        it("should be undefined", async () => {
          const covertArtURN = { system: "notSubsonic", resource: `art:${uuid()}` };

          const result = await subsonic.coverArt(covertArtURN, 190);

          expect(result).toBeUndefined();
        });
      });

      describe("when no size is specified", () => {
        it("should fetch the image", async () => {
          const coverArtId = uuid()
          const covertArtURN = { system: "subsonic", resource: `art:${coverArtId}` };

          const streamResponse = {
            status: 200,
            headers: {
              "content-type": "image/jpeg",
            },
            data: Buffer.from("the image", "ascii"),
          };

          mockGET
            .mockImplementationOnce(() => Promise.resolve(streamResponse));

          const result = await subsonic.coverArt(covertArtURN);

          expect(result).toEqual({
            contentType: streamResponse.headers["content-type"],
            data: streamResponse.data,
          });

          expect(axios.get).toHaveBeenCalledWith(
            `${url}/rest/getCoverArt`,
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

        describe("and an error occurs fetching the uri", () => {
          it("should return undefined", async () => {
            const coverArtId = uuid()
            const covertArtURN = { system:"subsonic", resource: `art:${coverArtId}` };

            mockGET
              .mockImplementationOnce(() => Promise.reject("BOOOM"));

            const result = await subsonic.coverArt(covertArtURN);

            expect(result).toBeUndefined();
          });
        });
      });

      describe("when size is specified", () => {
        const size = 189;

        it("should fetch the image", async () => {
          const coverArtId = uuid()
          const covertArtURN = { system: "subsonic", resource: `art:${coverArtId}` };

          const streamResponse = {
            status: 200,
            headers: {
              "content-type": "image/jpeg",
            },
            data: Buffer.from("the image", "ascii"),
          };

          mockGET
            .mockImplementationOnce(() => Promise.resolve(streamResponse));

          const result = await subsonic.coverArt(covertArtURN, size);

          expect(result).toEqual({
            contentType: streamResponse.headers["content-type"],
            data: streamResponse.data,
          });

          expect(axios.get).toHaveBeenCalledWith(
            url.append({ pathname: '/rest/getCoverArt' }).href(),
            {
              params: asURLSearchParams({
                ...authParams,
                id: coverArtId,
                size
              }),
              headers,
              responseType: "arraybuffer",
            }
          );
        });

        describe("and an error occurs fetching the uri", () => {
          it("should return undefined", async () => {
            const coverArtId = uuid()
            const covertArtURN = { system: "subsonic", resource: `art:${coverArtId}` };

            mockGET
              .mockImplementationOnce(() => Promise.reject("BOOOM"));

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
              Promise.resolve(ok(getAlbumJson(artist, album, [])))
            )
            .mockImplementationOnce(() => Promise.resolve(ok(EMPTY)));

          const result = await subsonic.rate(trackId, { love: true, stars: 0 });

          expect(result).toEqual(true);

          expect(mockGET).toHaveBeenCalledWith(url.append({ pathname: '/rest/star' }).href(), {
            params: asURLSearchParams({
              ...authParamsPlusJson,
              id: trackId,
            }),
            headers,
          });
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
              Promise.resolve(ok(getAlbumJson(artist, album, [])))
            )
            .mockImplementationOnce(() => Promise.resolve(ok(EMPTY)));

          const result = await subsonic.rate(trackId, { love: false, stars: 0 });

          expect(result).toEqual(true);

          expect(mockGET).toHaveBeenCalledWith(url.append({ pathname: '/rest/unstar' }).href(), {
            params: asURLSearchParams({
              ...authParamsPlusJson,
              id: trackId,
            }),
            headers,
          });
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
              Promise.resolve(ok(getAlbumJson(artist, album, [])))
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
              Promise.resolve(ok(getAlbumJson(artist, album, [])))
            )
            .mockImplementationOnce(() => Promise.resolve(ok(EMPTY)));

          const result = await subsonic.rate(trackId, { love: false, stars: 3 });

          expect(result).toEqual(true);

          expect(mockGET).toHaveBeenCalledWith(url.append({ pathname: '/rest/setRating' }).href(), {
            params: asURLSearchParams({
              ...authParamsPlusJson,
              id: trackId,
              rating: 3,
            }),
            headers,
          });
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
              Promise.resolve(ok(getAlbumJson(artist, album, [])))
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
              Promise.resolve(ok(getAlbumJson(artist, album, [])))
            )
            .mockImplementationOnce(() => Promise.resolve(ok(EMPTY)))
            .mockImplementationOnce(() => Promise.resolve(ok(EMPTY)));

          const result = await subsonic.rate(trackId, { love: false, stars: 5 });

          expect(result).toEqual(true);

          expect(mockGET).toHaveBeenCalledWith(url.append({ pathname: '/rest/unstar' }).href(), {
            params: asURLSearchParams({
              ...authParamsPlusJson,
              id: trackId,
            }),
            headers,
          });
          expect(mockGET).toHaveBeenCalledWith(url.append({ pathname: '/rest/setRating' }).href(), {
            params: asURLSearchParams({
              ...authParamsPlusJson,
              id: trackId,
              rating: 5,
            }),
            headers,
          });
        });
      });

      describe("invalid star values", () => {
        describe("stars of -1", () => {
          it("should return false", async () => {
            const result = await subsonic.rate(trackId, { love: true, stars: -1 });
            expect(result).toEqual(false);
          });
        });

        describe("stars of 6", () => {
          it("should return false", async () => {
            const result = await subsonic.rate(trackId, { love: true, stars: -1 });
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

  describe("scrobble", () => {
    describe("when succeeds", () => {
      it("should return true", async () => {
        const id = uuid();

        mockGET
          .mockImplementationOnce(() => Promise.resolve(ok(EMPTY)));

        const result = await subsonic.scrobble(id);

        expect(result).toEqual(true);

        expect(mockGET).toHaveBeenCalledWith(url.append({ pathname: '/rest/scrobble' }).href(), {
          params: asURLSearchParams({
            ...authParamsPlusJson,
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
          .mockImplementationOnce(() =>
            Promise.resolve({
              status: 500,
              data: {},
            })
          );

        const result = await subsonic.scrobble(id);

        expect(result).toEqual(false);

        expect(mockGET).toHaveBeenCalledWith(url.append({ pathname: '/rest/scrobble' }).href(), {
          params: asURLSearchParams({
            ...authParamsPlusJson,
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
          .mockImplementationOnce(() => Promise.resolve(ok(EMPTY)));

        const result = await subsonic.nowPlaying(id);

        expect(result).toEqual(true);

        expect(mockGET).toHaveBeenCalledWith(url.append({ pathname: '/rest/scrobble' }).href(), {
          params: asURLSearchParams({
            ...authParamsPlusJson,
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
          .mockImplementationOnce(() =>
            Promise.resolve({
              status: 500,
              data: {},
            })
          );

        const result = await subsonic.nowPlaying(id);

        expect(result).toEqual(false);

        expect(mockGET).toHaveBeenCalledWith(url.append({ pathname: '/rest/scrobble' }).href(), {
          params: asURLSearchParams({
            ...authParamsPlusJson,
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
          .mockImplementationOnce(() =>
            Promise.resolve(ok(getSearchResult3Json({ artists: [artist1] })))
          );

        const result = await subsonic.searchArtists("foo");

        expect(result).toEqual([artistToArtistSummary(artist1)]);

        expect(mockGET).toHaveBeenCalledWith(url.append({ pathname: '/rest/search3' }).href(), {
          params: asURLSearchParams({
            ...authParamsPlusJson,
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
          .mockImplementationOnce(() =>
            Promise.resolve(
              ok(getSearchResult3Json({ artists: [artist1, artist2] }))
            )
          );

        const result = await subsonic.searchArtists("foo");

        expect(result).toEqual([
          artistToArtistSummary(artist1),
          artistToArtistSummary(artist2),
        ]);

        expect(mockGET).toHaveBeenCalledWith(url.append({ pathname: '/rest/search3' }).href(), {
          params: asURLSearchParams({
            ...authParamsPlusJson,
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
          .mockImplementationOnce(() =>
            Promise.resolve(ok(getSearchResult3Json({ artists: [] })))
          );

        const result = await subsonic.searchArtists("foo");

        expect(result).toEqual([]);

        expect(mockGET).toHaveBeenCalledWith(url.append({ pathname: '/rest/search3' }).href(), {
          params: asURLSearchParams({
            ...authParamsPlusJson,
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
          genre: { id: b64Encode("pop"), name: "pop" },
        });
        const artist = anArtist({ name: "#1", albums: [album] });

        mockGET
          .mockImplementationOnce(() =>
            Promise.resolve(
              ok(getSearchResult3Json({ albums: [{ artist, album }] }))
            )
          );

        const result = await subsonic.searchAlbums("foo");

        expect(result).toEqual([albumToAlbumSummary(album)]);

        expect(mockGET).toHaveBeenCalledWith(url.append({ pathname: '/rest/search3' }).href(), {
          params: asURLSearchParams({
            ...authParamsPlusJson,
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
          genre: { id: b64Encode("pop"), name: "pop" },
        });
        const artist1 = anArtist({ name: "artist1", albums: [album1] });

        const album2 = anAlbum({
          name: "album2",
          genre: { id: b64Encode("pop"), name: "pop" },
        });
        const artist2 = anArtist({ name: "artist2", albums: [album2] });

        mockGET
          .mockImplementationOnce(() =>
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
          albumToAlbumSummary(album1),
          albumToAlbumSummary(album2),
        ]);

        expect(mockGET).toHaveBeenCalledWith(url.append({ pathname: '/rest/search3' }).href(), {
          params: asURLSearchParams({
            ...authParamsPlusJson,
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
          .mockImplementationOnce(() =>
            Promise.resolve(ok(getSearchResult3Json({ albums: [] })))
          );

        const result = await subsonic.searchAlbums("foo");

        expect(result).toEqual([]);

        expect(mockGET).toHaveBeenCalledWith(url.append({ pathname: '/rest/search3' }).href(), {
          params: asURLSearchParams({
            ...authParamsPlusJson,
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
            Promise.resolve(ok(getAlbumJson(artist, album, [])))
          );

        const result = await subsonic.searchTracks("foo");

        expect(result).toEqual([track]);

        expect(mockGET).toHaveBeenCalledWith(url.append({ pathname: '/rest/search3' }).href(), {
          params: asURLSearchParams({
            ...authParamsPlusJson,
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
            Promise.resolve(ok(getAlbumJson(artist1, album1, [])))
          )
          .mockImplementationOnce(() =>
            Promise.resolve(ok(getAlbumJson(artist2, album2, [])))
          );

        const result = await subsonic.searchTracks("moo");

        expect(result).toEqual([track1, track2]);

        expect(mockGET).toHaveBeenCalledWith(url.append({ pathname: '/rest/search3' }).href(), {
          params: asURLSearchParams({
            ...authParamsPlusJson,
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
          .mockImplementationOnce(() =>
            Promise.resolve(ok(getSearchResult3Json({ tracks: [] })))
          );

        const result = await subsonic.searchTracks("foo");

        expect(result).toEqual([]);

        expect(mockGET).toHaveBeenCalledWith(url.append({ pathname: '/rest/search3' }).href(), {
          params: asURLSearchParams({
            ...authParamsPlusJson,
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
    beforeEach(() => {
      customPlayers.encodingFor.mockReturnValue(O.none);
    });

    describe("getting playlists", () => {
      describe("when there is 1 playlist results", () => {
        it("should return it", async () => {
          const playlist = aPlaylistSummary();

          mockGET
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getPlayListsJson([playlist])))
            );

          const result = await subsonic.playlists();

          expect(result).toEqual([playlist]);

          expect(mockGET).toHaveBeenCalledWith(url.append({ pathname: '/rest/getPlaylists' }).href(), {
            params: asURLSearchParams(authParamsPlusJson),
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
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getPlayListsJson(playlists)))
            );

          const result = await subsonic.playlists();

          expect(result).toEqual(playlists);

          expect(mockGET).toHaveBeenCalledWith(url.append({ pathname: '/rest/getPlaylists' }).href(), {
            params: asURLSearchParams(authParamsPlusJson),
            headers,
          });
        });
      });

      describe("when there are no playlists", () => {
        it("should return []", async () => {
          mockGET
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getPlayListsJson([])))
            );

          const result = await subsonic.playlists();

          expect(result).toEqual([]);

          expect(mockGET).toHaveBeenCalledWith(url.append({ pathname: '/rest/getPlaylists' }).href(), {
            params: asURLSearchParams(authParamsPlusJson),
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
            .mockImplementationOnce(() =>
              Promise.resolve(ok(error("70", "data not found")))
            );

          return expect(
            subsonic.playlist(id)
          ).rejects.toEqual("Subsonic error:data not found");
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

            mockGET
              .mockImplementationOnce(() =>
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

            expect(mockGET).toHaveBeenCalledWith(url.append({ pathname: '/rest/getPlaylist' }).href(), {
              params: asURLSearchParams({
                ...authParamsPlusJson,
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
              .mockImplementationOnce(() =>
                Promise.resolve(ok(getPlayListJson(playlist)))
              );

            const result = await subsonic.playlist(playlist.id);

            expect(result).toEqual(playlist);

            expect(mockGET).toHaveBeenCalledWith(url.append({ pathname: '/rest/getPlaylist' }).href(), {
              params: asURLSearchParams({
                ...authParamsPlusJson,
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
          .mockImplementationOnce(() =>
            Promise.resolve(ok(createPlayListJson({ id, name })))
          );

        const result = await subsonic.createPlaylist(name);

        expect(result).toEqual({ id, name });

        expect(mockGET).toHaveBeenCalledWith(url.append({ pathname: '/rest/createPlaylist' }).href(), {
          params: asURLSearchParams({
            ...authParamsPlusJson,
            f: "json",
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
          .mockImplementationOnce(() => Promise.resolve(ok(EMPTY)));

          const result = await subsonic.deletePlaylist(id);

        expect(result).toEqual(true);

        expect(mockGET).toHaveBeenCalledWith(url.append({ pathname: '/rest/deletePlaylist' }).href(), {
          params: asURLSearchParams({
            ...authParamsPlusJson,
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
            .mockImplementationOnce(() => Promise.resolve(ok(EMPTY)));

            const result = await subsonic.addToPlaylist(playlistId, trackId);

          expect(result).toEqual(true);

          expect(mockGET).toHaveBeenCalledWith(url.append({ pathname: '/rest/updatePlaylist' }).href(), {
            params: asURLSearchParams({
              ...authParamsPlusJson,
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
          const indicies = [6, 100, 33];

          mockGET
            .mockImplementationOnce(() => Promise.resolve(ok(EMPTY)));

            const result = await subsonic.removeFromPlaylist(playlistId, indicies);

          expect(result).toEqual(true);

          expect(mockGET).toHaveBeenCalledWith(url.append({ pathname: '/rest/updatePlaylist' }).href(), {
            params: asURLSearchParams({
              ...authParamsPlusJson,
              playlistId,
              songIndexToRemove: indicies,
            }),
            headers,
          });
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
          album: albumToAlbumSummary(album1),
          genre: pop,
        });

        mockGET
          .mockImplementationOnce(() =>
            Promise.resolve(ok(getSimilarSongsJson([track1])))
          )
          .mockImplementationOnce(() =>
            Promise.resolve(ok(getAlbumJson(artist1, album1, [])))
          );

          const result = await subsonic.similarSongs(id);

        expect(result).toEqual([track1]);

        expect(mockGET).toHaveBeenCalledWith(url.append({ pathname: '/rest/getSimilarSongs2' }).href(), {
          params: asURLSearchParams({
            ...authParams,
            f: "json",
            id,
            count: 50,
          }),
          headers,
        });
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
          )
          .mockImplementationOnce(() =>
            Promise.resolve(ok(getAlbumJson(artist1, album1, [])))
          )
          .mockImplementationOnce(() =>
            Promise.resolve(ok(getAlbumJson(artist2, album2, [])))
          )
          .mockImplementationOnce(() =>
            Promise.resolve(ok(getAlbumJson(artist1, album1, [])))
          );

          const result = await subsonic.similarSongs(id);

        expect(result).toEqual([track1, track2, track3]);

        expect(mockGET).toHaveBeenCalledWith(url.append({ pathname: '/rest/getSimilarSongs2' }).href(), {
          params: asURLSearchParams({
            ...authParams,
            f: "json",
            id,
            count: 50,
          }),
          headers,
        });
      });
    });

    describe("when there are no similar songs", () => {
      it("should return []", async () => {
        const id = "idWithNoTracks";

        mockGET
          .mockImplementationOnce(() =>
            Promise.resolve(ok(getSimilarSongsJson([])))
          );

          const result = await subsonic.similarSongs(id);

        expect(result).toEqual([]);

        expect(mockGET).toHaveBeenCalledWith(url.append({ pathname: '/rest/getSimilarSongs2' }).href(), {
          params: asURLSearchParams({
            ...authParams,
            f: "json",
            id,
            count: 50,
          }),
          headers,
        });
      });
    });

    describe("when the id doesnt exist", () => {
      it("should fail", async () => {
        const id = "idThatHasAnError";

        mockGET
          .mockImplementationOnce(() =>
            Promise.resolve(ok(error("70", "data not found")))
          );

        return expect(
          subsonic.similarSongs(id)
        ).rejects.toEqual("Subsonic error:data not found");
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
          )
          .mockImplementationOnce(() =>
            Promise.resolve(ok(getAlbumJson(artist, album1, [])))
          );

          const result = await subsonic.topSongs(artistId);

        expect(result).toEqual([track1]);

        expect(mockGET).toHaveBeenCalledWith(url.append({ pathname: '/rest/getTopSongs' }).href(), {
          params: asURLSearchParams({
            ...authParams,
            f: "json",
            artist: artistName,
            count: 50,
          }),
          headers,
        });
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
          )
          .mockImplementationOnce(() =>
            Promise.resolve(ok(getAlbumJson(artist, album1, [])))
          )
          .mockImplementationOnce(() =>
            Promise.resolve(ok(getAlbumJson(artist, album2, [])))
          )
          .mockImplementationOnce(() =>
            Promise.resolve(ok(getAlbumJson(artist, album1, [])))
          );

        const result = await subsonic.topSongs(artistId);

        expect(result).toEqual([track1, track2, track3]);

        expect(mockGET).toHaveBeenCalledWith(url.append({ pathname: '/rest/getTopSongs' }).href(), {
          params: asURLSearchParams({
            ...authParams,
            f: "json",
            artist: artistName,
            count: 50,
          }),
          headers,
        });
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

        expect(mockGET).toHaveBeenCalledWith(url.append({ pathname: '/rest/getTopSongs' }).href(), {
          params: asURLSearchParams({
            ...authParams,
            f: "json",
            artist: artistName,
            count: 50,
          }),
          headers,
        });
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
        mockGET
        .mockImplementationOnce(() =>
          Promise.resolve(ok(getRadioStationsJson([
            station1,
            station2,
            station3,
          ])))
        );
      });

      describe("asking for all of them", () => {
        it("should return them all", async () => {
          const result = await subsonic.radioStations();
  
          expect(result).toEqual([station1, station2, station3]);
  
          expect(mockGET).toHaveBeenCalledWith(url.append({ pathname: '/rest/getInternetRadioStations' }).href(), {
            params: asURLSearchParams({
              ...authParams,
              f: "json"
            }),
            headers,
          });
        });
      });

      describe("asking for one of them", () => {
        it("should return it", async () => {
          const result = await subsonic.radioStation(station2.id);
  
          expect(result).toEqual(station2);
  
          expect(mockGET).toHaveBeenCalledWith(url.append({ pathname: '/rest/getInternetRadioStations' }).href(), {
            params: asURLSearchParams({
              ...authParams,
              f: "json"
            }),
            headers,
          });
        });
      });
    });

    describe("when there are no radio stations", () => {
      it("should return []", async () => {
        mockGET
          .mockImplementationOnce(() =>
            Promise.resolve(ok(getRadioStationsJson([])))
          );

          const result = await subsonic.radioStations();

        expect(result).toEqual([]);

        expect(mockGET).toHaveBeenCalledWith(url.append({ pathname: '/rest/getInternetRadioStations' }).href(), {
          params: asURLSearchParams({
            ...authParams,
            f: "json"
          }),
          headers,
        });
      });
    });
  });

});
