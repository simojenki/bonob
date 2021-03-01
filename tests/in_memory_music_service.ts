import { option as O } from "fp-ts";
import { pipe } from "fp-ts/lib/function";
import {
  MusicService,
  Credentials,
  AuthSuccess,
  AuthFailure,
  Artist,
  Album,
  MusicLibrary,
} from "../src/music_service";

export type ArtistWithAlbums = Artist & {
  albums: Album[];
};

const artistWithAlbumsToArtist = (it: ArtistWithAlbums): Artist => ({
  id: it.id,
  name: it.name,
});

const getOrThrow = (message: string) =>
  O.getOrElseW(() => {
    throw message;
  });

type P<T> = (t: T) => boolean;
const all: P<any> = (_: any) => true;
const artistWithId = (id: string): P<Artist> => (artist: Artist) =>
  artist.id === id;

export class InMemoryMusicService implements MusicService {
  users: Record<string, string> = {};
  artists: ArtistWithAlbums[] = [];

  generateToken({
    username,
    password,
  }: Credentials): AuthSuccess | AuthFailure {
    if (
      username != undefined &&
      password != undefined &&
      this.users[username] == password
    ) {
      return {
        authToken: JSON.stringify({ username, password }),
        userId: username,
        nickname: username,
      };
    } else {
      return { message: `Invalid user:${username}` };
    }
  }

  login(token: string): MusicLibrary | AuthFailure {
    const credentials = JSON.parse(token) as Credentials;
    if (this.users[credentials.username] != credentials.password) {
      return {
        message: "Invalid auth token",
      };
    }
    return {
      artists: () => this.artists.map(artistWithAlbumsToArtist),
      artist: (id: string) =>
        pipe(
          this.artists.find((it) => it.id === id),
          O.fromNullable,
          O.map(artistWithAlbumsToArtist),
          getOrThrow(`No artist with id '${id}'`)
        ),
      albums: ({
        artistId,
        _index,
        _count,
      }: {
        artistId?: string;
        _index?: number;
        _count?: number;
      }) => {
        const i0 = _index || 0;
        const i1 = _count ? i0 + _count : undefined;
        return this.artists
          .filter(
            pipe(
              O.fromNullable(artistId),
              O.map(artistWithId),
              O.getOrElse(() => all)
            )
          )
          .flatMap((it) => it.albums)
          .slice(i0, i1);
      },
    };
  }

  hasUser(credentials: Credentials) {
    this.users[credentials.username] = credentials.password;
    return this;
  }

  hasNoUsers() {
    this.users = {};
    return this;
  }

  hasArtists(...newArtists: ArtistWithAlbums[]) {
    this.artists = [...this.artists, ...newArtists];
    return this;
  }

  clear() {
    this.users = {};
    this.artists = [];
    return this;
  }
}
