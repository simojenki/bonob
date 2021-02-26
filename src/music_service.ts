import axios from "axios";
import { Md5 } from "ts-md5/dist/md5";

const s = "foobar100";
const navidrome = process.env["BONOB_NAVIDROME_URL"];
const u = process.env["BONOB_USER"];
const t = Md5.hashStr(`${process.env["BONOB_PASSWORD"]}${s}`);

export type Credentials = { username: string, password: string }

export function isSuccess(authResult: AuthSuccess | AuthFailure): authResult is AuthSuccess {
  return (authResult as AuthSuccess).authToken !== undefined;
}

export type AuthSuccess = {
  authToken: string
  userId: string
  nickname: string  
}

export type AuthFailure = {
  message: string
}

export interface MusicService {
  login(credentials: Credentials): AuthSuccess | AuthFailure
}

export class Navidrome implements MusicService {
  login({ username }: Credentials) {
    return { authToken: `v1:${username}`, userId: username, nickname: username }
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



