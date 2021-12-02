import crypto from "crypto";

export interface APITokens {
  mint(authToken: string): string;
  authTokenFor(apiToken: string): string | undefined;
}


export const sha256 = (salt: string) => (value: string) => crypto
  .createHash("sha256")
  .update(`${value}${salt}`)
  .digest("hex")


export class InMemoryAPITokens implements APITokens {
  tokens = new Map<string, string>();
  minter;

  constructor(minter: (authToken: string) => string = sha256('bonob')) {
    this.minter = minter
  }

  mint = (authToken: string): string => {
    const accessToken = this.minter(authToken);
    this.tokens.set(accessToken, authToken);
    return accessToken;
  }

  authTokenFor = (apiToken: string): string | undefined => this.tokens.get(apiToken);
}
