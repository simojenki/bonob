import { option as O } from "fp-ts";
import * as A from "fp-ts/Array";
import { fromEquals } from "fp-ts/lib/Eq";
import { pipe } from "fp-ts/lib/function";
import { ordString, fromCompare } from "fp-ts/lib/Ord";

import {
  MusicService,
  Credentials,
  AuthSuccess,
  AuthFailure,
  Artist,
  MusicLibrary,
  ArtistQuery,
  AlbumQuery,
  slice2,
  asResult,
  artistToArtistSummary,
  albumToAlbumSummary,
  Album,
  Track,
  Genre,
} from "../src/music_service";

type P<T> = (t: T) => boolean;
const all: P<any> = (_: any) => true;

const albumWithGenre = (genreId: string): P<[Artist, Album]> => ([_, album]) =>
  album.genre?.id === genreId;

export class InMemoryMusicService implements MusicService {
  users: Record<string, string> = {};
  artists: Artist[] = [];
  tracks: Track[] = [];

  generateToken({
    username,
    password,
  }: Credentials): Promise<AuthSuccess | AuthFailure> {
    if (
      username != undefined &&
      password != undefined &&
      this.users[username] == password
    ) {
      return Promise.resolve({
        authToken: Buffer.from(JSON.stringify({ username, password })).toString(
          "base64"
        ),
        userId: username,
        nickname: username,
      });
    } else {
      return Promise.resolve({ message: `Invalid user:${username}` });
    }
  }

  login(token: string): Promise<MusicLibrary> {
    const credentials = JSON.parse(
      Buffer.from(token, "base64").toString("ascii")
    ) as Credentials;
    if (this.users[credentials.username] != credentials.password)
      return Promise.reject("Invalid auth token");

    return Promise.resolve({
      artists: (q: ArtistQuery) =>
        Promise.resolve(this.artists.map(artistToArtistSummary))
          .then(slice2(q))
          .then(asResult),
      artist: (id: string) =>
        pipe(
          this.artists.find((it) => it.id === id),
          O.fromNullable,
          O.map((it) => Promise.resolve(it)),
          O.getOrElse(() => Promise.reject(`No artist with id '${id}'`))
        ),
      albums: (q: AlbumQuery) =>
        Promise.resolve(
          this.artists
            .flatMap((artist) => artist.albums.map((album) => [artist, album]))
            .filter(
              pipe(
                O.fromNullable(q.genre),
                O.map(albumWithGenre),
                O.getOrElse(() => all)
              )
            )
        )
          .then((matches) => matches.map(([_, album]) => album as Album))
          .then((it) => it.map(albumToAlbumSummary))
          .then(slice2(q))
          .then(asResult),
      album: (id: string) =>
        pipe(
          this.artists.flatMap((it) => it.albums).find((it) => it.id === id),
          O.fromNullable,
          O.map((it) => Promise.resolve(it)),
          O.getOrElse(() => Promise.reject(`No album with id '${id}'`))
        ),
      genres: () =>
        Promise.resolve(
          pipe(
            this.artists,
            A.map((it) => it.albums),
            A.flatten,
            A.map((it) => O.fromNullable(it.genre)),
            A.compact,
            A.uniq(fromEquals((x, y) => x.id === y.id)),
            A.sort(
              fromCompare<Genre>((x, y) => ordString.compare(x.id, y.id))
            )
          )
        ),
      tracks: (albumId: string) =>
        Promise.resolve(this.tracks.filter((it) => it.album.id === albumId)),
      track: (trackId: string) =>
        pipe(
          this.tracks.find((it) => it.id === trackId),
          O.fromNullable,
          O.map((it) => Promise.resolve(it)),
          O.getOrElse(() =>
            Promise.reject(`Failed to find track with id ${trackId}`)
          )
        ),
      stream: (_: { trackId: string; range: string | undefined }) =>
        Promise.reject("unsupported operation"),
      coverArt: (id: string, _: "album" | "artist", size?: number) =>
        Promise.reject(`Cannot retrieve coverArt for ${id}, size ${size}`),
      scrobble: async (_: string) => {
        return Promise.resolve(true);
      },
    });
  }

  hasUser(credentials: Credentials) {
    this.users[credentials.username] = credentials.password;
    return this;
  }

  hasNoUsers() {
    this.users = {};
    return this;
  }

  hasArtists(...newArtists: Artist[]) {
    this.artists = [...this.artists, ...newArtists];
    return this;
  }

  hasTracks(...newTracks: Track[]) {
    this.tracks = [...this.tracks, ...newTracks];
    return this;
  }

  clear() {
    this.users = {};
    this.artists = [];
    this.tracks = [];
    return this;
  }
}
