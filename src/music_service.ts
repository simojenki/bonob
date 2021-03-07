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
  image: Images;
};

export type Images = {
  small: string | undefined;
  medium: string | undefined;
  large: string | undefined;
};

export type Artist = ArtistSummary & {
  albums: AlbumSummary[];
};

export type AlbumSummary = {
  id: string;
  name: string;
  year: string | undefined;
  genre: string | undefined;
};

export type Album = AlbumSummary & {
  tracks: Track[]
};

export type Track = {
  id: string;
  name: string;
  mimeType: string;
  duration: string;
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

export type AlbumQuery = Paging & {
  genre?: string;
};

export const artistToArtistSummary = (it: Artist): ArtistSummary => ({
  id: it.id,
  name: it.name,
  image: it.image,
});

export const albumToAlbumSummary = (it: Album): AlbumSummary => ({
  id: it.id,
  name: it.name,
  year: it.year,
  genre: it.genre,
});

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
  genres(): Promise<string[]>;
}
