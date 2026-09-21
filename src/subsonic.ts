import { option as O, taskEither as TE } from "fp-ts";
import * as A from "fp-ts/Array";
import { ordString } from "fp-ts/lib/Ord";
import { pipe } from "fp-ts/lib/function";
import { createHash } from "crypto";
import { generateRandomString } from "./random";
import {
  Credentials,
  AlbumSummary,
  Genre,
  Track,
  CoverArt,
  AlbumQueryType,
  Encoding,
  TrackSummary,
  AuthFailure,
} from "./music_library";
import sharp from "sharp";
import _ from "underscore";
import { readFile, writeFile } from "fs/promises";
import path from "path";

import axios, { AxiosRequestConfig } from "axios";
import { b64Encode, b64Decode } from "./b64";
import { Art } from "./art";

import { URLBuilder } from "./url_builder";

export const BROWSER_HEADERS = {
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br, zstd",
  "Upgrade-Insecure-Requests": "1",
  "User-Agent": "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:150.0) Gecko/20100101 Firefox/150.0",
};

export const t = (password: string, s: string) =>
  createHash("md5").update(`${password}${s}`).digest("hex");

export const t_and_s = (password: string) => {
  const s = generateRandomString();
  return {
    t: t(password, s),
    s,
  };
};

export const DODGY_IMAGE_NAME = "2a96cbd8b46e442fc41c2b86b821562f.png";

export const isValidImage = (url: string | undefined) =>
  url != undefined && !url.endsWith(DODGY_IMAGE_NAME);

type SubsonicEnvelope = {
  readonly "subsonic-response": SubsonicResponse;
};

type SubsonicResponse = {
  readonly status: string;
};

export type OpenSubsonicAlbum = {
  readonly id: string;
  readonly name: string;
  readonly artist: string | undefined;
  readonly artistId: string | undefined;
  readonly coverArt: string | undefined;
  readonly genre: string | undefined;
  readonly year: string | undefined;
};

export type OpenSubsonicArtist = {
  readonly id: string;
  readonly name: string;
  readonly albumCount: number;
  readonly artistImageUrl: string | undefined;
  readonly coverArt?: string;
  readonly userRating?: number;
  readonly starred?: string;
};

export type NavidromeArtist = {
  readonly sortName: string;
};

export type ArtistWithSortName = OpenSubsonicArtist & NavidromeArtist;

export function hasSortName(
  artist: OpenSubsonicArtist
): artist is ArtistWithSortName {
  return "sortName" in artist && artist.sortName !== undefined;
}

export type AlbumList2Query = { 
    readonly offset?: number, readonly size?: number,
    readonly type: string,
    readonly genre?: string,
    readonly fromYear?: string, readonly toYear?: string 
  }

export type GetArtistsResponse = SubsonicResponse & {
  readonly artists: {
    readonly ignoredArticles: string;
    readonly index: readonly {
      readonly name: string;
      readonly artist: ReadonlyArray<OpenSubsonicArtist | ArtistWithSortName>;
    }[];
  };
};

export type GetArtists = GetArtistsResponse["artists"];

type GetAlbumListResponse = SubsonicResponse & {
  readonly albumList2: {
    readonly album: readonly OpenSubsonicAlbum[];
  };
};

type genre = {
  readonly songCount: number;
  readonly albumCount: number;
  readonly value: string;
};

export type GetGenresResponse = SubsonicResponse & {
  readonly genres: {
    // eslint-disable-next-line functional/prefer-readonly-type
    readonly genre: genre[];
  };
};

type SubsonicError = SubsonicResponse & {
  readonly error: {
    readonly code: string;
    readonly message: string;
  };
};

export type images = {
  readonly smallImageUrl: string | undefined;
  readonly mediumImageUrl: string | undefined;
  readonly largeImageUrl: string | undefined;
};

type artistInfo = images & {
  readonly biography: string | undefined;
  readonly musicBrainzId: string | undefined;
  readonly lastFmUrl: string | undefined;
  readonly similarArtist: readonly OpenSubsonicArtist[];
};

type ArtistSummary = IdName & {
  readonly image: Art | undefined;
};

type GetArtistInfoResponse = SubsonicResponse & {
  readonly artistInfo2: artistInfo;
};

type GetArtistResponse = SubsonicResponse & {
  readonly artist: OpenSubsonicArtist & {
    readonly album: readonly OpenSubsonicAlbum[];
  };
};

export type OpenSubsonicSong = {
  readonly id: string;
  readonly parent: string | undefined;
  readonly title: string;
  readonly type: string | undefined;
  readonly albumId: string | undefined;
  readonly album: string | undefined;
  readonly artistId: string | undefined;
  readonly artist: string | undefined;
  readonly coverArt: string | undefined;
  readonly duration: number | undefined;
  readonly bitRate: number | undefined;
  readonly track: number | undefined;
  readonly year: string | undefined;
  readonly genre: string | undefined;
  readonly created: string | undefined;
  readonly suffix: string | undefined;
  readonly contentType: string;

  readonly transcodedContentType: string | undefined;
  readonly userRating: number | undefined;
};

export type GetAlbumResponse = SubsonicResponse & {
  readonly album: OpenSubsonicAlbum & {
    readonly song: readonly OpenSubsonicSong[];
  };
};

export type GetAlbum = GetAlbumResponse["album"];

export type GetPlaylistResponse = {
  // todo: isnt the type here a composite? playlistSummary && { entry: OpenSubsonicSong[]; }
  readonly playlist: {
    readonly id: string;
    readonly name: string;
    readonly entry: readonly OpenSubsonicSong[];

    // todo: this is an ND specific field?
    readonly coverArt: string | undefined;
  };
};

export type GetPlaylistsResponse = {
  readonly playlists: { 
    readonly playlist: readonly {
      readonly id: string;
      readonly name: string;
      //owner: string,
      //public: boolean,
      //created: string,
      //changed: string,
      //songCount: int,
      //duration: int,

      // todo: this is an ND specific field.
      readonly coverArt: string | undefined;
    }[] 
  };
};

export type GetSimilarSongsResponse = {
  readonly similarSongs2: { readonly song: readonly OpenSubsonicSong[] };
};

export type GetTopSongsResponse = {
  readonly topSongs: { readonly song: readonly OpenSubsonicSong[] };
};

export type GetInternetRadioStationsResponse = {
  readonly internetRadioStations: {
    readonly internetRadioStation: readonly {
      readonly id: string;
      readonly name: string;
      readonly streamUrl: string;
      readonly homePageUrl?: string;
    }[];
  };
};

export type GetSongResponse = {
  readonly song: OpenSubsonicSong;
};

export type GetStarredResponse = {
  readonly starred2: {
    // Subsonic servers can omit these entirely when there are no starred
    // items of that kind, rather than returning an empty array.
    readonly song?: readonly OpenSubsonicSong[];
    readonly album?: readonly OpenSubsonicAlbum[];
    readonly artist?: readonly OpenSubsonicArtist[];
  };
};

export type PingResponse = {
  readonly status: string;
  readonly version: string;
  readonly type: string;
  readonly serverVersion: string;
};

export type Search3Response = SubsonicResponse & {
  readonly searchResult3: {
    readonly artist: readonly OpenSubsonicArtist[];
    readonly album: readonly OpenSubsonicAlbum[];
    readonly song: readonly OpenSubsonicSong[];
  };
};

export type OpenSubsonicExtension = {
  readonly name: string;
  readonly versions: readonly number[];
};

type GetOpenSubsonicExtensionsResponse = SubsonicResponse & {
  readonly openSubsonicExtensions: readonly OpenSubsonicExtension[];
};

export function isError(
  subsonicResponse: SubsonicResponse
): subsonicResponse is SubsonicError {
  return (subsonicResponse as SubsonicError).error !== undefined;
}

export type IdName = {
  readonly id: string;
  readonly name: string;
};

export const coverArtToArt = (coverArt: string | undefined): Art | undefined =>
  pipe(
    coverArt,
    O.fromNullable,
    O.map((it: string) => ({ source: "subsonic", id: it })),
    O.getOrElseW(() => undefined)
  );

export const artistImageURN = (
  spec: Readonly<Partial<{ readonly artistId: string | undefined; readonly artistImageURL: string | undefined; }>>
): Art | undefined => {
  const deets = {
    artistId: undefined,
    artistImageURL: undefined,
    ...spec,
  };
  if (deets.artistImageURL && isValidImage(deets.artistImageURL)) {
    return {
      source: "external",
      id: deets.artistImageURL,
    };
  } else if (artistIsInLibrary(deets.artistId)) {
    return {
      source: "subsonic",
      id: deets.artistId!,
    };
  } else {
    return undefined;
  }
};

export const asTrackSummary = (
  song: OpenSubsonicSong,
  customPlayers: CustomPlayers,
  starredSongIds: ReadonlySet<string>
): TrackSummary => ({
  id: song.id,
  name: song.title,
  // todo: what is this used for?
  encoding: pipe(
    customPlayers.encodingFor({ mimeType: song.contentType }),
    O.getOrElse(() => ({
      player: DEFAULT_CLIENT_APPLICATION,
      mimeType: song.transcodedContentType
        ? song.transcodedContentType
        : song.contentType,
    }))
  ),
  duration: song.duration || 0,
  number: song.track || 0,
  genre: maybeAsGenre(song.genre),
  coverArt: coverArtToArt(song.coverArt),
  artist: {
    id: song.artistId,
    name: song.artist ? song.artist : "?",
    image: song.artistId
      ? artistImageURN({ artistId: song.artistId })
      : undefined,
  },
  rating: {
    love: starredSongIds.has(song.id),
    stars:
      song.userRating && song.userRating <= 5 && song.userRating >= 0
        ? song.userRating
        : 0,
  },
});

export const asTrack = (
  // eslint-disable-next-line functional/prefer-immutable-types
  album: AlbumSummary,
  song: OpenSubsonicSong,
  customPlayers: CustomPlayers,
  starredSongIds: ReadonlySet<string>
): Track => ({
  ...asTrackSummary(song, customPlayers, starredSongIds),
  album: album,
});

export const asAlbumSummary = (album: OpenSubsonicAlbum): AlbumSummary => ({
  id: album.id,
  name: album.name,
  year: album.year,
  genre: maybeAsGenre(album.genre),
  artistId: album.artistId,
  artistName: album.artist,
  coverArt: coverArtToArt(album.coverArt),
});

export const asGenre = (genreName: string) => ({
  id: b64Encode(genreName),
  name: genreName,
});

export const maybeAsGenre = (
  genreName: string | undefined
): Genre | undefined =>
  pipe(
    genreName,
    O.fromNullable,
    O.map(asGenre),
    O.getOrElseW(() => undefined)
  );

export const asYear = (year: string) => ({
  year: year,
});

export interface CustomPlayers {
  encodingFor({ mimeType }: { readonly mimeType: string }): O.Option<Encoding>;
}

export type CustomClient = {
  readonly mimeType: string;
  readonly transcodedMimeType: string;
};

export class TranscodingCustomPlayers implements CustomPlayers {
  readonly transcodings: ReadonlyMap<string, string>;

  constructor(transcodings: ReadonlyMap<string, string>) {
    this.transcodings = transcodings;
  }

  static from(config: string): TranscodingCustomPlayers {
    const parts: readonly (readonly [string, string])[] = config
      .split(",")
      .map((it) => it.split(">"))
      .map((pair) => {
        if (pair.length == 1) return [pair[0]!, pair[0]!];
        else if (pair.length == 2) return [pair[0]!, pair[1]!];
        // eslint-disable-next-line functional/no-throw-statements
        else throw new Error(`Invalid configuration item ${config}`);
      });
    return new TranscodingCustomPlayers(new Map(parts));
  }

  readonly encodingFor = ({ mimeType }: { readonly mimeType: string }): O.Option<Encoding> =>
    pipe(
      this.transcodings.get(mimeType),
      O.fromNullable,
      O.map((transcodedMimeType) => ({
        player: `${DEFAULT_CLIENT_APPLICATION}+${mimeType}`,
        mimeType: transcodedMimeType,
      }))
    );
}

export const NO_CUSTOM_PLAYERS: CustomPlayers = {
  encodingFor(_) {
    return O.none;
  },
};

export const DEFAULT_CLIENT_APPLICATION = "bonob";
export const USER_AGENT = "bonob";

export const asURLSearchParams = (q: any) => {
  const urlSearchParams = new URLSearchParams();
  Object.keys(q).forEach((k) => {
    _.flatten([q[k]]).forEach((v) => {
      urlSearchParams.append(k, `${v}`);
    });
  });
  return urlSearchParams;
};

// OpenSubsonic Transcoding Extension types
export type DirectPlayProfile = {
  readonly containers: readonly string[];
  readonly audioCodecs: readonly string[];
  readonly protocols: readonly string[];
  readonly maxAudioChannels: number;
};

export type TranscodingProfile = {
  readonly container: string;
  readonly audioCodec: string;
  readonly protocol: string;
  readonly maxAudioChannels: number;
};

export type CodecLimitation = {
  readonly name: string;
  readonly comparison: string;
  readonly values: readonly string[];
  readonly required: boolean;
};

export type CodecProfile = {
  readonly type: string;
  readonly name: string;
  readonly limitations: readonly CodecLimitation[];
};

export type ClientInfo = {
  readonly name: string;
  readonly platform: string;
  readonly maxAudioBitrate: number;
  readonly maxTranscodingAudioBitrate: number;
  readonly directPlayProfiles: readonly DirectPlayProfile[];
  readonly transcodingProfiles: readonly TranscodingProfile[];
  readonly codecProfiles: readonly CodecProfile[];
};

export type TranscodeStreamInfo = {
  readonly protocol: string;
  readonly container: string;
  readonly codec: string;
  readonly audioChannels: number;
  readonly audioBitrate: number;
  readonly audioProfile: string;
  readonly audioSamplerate: number;
  readonly audioBitdepth: number;
};

export type TranscodeDecision = {
  readonly canDirectPlay: boolean;
  readonly canTranscode: boolean;
  readonly transcodeReason?: readonly string[];
  readonly errorReason?: string;
  readonly transcodeParams?: string;
  readonly sourceStream?: TranscodeStreamInfo;
  readonly transcodeStream?: TranscodeStreamInfo;
};

type GetTranscodeDecisionResponse = {
  readonly transcodeDecision: TranscodeDecision;
  readonly status: string;
};

export const SONOS_CLIENT_INFO: ClientInfo = {
  name: "bonob-sonos",
  platform: "Sonos",
  maxAudioBitrate: 0,
  maxTranscodingAudioBitrate: 0,
  directPlayProfiles: [
    {
      containers: ["mp3"],
      audioCodecs: ["mp3"],
      protocols: ["http"],
      maxAudioChannels: 2,
    },
    {
      containers: ["ogg"],
      audioCodecs: ["vorbis"],
      protocols: ["http"],
      maxAudioChannels: 2,
    },
    {
      containers: ["flac"],
      audioCodecs: ["flac"],
      protocols: ["http"],
      maxAudioChannels: 2,
    },
    {
      containers: ["mp4"],
      audioCodecs: ["aac", "alac"],
      protocols: ["http"],
      maxAudioChannels: 2,
    },
  ],
  transcodingProfiles: [
    {
      container: "flac",
      audioCodec: "flac",
      protocol: "http",
      maxAudioChannels: 2,
    },
    {
      container: "mp3",
      audioCodec: "mp3",
      protocol: "http",
      maxAudioChannels: 2,
    },
  ],
  codecProfiles: [
    {
      type: "AudioCodec",
      name: "mp3",
      limitations: [
        {
          name: "audioSamplerate",
          comparison: "LessThanEqual",
          values: ["48000"],
          required: true,
        },
        {
          name: "audioChannels",
          comparison: "Equals",
          values: ["1", "2"],
          required: true,
        },
      ],
    },
    {
      type: "AudioCodec",
      name: "vorbis",
      limitations: [
        {
          name: "audioSamplerate",
          comparison: "LessThanEqual",
          values: ["48000"],
          required: true,
        },
        {
          name: "audioChannels",
          comparison: "Equals",
          values: ["1", "2"],
          required: true,
        },
      ],
    },
    {
      type: "AudioCodec",
      name: "aac",
      limitations: [
        {
          name: "audioSamplerate",
          comparison: "LessThanEqual",
          values: ["48000"],
          required: true,
        },
        {
          name: "audioChannels",
          comparison: "Equals",
          values: ["1", "2"],
          required: true,
        },
      ],
    },
    {
      type: "AudioCodec",
      name: "flac",
      limitations: [
        {
          name: "audioSamplerate",
          comparison: "LessThanEqual",
          values: ["48000"],
          required: true,
        },
        {
          name: "audioBitdepth",
          comparison: "LessThanEqual",
          values: ["24"],
          required: true,
        },
        {
          name: "audioChannels",
          comparison: "Equals",
          values: ["1", "2"],
          required: true,
        },
      ],
    },
    {
      type: "AudioCodec",
      name: "alac",
      limitations: [
        {
          name: "audioSamplerate",
          comparison: "LessThanEqual",
          values: ["48000"],
          required: true,
        },
        {
          name: "audioBitdepth",
          comparison: "LessThanEqual",
          values: ["24"],
          required: true,
        },
        {
          name: "audioChannels",
          comparison: "Equals",
          values: ["1", "2"],
          required: true,
        },
      ],
    },
  ],
};

export type ImageFetcher = (url: string) => Promise<CoverArt | undefined>;

export const cachingImageFetcher = (
  cacheDir: string, 
  delegate: ImageFetcher, 
  makeSharp = sharp
) =>
  async (url: string): Promise<CoverArt | undefined> => {
    const filename = path.join(cacheDir, `${createHash("md5").update(url).digest("hex")}.png`);
    return readFile(filename)
      .then((data) => ({ contentType: "image/png", data }))
      .catch(() =>
        delegate(url).then((image) => {
          if (image) {
            return makeSharp(image.data)
              .png()
              .toBuffer()
              .then((png) => {
                return writeFile(filename, png)
                  .then(() => ({ contentType: "image/png", data: png }));
              });
          } else {
            return undefined;
          }
        })
      );
  };

export const axiosImageFetcher = (url: string): Promise<CoverArt | undefined> =>
  axios
    .get(url, {
      headers: BROWSER_HEADERS,
      responseType: "arraybuffer",
    })
    .then((res) => ({
      contentType: String(res.headers["content-type"] ?? ""),
      data: Buffer.from(res.data, "binary"),
    }))
    .catch(() => undefined);

export const AlbumQueryTypeToSubsonicType: Record<AlbumQueryType, string> = {
  alphabeticalByArtist: "alphabeticalByArtist",
  alphabeticalByName: "alphabeticalByName",
  byGenre: "byGenre",
  byYear: "byYear",
  random: "random",
  recentlyPlayed: "recent",
  mostPlayed: "frequent",
  recentlyAdded: "newest",
  favourited: "starred",
  starred: "highest",
};

const artistIsInLibrary = (artistId: string | undefined) =>
  artistId != undefined && artistId != "-1";

export const asToken = (credentials: Credentials) =>
  b64Encode(JSON.stringify(credentials));

export const parseToken = (token: string): Credentials =>
  JSON.parse(b64Decode(token));

export class Subsonic {
  readonly url: URLBuilder;
  readonly customPlayers: CustomPlayers;
  readonly externalImageFetcher: ImageFetcher;

  constructor(
    // eslint-disable-next-line functional/prefer-immutable-types
    url: URLBuilder,
    customPlayers: CustomPlayers = NO_CUSTOM_PLAYERS,
    externalImageFetcher: ImageFetcher = axiosImageFetcher
  ) {
    this.url = url;
    this.customPlayers = customPlayers;
    this.externalImageFetcher = externalImageFetcher;
  }

  private readonly get = async (
    { username, password }: Credentials,
    path: string,
    q: {} = {},
    config: AxiosRequestConfig | undefined = {}
  ) =>
    axios
      .get(this.url.append({ pathname: path }).href(), {
        params: asURLSearchParams({
          u: username,
          v: "1.16.1",
          c: DEFAULT_CLIENT_APPLICATION,
          ...t_and_s(password),
          ...q,
        }),
        headers: {
          "User-Agent": USER_AGENT,
        },
        ...config,
      })
      .then((response) => {
        if (response.status != 200 && response.status != 206) {
          throw `Subsonic failed with a ${response.status || "no!"} status`;
        } else return response;
      });

  private readonly post = async (
    { username, password }: Credentials,
    path: string,
    q: {} = {},
    headers: {} = {},
    body: any = {},
    config: AxiosRequestConfig | undefined = {}
  ) =>
    axios
      .post(this.url.append({ pathname: path }).href(), body, {
        params: asURLSearchParams({
          u: username,
          v: "1.16.1",
          c: DEFAULT_CLIENT_APPLICATION,
          ...t_and_s(password),
          ...q,
        }),
        headers: {
          "User-Agent": USER_AGENT,
          ...headers
        },
        ...config,
      })
      .then((response) => {
        if (response.status != 200) {
          throw `Subsonic POST failed with a ${response.status || "no!"} status`;
        } else return response;
      });

  private readonly getJSON = async <T>(
    { username, password }: Credentials,
    path: string,
    q: {} = {}
  ): Promise<T> =>
    this.get({ username, password }, path, { f: "json", ...q })
      .then((response) => response.data as SubsonicEnvelope)
      .then((json) => json["subsonic-response"])
      .then((json) => {
        if (isError(json)) throw `Subsonic error:${json.error.message}`;
        else return json as unknown as T;
      });

  private readonly postJSON = async <T>(
    credentials: Credentials,
    path: string,
    q: {} = {},
    body: any = {}
  ): Promise<T> =>
    this.post(
        credentials, 
        path, 
        { f: "json", ...q }, 
        { "Content-Type": "application/json" }, 
        body
      )
      .then((response) => response.data as SubsonicEnvelope)
      .then((json) => json["subsonic-response"])
      .then((json) => {
        if (isError(json)) throw `Subsonic error:${json.error.message}`;
        else return json as unknown as T;
      });

  readonly ping = (credentials: Credentials): TE.TaskEither<AuthFailure, { readonly authenticated: boolean, readonly type: string}> => 
    pipe(
      TE.tryCatch(
        () => this.getJSON<PingResponse>(credentials, "/rest/ping.view"),
        (e) => new AuthFailure(String(e))
      ),
      TE.chain(it =>
        it.status === "ok"
          ? TE.right({ authenticated: true, type: it.type })
          : TE.left(new AuthFailure("Not authenticated, status not 'ok'"))
      )
    );

  readonly getArtists = (credentials: Credentials): Promise<GetArtists> =>
    this.getJSON<GetArtistsResponse>(credentials, "/rest/getArtists")
      .then((it) => it.artists);

      // todo: should be getArtistInfo2?
  readonly getArtistInfo = (
    credentials: Credentials,
    id: string
  ): Promise<{
    readonly similarArtist: readonly (ArtistSummary & { readonly inLibrary: boolean })[];
    readonly images: {
      readonly s: string | undefined;
      readonly m: string | undefined;
      readonly l: string | undefined;
    };
  }> =>
    this.getJSON<GetArtistInfoResponse>(credentials, "/rest/getArtistInfo2", {
      id,
      count: 50,
      includeNotPresent: true,
    })
      .then((it) => it.artistInfo2)
      .then((it) => ({
        images: {
          s: it.smallImageUrl,
          m: it.mediumImageUrl,
          l: it.largeImageUrl,
        },
        //todo: this does seem to be in OpenSubsonic?? it is also singular
        similarArtist: (it.similarArtist || []).map((artist) => ({
          id: `${artist.id}`,
          name: artist.name,
          // todo: whats this inLibrary used for? it probably should be filtered on??
          inLibrary: artistIsInLibrary(artist.id),
          image: artistImageURN({
            artistId: artist.id,
            artistImageURL: artist.artistImageUrl,
          }),
        })),
        })
      );

  readonly getAlbum = (credentials: Credentials, id: string): Promise<GetAlbum> =>
    this.getJSON<GetAlbumResponse>(credentials, "/rest/getAlbum", { id })
      .then((it) => it.album);
   
  readonly getArtist = (
    credentials: Credentials,
    id: string
  ): Promise<
    IdName & { readonly artistImageUrl: string | undefined; readonly albums: readonly AlbumSummary[] }
  > =>
    this.getJSON<GetArtistResponse>(credentials, "/rest/getArtist", {
      id,
    })
      .then((it) => it.artist)
      .then((it) => ({
        id: it.id,
        name: it.name,
        artistImageUrl: it.artistImageUrl,
        albums: this.toAlbumSummary(it.album || []),
      }));

  readonly getCoverArt = (credentials: Credentials, id: string, size?: number) =>
    this.get(credentials, "/rest/getCoverArt", size ? { id, size } : { id }, {
      headers: { "User-Agent": "bonob" },
      responseType: "arraybuffer",
    });

  readonly getTrack = (credentials: Credentials, id: string): Promise<OpenSubsonicSong> =>
    this.getJSON<GetSongResponse>(credentials, "/rest/getSong", {
      id,
    }).then((it) => it.song);

  readonly getStarred = (credentials: Credentials): Promise<GetStarredResponse["starred2"]> =>
    this.getJSON<GetStarredResponse>(credentials, "/rest/getStarred2").then(
      (it) => it.starred2
    );

  readonly toAlbumSummary = (albumList: readonly OpenSubsonicAlbum[]): readonly AlbumSummary[] =>
    albumList.map((album) => ({
      id: album.id,
      name: album.name,
      year: album.year,
      genre: maybeAsGenre(album.genre),
      artistId: album.artistId,
      artistName: album.artist,
      coverArt: coverArtToArt(album.coverArt),
    }));

  readonly search3 = (credentials: Credentials, q: any) =>
    this.getJSON<Search3Response>(credentials, "/rest/search3", {
      artistCount: 0,
      albumCount: 0,
      songCount: 0,
      ...q,
    }).then((it) => ({
      artists: it.searchResult3.artist || [],
      albums: it.searchResult3.album || [],
      songs: it.searchResult3.song || [],
    }));

  readonly getAlbumList2 = (credentials: Credentials, q: AlbumList2Query) =>
    this.getJSON<GetAlbumListResponse>(credentials, "/rest/getAlbumList2", {
      type: q.type,
      ...(q.genre ? { genre: b64Decode(q.genre) } : {}),
      ...(q.fromYear ? { fromYear: q.fromYear } : {}),
      ...(q.toYear ? { toYear: q.toYear } : {}),
      size: Math.min(q.size ?? 50, 500),
      offset: q.offset,
    })
      .then((response) => response.albumList2.album || [])
      .then(this.toAlbumSummary);

  readonly getGenres = (credentials: Credentials) =>
    this.getJSON<GetGenresResponse>(credentials, "/rest/getGenres").then((it) =>
      pipe(
        it.genres.genre || [],
        A.filter((it) => it.albumCount > 0),
        A.map((it) => it.value),
        A.sort(ordString),
        A.map(maybeAsGenre),
        A.filter((it) => it != undefined)
      )
    );

  private readonly st4r = (credentials: Credentials, action: string,  { id } : { readonly id: string }) => 
    this.getJSON<SubsonicResponse>(credentials, `/rest/${action}`, { id }).then(it => 
      it.status == "ok"
    );

  readonly star = (credentials: Credentials, ids : { readonly id: string }) => 
    this.st4r(credentials, "star", ids)

  readonly unstar = (credentials: Credentials, ids : { readonly id: string }) => 
    this.st4r(credentials, "unstar", ids)

  readonly setRating = (credentials: Credentials, id: string, rating: number) => 
    this.getJSON<SubsonicResponse>(credentials, `/rest/setRating`, {
      id,
      rating,
    })
    .then(it => it.status == "ok");

  readonly scrobble = (credentials: Credentials, id: string, submission: boolean) =>
    this.getJSON<SubsonicResponse>(credentials, `/rest/scrobble`, {
        id,
        submission,
      })
      .then(it => it.status == "ok")

  readonly stream = (credentials: Credentials, id: string, c: string, range: string | undefined) =>
    this.get(
      credentials,
      `/rest/stream`,
      {
        id,
        c,
      },
      {
        headers: pipe(
          range,
          O.fromNullable,
          O.map((range) => ({
            "User-Agent": USER_AGENT,
            Range: range,
          })),
          O.getOrElse(() => ({
            "User-Agent": USER_AGENT,
          }))
        ),
        responseType: "stream",
      }
    )
    .then((stream) => ({
      status: stream.status,
      // Response headers are always strings (or absent) on the wire - axios's broader
      // AxiosHeaderValue union only matters for headers set programmatically pre-request.
      headers: {
        "content-type": stream.headers["content-type"] as string | undefined,
        "content-length": stream.headers["content-length"] as string | undefined,
        "content-range": stream.headers["content-range"] as string | undefined,
        "accept-ranges": stream.headers["accept-ranges"] as string | undefined,
      },
      stream: stream.data,
    }));

  readonly getTranscodeDecision = async (
    credentials: Credentials,
    mediaId: string,
    // eslint-disable-next-line functional/prefer-immutable-types
    clientInfo: ClientInfo
  ): Promise<TranscodeDecision> =>
    this.postJSON<GetTranscodeDecisionResponse>(
      credentials,
      `/rest/getTranscodeDecision`,
      { mediaId, mediaType: "song" },
      clientInfo
    )
    .then((json) => json.transcodeDecision);

  readonly getTranscodeStream = (
    credentials: Credentials,
    mediaId: string,
    transcodeParams: string,
    range: string | undefined
  ) =>
    this.get(
      credentials,
      `/rest/getTranscodeStream`,
      {
        mediaId,
        mediaType: "song",
        transcodeParams,
      },
      {
        headers: pipe(
          range,
          O.fromNullable,
          O.map((range) => ({
            "User-Agent": USER_AGENT,
            Range: range,
          })),
          O.getOrElse(() => ({
            "User-Agent": USER_AGENT,
          }))
        ),
        responseType: "stream",
      }
    )
    .then((stream) => ({
      status: stream.status,
      // Response headers are always strings (or absent) on the wire - axios's broader
      // AxiosHeaderValue union only matters for headers set programmatically pre-request.
      headers: {
        "content-type": stream.headers["content-type"] as string | undefined,
        "content-length": stream.headers["content-length"] as string | undefined,
        "content-range": stream.headers["content-range"] as string | undefined,
        "accept-ranges": stream.headers["accept-ranges"] as string | undefined,
      },
      stream: stream.data,
    }));

  readonly playlists = (credentials: Credentials) =>
    this.getJSON<GetPlaylistsResponse>(credentials, "/rest/getPlaylists")
    .then(({ playlists }) => (playlists.playlist || []).map( it => ({
        id: it.id,
        name: it.name,
        coverArt: coverArtToArt(it.coverArt),
      }))
    );

  readonly playlist = (credentials: Credentials, id: string): Promise<GetPlaylistResponse["playlist"]> =>
    this.getJSON<GetPlaylistResponse>(credentials, "/rest/getPlaylist", {
      id,
    }).then(({ playlist }) => playlist);

    readonly createPlayList = (credentials: Credentials, name: string) =>
      this.getJSON<GetPlaylistResponse>(credentials, "/rest/createPlaylist", {
        name,
      })
      .then(({ playlist }) => ({
        id: playlist.id,
        name: playlist.name,
        coverArt: coverArtToArt(playlist.coverArt),
      }));

    readonly deletePlayList = (credentials: Credentials, id: string) => 
      this.getJSON<SubsonicResponse>(credentials, "/rest/deletePlaylist", {
        id,
      })
      .then(it => it.status == "ok");

    readonly updatePlaylist = (
      credentials: Credentials, 
      playlistId: string, 
      changes : Partial<{ readonly songIdToAdd: string | undefined, readonly songIndexToRemove: readonly number[] | undefined }> = {}
    ) => 
      this.getJSON<SubsonicResponse>(credentials, "/rest/updatePlaylist", {
        playlistId,
        ...changes
      })
      .then(it => it.status == "ok");

    readonly getSimilarSongs2 = (credentials: Credentials, id: string): Promise<readonly OpenSubsonicSong[]> =>
      this.getJSON<GetSimilarSongsResponse>(
        credentials,
        "/rest/getSimilarSongs2",
        //todo: remove this hard coded 50?
        { id, count: 50 }
      )
      .then((it) => it.similarSongs2.song || []);

    readonly getTopSongs = (credentials: Credentials, artist: string): Promise<readonly OpenSubsonicSong[]> =>
      this.getJSON<GetTopSongsResponse>(
        credentials,
        "/rest/getTopSongs",
        //todo: remove this hard coded 50?
        { artist, count: 50 }
      )
      .then((it) => it.topSongs.song || []);

  readonly getInternetRadioStations = (credentials: Credentials) =>
    this.getJSON<GetInternetRadioStationsResponse>(
      credentials,
      "/rest/getInternetRadioStations"
    )
    .then((it) => it.internetRadioStations.internetRadioStation || [])
    .then((stations) =>
      stations.map((it) => ({
        id: it.id,
        name: it.name,
        url: it.streamUrl,
        homePage: it.homePageUrl,
      }))
    );

  readonly getOpenSubsonicExtensions = (credentials: Credentials): Promise<readonly OpenSubsonicExtension[]> =>
    this.getJSON<GetOpenSubsonicExtensionsResponse>(
      credentials,
      "/rest/getOpenSubsonicExtensions.view"
    )
    .then((it) => it.openSubsonicExtensions || [])
    .catch((e: unknown) => {
      if (axios.isAxiosError(e) && e.response?.status === 404) return [];
      throw e
    });
};
