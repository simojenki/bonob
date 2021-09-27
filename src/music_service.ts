export type Credentials = { username: string; password: string };

export function isSuccess(
  authResult: AuthSuccess | AuthFailure
): authResult is AuthSuccess {
  return (authResult as AuthSuccess).authToken !== undefined;
}

export function isFailure(
  authResult: any | AuthFailure
): authResult is AuthFailure {
  return (authResult as AuthFailure).message !== undefined;
}

export type AuthSuccess = {
  authToken: string;
  userId: string;
  nickname: string;
};

export type AuthFailure = {
  message: string;
};

export type ArtistSummary = {
  id: string;
  name: string;
};

export type Images = {
  small: string | undefined;
  medium: string | undefined;
  large: string | undefined;
};

export const NO_IMAGES: Images = {
  small: undefined,
  medium: undefined,
  large: undefined,
};

export type SimilarArtist = ArtistSummary & { inLibrary: boolean };

export type Artist = ArtistSummary & {
  image: Images
  albums: AlbumSummary[];
  similarArtists: SimilarArtist[]
};

export type AlbumSummary = {
  id: string;
  name: string;
  year: string | undefined;
  genre: Genre | undefined;
  coverArt: string | undefined;

  artistName: string;
  artistId: string;
};

export type Album = AlbumSummary & {};

export type Genre = {
  name: string;
  id: string;
}

export type Track = {
  id: string;
  name: string;
  mimeType: string;
  duration: number;
  number: number | undefined;
  genre: Genre | undefined;
  coverArt: string | undefined;
  album: AlbumSummary;
  artist: ArtistSummary;
};

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

export type AlbumQueryType = 'alphabeticalByArtist' | 'alphabeticalByName' | 'byGenre' | 'random' | 'recent' | 'frequent' | 'newest' | 'starred';

export type AlbumQuery = Paging & {
  type: AlbumQueryType;
  genre?: string;
};

export const artistToArtistSummary = (it: Artist): ArtistSummary => ({
  id: it.id,
  name: it.name,
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
  name: it.name
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
  name: string
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
  generateToken(credentials: Credentials): Promise<AuthSuccess | AuthFailure>;
  login(authToken: string): Promise<MusicLibrary>;
}

export interface MusicLibrary {
  artists(q: ArtistQuery): Promise<Result<ArtistSummary>>;
  artist(id: string): Promise<Artist>;
  albums(q: AlbumQuery): Promise<Result<AlbumSummary>>;
  album(id: string): Promise<Album>;
  tracks(albumId: string): Promise<Track[]>;
  track(trackId: string): Promise<Track>;
  genres(): Promise<Genre[]>;
  stream({
    trackId,
    range,
  }: {
    trackId: string;
    range: string | undefined;
  }): Promise<TrackStream>;
  coverArt(id: string, size?: number): Promise<CoverArt | undefined>;
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
}
