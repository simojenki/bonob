import { v4 as uuid } from "uuid";
import dayjs from "dayjs";

import {
  AccessTokenPerAuthToken,
  EncryptedAccessTokens,
  ExpiringAccessTokens,
} from "../src/access_tokens";
import { Encryption } from "../src/encryption";

describe("ExpiringAccessTokens", () => {
  let now = dayjs();

  const accessTokens = new ExpiringAccessTokens({ now: () => now });

  describe("tokens", () => {
    it("they should be unique", () => {
      const authToken = uuid();
      expect(accessTokens.mint(authToken)).not.toEqual(
        accessTokens.mint(authToken)
      );
    });
  });

  describe("tokens that dont exist", () => {
    it("should return undefined", () => {
      expect(accessTokens.authTokenFor("doesnt exist")).toBeUndefined();
    });
  });

  describe("tokens that have not expired", () => {
    it("should be able to return them", () => {
      const authToken = uuid();

      const accessToken = accessTokens.mint(authToken);

      expect(accessTokens.authTokenFor(accessToken)).toEqual(authToken);
    });

    it("should be able to have many per authToken", () => {
      const authToken = uuid();

      const accessToken1 = accessTokens.mint(authToken);
      const accessToken2 = accessTokens.mint(authToken);

      expect(accessTokens.authTokenFor(accessToken1)).toEqual(authToken);
      expect(accessTokens.authTokenFor(accessToken2)).toEqual(authToken);
    });
  });

  describe("tokens that have expired", () => {
    describe("retrieving it", () => {
      it("should return undefined", () => {
        const authToken = uuid();

        now = dayjs();
        const accessToken = accessTokens.mint(authToken);

        now = now.add(12, "hours").add(1, "second");

        expect(accessTokens.authTokenFor(accessToken)).toBeUndefined();
      });
    });

    describe("should be cleared out", () => {
      const authToken1 = uuid();
      const authToken2 = uuid();

      now = dayjs();

      const accessToken1_1 = accessTokens.mint(authToken1);
      const accessToken2_1 = accessTokens.mint(authToken2);

      expect(accessTokens.count()).toEqual(2);
      expect(accessTokens.authTokenFor(accessToken1_1)).toEqual(authToken1);
      expect(accessTokens.authTokenFor(accessToken2_1)).toEqual(authToken2);

      now = now.add(12, "hours").add(1, "second");

      const accessToken1_2 = accessTokens.mint(authToken1);

      expect(accessTokens.count()).toEqual(1);
      expect(accessTokens.authTokenFor(accessToken1_1)).toBeUndefined();
      expect(accessTokens.authTokenFor(accessToken2_1)).toBeUndefined();
      expect(accessTokens.authTokenFor(accessToken1_2)).toEqual(authToken1);

      now = now.add(6, "hours");

      const accessToken2_2 = accessTokens.mint(authToken2);

      expect(accessTokens.count()).toEqual(2);
      expect(accessTokens.authTokenFor(accessToken1_1)).toBeUndefined();
      expect(accessTokens.authTokenFor(accessToken2_1)).toBeUndefined();
      expect(accessTokens.authTokenFor(accessToken1_2)).toEqual(authToken1);
      expect(accessTokens.authTokenFor(accessToken2_2)).toEqual(authToken2);

      now = now.add(6, "hours").add(1, "minute");

      expect(accessTokens.authTokenFor(accessToken1_1)).toBeUndefined();
      expect(accessTokens.authTokenFor(accessToken2_1)).toBeUndefined();
      expect(accessTokens.authTokenFor(accessToken1_2)).toBeUndefined();
      expect(accessTokens.authTokenFor(accessToken2_2)).toEqual(authToken2);
      expect(accessTokens.count()).toEqual(1);

      now = now.add(6, "hours").add(1, "minute");

      expect(accessTokens.authTokenFor(accessToken1_1)).toBeUndefined();
      expect(accessTokens.authTokenFor(accessToken2_1)).toBeUndefined();
      expect(accessTokens.authTokenFor(accessToken1_2)).toBeUndefined();
      expect(accessTokens.authTokenFor(accessToken2_2)).toBeUndefined();
      expect(accessTokens.count()).toEqual(0);
    });
  });
});

describe("EncryptedAccessTokens", () => {
  const encryption = {
    encrypt: jest.fn(),
    decrypt: jest.fn(),
  };

  const accessTokens = new EncryptedAccessTokens(
    (encryption as unknown) as Encryption
  );

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetAllMocks();
  });

  describe("encrypt and decrypt", () => {
    it("should be able to round trip the token", () => {
      const authToken = `the token - ${uuid()}`;
      const hash = {
        encryptedData: "the encrypted token",
        iv: "vi",
      };

      encryption.encrypt.mockReturnValue(hash);
      encryption.decrypt.mockReturnValue(authToken);

      const accessToken = accessTokens.mint(authToken);

      expect(accessToken).not.toContain(authToken);
      expect(accessToken).toEqual(
        Buffer.from(JSON.stringify(hash)).toString("base64")
      );

      expect(accessTokens.authTokenFor(accessToken)).toEqual(authToken);

      expect(encryption.encrypt).toHaveBeenCalledWith(authToken);
      expect(encryption.decrypt).toHaveBeenCalledWith(hash);
    });
  });

  describe("when the token is a valid Hash but doesnt decrypt", () => {
    it("should return undefined", () => {
      const hash = {
        encryptedData: "valid hash",
        iv: "vi",
      };
      encryption.decrypt.mockImplementation(() => {
        throw "Boooooom decryption failed!!!";
      });
      expect(
        accessTokens.authTokenFor(
          Buffer.from(JSON.stringify(hash)).toString("base64")
        )
      ).toBeUndefined();
    });
  });

  describe("when the token is not even a valid hash", () => {
    it("should return undefined", () => {
      encryption.decrypt.mockImplementation(() => {
        throw "Boooooom decryption failed!!!";
      });
      expect(accessTokens.authTokenFor("some rubbish")).toBeUndefined();
    });
  });
});

describe("AccessTokenPerAuthToken", () => {
  const accessTokens = new AccessTokenPerAuthToken();

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
