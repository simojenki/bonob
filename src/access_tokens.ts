import { Dayjs } from "dayjs";
import { v4 as uuid } from "uuid";
import crypto from "crypto";

import { Encryption } from "./encryption";
import logger from "./logger";
import { Clock, SystemClock } from "./clock";
import { b64Encode, b64Decode } from "./b64";

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

  constructor(clock: Clock = SystemClock) {
    this.clock = clock;
  }

  mint(authToken: string): string {
    this.clearOutExpired();
    const accessToken = {
      value: uuid(),
      authToken,
      expiry: this.clock.now().add(12, "hours"),
    };
    this.tokens.set(accessToken.value, accessToken);
    return accessToken.value;
  }

  authTokenFor(value: string): string | undefined {
    this.clearOutExpired();
    return this.tokens.get(value)?.authToken;
  }

  clearOutExpired() {
    Array.from(this.tokens.values())
      .filter((it) => it.expiry.isBefore(this.clock.now()))
      .forEach((expired) => {
        this.tokens.delete(expired.value);
      });
  }

  count = () => this.tokens.size;
}

export class EncryptedAccessTokens implements AccessTokens {
  encryption: Encryption;

  constructor(encryption: Encryption) {
    this.encryption = encryption;
  }

  mint = (authToken: string): string =>
    b64Encode(JSON.stringify(this.encryption.encrypt(authToken)));

  authTokenFor(value: string): string | undefined {
    try {
      return this.encryption.decrypt(
        JSON.parse(b64Decode(value))
      );
    } catch {
      logger.warn("Failed to decrypt access token...");
      return undefined;
    }
  }
}

export class AccessTokenPerAuthToken implements AccessTokens {
  authTokenToAccessToken = new Map<string, string>();
  accessTokenToAuthToken = new Map<string, string>();

  mint = (authToken: string): string => {
    if (this.authTokenToAccessToken.has(authToken)) {
      return this.authTokenToAccessToken.get(authToken)!;
    } else {
      const accessToken = uuid();
      this.authTokenToAccessToken.set(authToken, accessToken);
      this.accessTokenToAuthToken.set(accessToken, authToken);
      return accessToken;
    }
  };

  authTokenFor = (value: string): string | undefined => this.accessTokenToAuthToken.get(value);
}

export const sha256 = (salt: string) => (authToken: string) => crypto
  .createHash("sha256")
  .update(`${authToken}${salt}`)
  .digest("hex")

export class InMemoryAccessTokens implements AccessTokens {
  tokens = new Map<string, string>();
  minter;

  constructor(minter: (authToken: string) => string) {
    this.minter = minter
  }

  mint = (authToken: string): string => {
    const accessToken = this.minter(authToken);
    this.tokens.set(accessToken, authToken);
    return accessToken;
  }

  authTokenFor = (value: string): string | undefined => this.tokens.get(value);
}
