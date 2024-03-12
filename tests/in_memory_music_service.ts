import { option as O, taskEither as TE } from "fp-ts";
import * as A from "fp-ts/Array";
import { fromEquals } from "fp-ts/lib/Eq";
import { pipe } from "fp-ts/lib/function";
import { ordString, fromCompare } from "fp-ts/lib/Ord";
import { shuffle } from "underscore";

import { b64Encode, b64Decode } from "../src/b64";

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
  Track,
  Genre,
  Rating,
} from "../src/music_service";
import { BUrn } from "../src/burn";

export class InMemoryMusicService implements MusicService {
  users: Record<string, string> = {};
  artists: Artist[] = [];
  tracks: Track[] = [];

  generateToken({
    username,
    password,
  }: Credentials): TE.TaskEither<AuthFailure, AuthSuccess> {
    if (
      username != undefined &&
      password != undefined &&
      this.users[username] == password
    ) {
      return TE.right({
        serviceToken: b64Encode(JSON.stringify({ username, password })),
        userId: username,
        nickname: username,
        type: "in-memory"
      });
    } else {
      return TE.left(new AuthFailure(`Invalid user:${username}`));
    }
  }

  refreshToken(serviceToken: string): TE.TaskEither<AuthFailure, AuthSuccess> {
    return this.generateToken(JSON.parse(b64Decode(serviceToken)))
  }

  login(serviceToken: string): Promise<MusicLibrary> {
    const credentials = JSON.parse(b64Decode(serviceToken)) as Credentials;
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
          this.artists.flatMap((artist) =>
            artist.albums.map((album) => ({ artist, album }))
          )
        )
          .then((artist2Album) => {
            switch (q.type) {
              case "alphabeticalByArtist":
                return artist2Album;
              case "alphabeticalByName":
                return artist2Album.sort((a, b) =>
                  a.album.name.localeCompare(b.album.name)
                );
              case "byGenre":
                return artist2Album.filter(
                  (it) => it.album.genre?.id === q.genre
                );
              case "random":
                return shuffle(artist2Album);
              default:
                return [];
            }
          })
          .then((matches) => matches.map((it) => it.album))
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
            A.sort(fromCompare<Genre>((x, y) => ordString.compare(x.id, y.id)))
          )
        ),
      tracks: (albumId: string) =>
        Promise.resolve(
          this.tracks
            .filter((it) => it.album.id === albumId)
            .map((it) => ({ ...it, rating: { love: false, stars: 0 } }))
        ),
      rate: (_: string, _2: Rating) => Promise.resolve(false),
      track: (trackId: string) =>
        pipe(
          this.tracks.find((it) => it.id === trackId),
          O.fromNullable,
          O.map((it) => Promise.resolve({ ...it, rating: { love: false, stars: 0 } })),
          O.getOrElse(() =>
            Promise.reject(`Failed to find track with id ${trackId}`)
          )
        ),
      stream: (_: { trackId: string; range: string | undefined }) =>
        Promise.reject("unsupported operation"),
      coverArt: (coverArtURN: BUrn, size?: number) =>
        Promise.reject(`Cannot retrieve coverArt for ${coverArtURN}, size ${size}`),
      scrobble: async (_: string) => {
        return Promise.resolve(true);
      },
      nowPlaying: async (_: string) => {
        return Promise.resolve(true);
      },
      searchArtists: async (_: string) => Promise.resolve([]),
      searchAlbums: async (_: string) => Promise.resolve([]),
      searchTracks: async (_: string) => Promise.resolve([]),
      playlists: async () => Promise.resolve([]),
      playlist: async (id: string) =>
        Promise.reject(`No playlist with id ${id}`),
      createPlaylist: async (_: string) =>
        Promise.reject("Unsupported operation"),
      deletePlaylist: async (_: string) =>
        Promise.reject("Unsupported operation"),
      addToPlaylist: async (_: string) =>
        Promise.reject("Unsupported operation"),
      removeFromPlaylist: async (_: string, _2: number[]) =>
        Promise.reject("Unsupported operation"),
      similarSongs: async (_: string) => Promise.resolve([]),
      topSongs: async (_: string) => Promise.resolve([]),
      radioStations: async () => Promise.resolve([]),
      radioStation: async (_: string) => Promise.reject("Unsupported operation"),
      years: async () => Promise.resolve([]),
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
