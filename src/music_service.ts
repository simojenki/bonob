import axios from "axios";
import { Md5 } from "ts-md5/dist/md5";

const s = "foobar100";
const navidrome = process.env["BONOB_NAVIDROME_URL"];
const u = process.env["BONOB_USER"];
const t = Md5.hashStr(`${process.env["BONOB_PASSWORD"]}${s}`);

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
  generateToken(credentials: Credentials): AuthSuccess | AuthFailure;
  login(authToken: string): MusicLibrary | AuthFailure;
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

export class Navidrome implements MusicService {
  generateToken({ username }: Credentials) {
    return {
      authToken: `v1:${username}`,
      userId: username,
      nickname: username,
    };
  }

  login(_: string) {
    return {
      artists: () => [],
      artist: (id: string) => ({
        id,
        name: id,
      }),
      albums: ({ artistId }: { artistId?: string }) => {
        console.log(artistId)
        return []
      },
    };
  }

  ping = (): Promise<boolean> =>
    axios
      .get(
        `${navidrome}/rest/ping.view?u=${u}&t=${t}&s=${s}&v=1.16.1.0&c=myapp`
      )
      .then((_) => true)
      .catch((e) => {
        console.log(e);
        return false;
      });
}
