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

export interface MusicService {
  generateToken(credentials: Credentials): Promise<AuthSuccess | AuthFailure>;
  login(authToken: string): Promise<MusicLibrary>;
}

export type Artist = {
  id: string;
  name: string;
};

export type Album = {
  id: string;
  name: string;
};

export type Paging = {
  _index?: number;
  _count?: number;
};

export type Result<T> = {
  results: T[],
  total: number
}

export function slice2<T>({ _index, _count }: Paging) {
  const i0 = _index || 0;
  const i1 = _count ? i0 + _count : undefined;
  return (things: T[]): [T[], number] => [things.slice(i0, i1), things.length]
}

export const asResult = <T>([results, total]: [T[], number]) => ({ results, total })

export interface MusicLibrary {
  artists({ _index, _count }: Paging): Promise<Result<Artist>>;
  artist(id: string): Artist;
  albums({
    artistId,
    _index,
    _count,
  }: {
    artistId?: string;
  } & Paging): Promise<Result<Album>>;
}
