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


export type Artist = {
  id: string;
  name: string;
  image: {
    small: string | undefined,
    medium: string | undefined,
    large: string | undefined,
  }
};

export type Album = {
  id: string;
  name: string;
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

export type ArtistQuery = Paging

export type AlbumQuery = Paging & {
  artistId?: string
}
export interface MusicService {
  generateToken(credentials: Credentials): Promise<AuthSuccess | AuthFailure>;
  login(authToken: string): Promise<MusicLibrary>;
}

export interface MusicLibrary {
  artists(q: ArtistQuery): Promise<Result<Artist>>;
  artist(id: string): Artist;
  albums(q: AlbumQuery): Promise<Result<Album>>;
}
