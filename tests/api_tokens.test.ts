import { v4 as uuid } from "uuid";

import {
  InMemoryAPITokens,
  sha256
} from "../src/api_tokens";

describe('sha256 minter', () => {
  it('should return the same value for the same salt and authToken', () => {
    const authToken = uuid();
    const token1 = sha256("salty")(authToken);
    const token2 = sha256("salty")(authToken);

    expect(token1).not.toEqual(authToken);
    expect(token1).toEqual(token2);
  });

  it('should returrn different values for the same salt but different authTokens', () => {
    const authToken1 = uuid();
    const authToken2 = uuid();

    const token1 = sha256("salty")(authToken1);
    const token2= sha256("salty")(authToken2);

    expect(token1).not.toEqual(token2);
  });

  it('should return different values for the same authToken but different salts', () => {
    const authToken = uuid();

    const token1 = sha256("salt1")(authToken);
    const token2= sha256("salt2")(authToken);

    expect(token1).not.toEqual(token2);
  });
});

describe("InMemoryAPITokens", () => {
  const reverseAuthToken = (authToken: string) => authToken.split("").reverse().join("");

  const accessTokens = new InMemoryAPITokens(reverseAuthToken);

  it("should return the same access token for the same auth token", () => {
    const authToken = "token1";
    
    const accessToken1 = accessTokens.mint(authToken);
    const accessToken2 = accessTokens.mint(authToken);

    expect(accessToken1).not.toEqual(authToken);
    expect(accessToken1).toEqual(accessToken2);
  });

  describe("when there is an auth token for the access token", () => {
    it("should be able to retrieve it", () => {
      const authToken = uuid();
      const accessToken = accessTokens.mint(authToken);

      expect(accessTokens.authTokenFor(accessToken)).toEqual(authToken);
    });
  });

  describe("when there is no auth token for the access token", () => {
    it("should return undefined", () => {
      expect(accessTokens.authTokenFor(uuid())).toBeUndefined();
    });
  });
});
