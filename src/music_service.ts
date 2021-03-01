
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

export interface MusicLibrary {
  artists(): Artist[];
  artist(id: string): Artist;
  albums({ artistId, _index, _count }: { artistId?: string, _index?: number, _count?: number }): Album[];
}
