import dayjs, { Dayjs } from 'dayjs';
import { v4 as uuid } from 'uuid';

export interface Clock {
  now(): Dayjs
}

type AccessToken = {
  value: string;
  authToken: string;
  expiry: Dayjs;
};

export interface AccessTokens {
  mint(authToken: string): string;
  authTokenFor(value: string): string | undefined;
}

export class ExpiringAccessTokens implements AccessTokens {
  tokens = new Map<string, AccessToken>();
  clock: Clock;
  
  constructor(clock : Clock = { now: () => dayjs() }) {
    this.clock = clock
  }

  mint(authToken: string): string {
    this.clearOutExpired();
    const accessToken = {
      value: uuid(),
      authToken,
      expiry: this.clock.now().add(12, 'hours')
    };
    this.tokens.set(accessToken.value, accessToken);
    return accessToken.value;
  }

  authTokenFor(value: string): string | undefined {
    this.clearOutExpired();
    return this.tokens.get(value)?.authToken;
  }

  clearOutExpired() {
    Array.from(this.tokens.values()).filter(it => it.expiry.isBefore(this.clock.now())).forEach(expired => {
      this.tokens.delete(expired.value);
    })
  }

  count = () => this.tokens.size;
}
