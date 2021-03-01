import { option as O } from "fp-ts";
import { pipe } from "fp-ts/lib/function";

import { ArtistWithAlbums } from "./builders";
import {
  MusicService,
  Credentials,
  AuthSuccess,
  AuthFailure,
  Artist,
  MusicLibrary,
  Paging,
} from "../src/music_service";

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
  }: Credentials): Promise<AuthSuccess | AuthFailure> {
    if (
      username != undefined &&
      password != undefined &&
      this.users[username] == password
    ) {
      return Promise.resolve({
        authToken: JSON.stringify({ username, password }),
        userId: username,
        nickname: username,
      });
    } else {
      return Promise.resolve({ message: `Invalid user:${username}` });
    }
  }

  login(token: string): Promise<MusicLibrary> {
    const credentials = JSON.parse(token) as Credentials;
    if (this.users[credentials.username] != credentials.password)
      return Promise.reject("Invalid auth token");
    return Promise.resolve({
      artists: ({ _index, _count }: Paging) => {
        const i0 = _index || 0;
        const i1 = _count ? i0 + _count : undefined;
        const artists = this.artists.map(artistWithAlbumsToArtist);
        return Promise.resolve([artists.slice(i0, i1), artists.length]);
      },
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
        const albums = this.artists
          .filter(
            pipe(
              O.fromNullable(artistId),
              O.map(artistWithId),
              O.getOrElse(() => all)
            )
          )
          .flatMap((it) => it.albums);
        return Promise.resolve([albums.slice(i0, i1), albums.length]);
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
