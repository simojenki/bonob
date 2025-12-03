import crypto from "crypto";
import ms, { StringValue } from "ms";
import { Clock, SystemClock } from "./clock";
import { Dayjs } from "dayjs";
import _ from "underscore";

export interface APITokens {
  mint(authToken: string): string;
  authTokenFor(apiToken: string): string | undefined;
}


export const sha256 = (salt: string) => (value: string) => crypto
  .createHash("sha256")
  .update(`${value}${salt}`)
  .digest("hex")


export class InMemoryAPITokens implements APITokens {
  tokens = new Map<string, { authToken: string, expiresAt: Dayjs }>();
  clock;
  minter;
  timeout_ms;

  constructor(
    clock: Clock = SystemClock, 
    timeout: StringValue = "1h", 
    minter: (authToken: string) => string = sha256('bonob')
  ) {
    this.clock = clock;
    this.timeout_ms = ms(timeout)
    this.minter = minter
  }

  mint = (authToken: string): string => {
    const apiToken = this.minter(authToken);
    this.tokens.set(apiToken, { authToken, expiresAt: this.clock.now().add(this.timeout_ms, 'ms') });

    const expired = [...this.tokens.entries()].filter(([_, minted]) => minted.expiresAt.isBefore(this.clock.now()))
    expired.forEach(([apiToken,_]) => this.tokens.delete(apiToken))

    return apiToken;
  }

  authTokenFor = (apiToken: string): string | undefined => {
    const minted = this.tokens.get(apiToken)
    return minted != null && minted.expiresAt.isAfter(this.clock.now()) ? minted.authToken : undefined
  };

  authTokens = () => [...this.tokens.values()].map((it) => it.authToken)
}
