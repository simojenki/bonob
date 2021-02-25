import {
  MusicService,
  Credentials,
  AuthSuccess,
  AuthFailure,
} from "../src/music_service";


export class InMemoryMusicService implements MusicService {
  users: Record<string, string> = {};

  login({ username, password }: Credentials): AuthSuccess | AuthFailure {
    if (
      username != undefined &&
      password != undefined &&
      this.users[username] == password
    ) {
      return { authToken: { value: "token123", version: "1" }, userId: username, nickname: username };
    } else {
      return { message: `Invalid user:${username}` };
    }
  }

  hasUser(credentials: Credentials) {
    this.users[credentials.username] = credentials.password;
  }

  hasNoUsers() {
    this.users = {};
  }

  clear() {
    this.users = {};
  }
}
