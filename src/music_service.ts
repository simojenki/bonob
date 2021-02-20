import axios from "axios";
import { Md5 } from "ts-md5/dist/md5";

const s = "foobar100";
const navidrome = process.env["BONOB_NAVIDROME_URL"];
const u = process.env["BONOB_USER"];
const t = Md5.hashStr(`${process.env["BONOB_PASSWORD"]}${s}`);

export type Credentials = { username: string, password: string }

export interface MusicService {
  login(credentials: Credentials): boolean
}

export class Navidrome implements MusicService {
  login(_: Credentials) {
    return false
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



