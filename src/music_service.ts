import { BUrn } from "./burn";
import { taskEither as TE } from "fp-ts";

export type Credentials = { username: string; password: string };

export type AuthSuccess = {
  serviceToken: string;
  userId: string;
  nickname: string;
};

export class AuthFailure extends Error {
  constructor(message: string) {
    super(message);
  }
};

export type ArtistSummary = {
  id: string | undefined;
  name: string;
  image: BUrn | undefined;
};

export type SimilarArtist = ArtistSummary & { inLibrary: boolean };

export type Artist = ArtistSummary & {
  albums: AlbumSummary[];
  similarArtists: SimilarArtist[]
};

export type AlbumSummary = {
  id: string;
  name: string;
  year: string | undefined;
  genre: Genre | undefined;
  coverArt: BUrn | undefined;

  artistName: string | undefined;
  artistId: string | undefined;
};

export type Album = AlbumSummary & {};

export type Genre = {
  name: string;
  id: string;
}

export type Year = {
  year: string;
}

export type Rating = {
  love: boolean;
  stars: number;
}

export type Encoding = {
  player: string,
  mimeType: string
}

export type Track = {
  id: string;
  name: string;
  encoding: Encoding,
  duration: number;
  number: number | undefined;
  genre: Genre | undefined;
  coverArt: BUrn | undefined;
  album: AlbumSummary;
  artist: ArtistSummary;
  rating: Rating;
};

export type RadioStation = {
  id: string,
  name: string,
  url: string,
  homePage?: string
}

export type Paging = {
  _index: number;
  _count: number;
};

export type Result<T> = {
  results: T[];
  total: number;
};

export function slice2<T>({ _index, _count }: Paging) {
  return (things: T[]): [T[], number] => [
    things.slice(_index, _index + _count),
    things.length,
  ];
}

export const asResult = <T>([results, total]: [T[], number]) => ({
  results,
  total,
});

export type ArtistQuery = Paging;

export type AlbumQueryType = 'alphabeticalByArtist' | 'alphabeticalByName' | 'byGenre' | 'byYear' | 'random' | 'recentlyPlayed' | 'mostPlayed' | 'recentlyAdded' | 'favourited' | 'starred';

export type AlbumQuery = Paging & {
  type: AlbumQueryType;
  genre?: string;
  fromYear?: string;
  toYear?: string;
};

export const artistToArtistSummary = (it: Artist): ArtistSummary => ({
  id: it.id,
  name: it.name,
  image: it.image
});

export const albumToAlbumSummary = (it: Album): AlbumSummary => ({
  id: it.id,
  name: it.name,
  year: it.year,
  genre: it.genre,
  artistName: it.artistName,
  artistId: it.artistId,
  coverArt: it.coverArt
});

export const playlistToPlaylistSummary = (it: Playlist): PlaylistSummary => ({
  id: it.id,
  name: it.name,
  coverArt: it.coverArt
})

export type StreamingHeader = "content-type" | "content-length" | "content-range" | "accept-ranges";

export type TrackStream = {
  status: number;
  headers: Record<StreamingHeader, string>;
  stream: any;
};

export type CoverArt = {
  contentType: string;
  data: Buffer;
}

export type PlaylistSummary = {
  id: string,
  name: string,
  coverArt?: BUrn | undefined
}

export type Playlist = PlaylistSummary & {
  entries: Track[]
}

export const range = (size: number) => [...Array(size).keys()];

export const asArtistAlbumPairs = (artists: Artist[]): [Artist, Album][] =>
  artists.flatMap((artist) =>
    artist.albums.map((album) => [artist, album] as [Artist, Album])
  );

export interface MusicService {
  generateToken(credentials: Credentials): TE.TaskEither<AuthFailure, AuthSuccess>;
  refreshToken(serviceToken: string): TE.TaskEither<AuthFailure, AuthSuccess>;
  login(serviceToken: string): Promise<MusicLibrary>;
}

export interface MusicLibrary {
  artists(q: ArtistQuery): Promise<Result<ArtistSummary>>;
  artist(id: string): Promise<Artist>;
  albums(q: AlbumQuery): Promise<Result<AlbumSummary>>;
  album(id: string): Promise<Album>;
  tracks(albumId: string): Promise<Track[]>;
  track(trackId: string): Promise<Track>;
  genres(): Promise<Genre[]>;
  years(): Promise<Year[]>;
  stream({
    trackId,
    range,
  }: {
    trackId: string;
    range: string | undefined;
  }): Promise<TrackStream>;
  rate(trackId: string, rating: Rating): Promise<boolean>;
  coverArt(coverArtURN: BUrn, size?: number): Promise<CoverArt | undefined>;
  nowPlaying(id: string): Promise<boolean>
  scrobble(id: string): Promise<boolean>
  searchArtists(query: string): Promise<ArtistSummary[]>;
  searchAlbums(query: string): Promise<AlbumSummary[]>;
  searchTracks(query: string): Promise<Track[]>;
  playlists(): Promise<PlaylistSummary[]>;
  playlist(id: string): Promise<Playlist>;
  createPlaylist(name: string): Promise<PlaylistSummary>
  deletePlaylist(id: string): Promise<boolean>
  addToPlaylist(playlistId: string, trackId: string): Promise<boolean>
  removeFromPlaylist(playlistId: string, indicies: number[]): Promise<boolean>
  similarSongs(id: string): Promise<Track[]>;
  topSongs(artistId: string): Promise<Track[]>;
  radioStation(id: string): Promise<RadioStation>
  radioStations(): Promise<RadioStation[]>
}
