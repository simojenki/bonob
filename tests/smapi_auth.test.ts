import { v4 as uuid } from "uuid";
import jwt from "jsonwebtoken";

import {
  ExpiredTokenError,
  InvalidTokenError,
  isSmapiRefreshTokenResultFault,
  JWTSmapiLoginTokens,
  smapiTokenAsString,
  smapiTokenFromString,
  SMAPI_TOKEN_VERSION,
} from "../src/smapi_auth";
import { either as E } from "fp-ts";
import { FixedClock } from "../src/clock";
import dayjs from "dayjs";
import { b64Encode } from "../src/b64";

describe("smapiTokenAsString", () => {
  it("can round trip token to and from string", () => {
    const smapiToken = { token: uuid(), key: uuid(), someOtherStuff: 'this needs to be explicitly ignored' };
    const asString = smapiTokenAsString(smapiToken)

    expect(asString).toEqual(b64Encode(JSON.stringify({
      token: smapiToken.token,
      key: smapiToken.key,
    })));
    expect(smapiTokenFromString(asString)).toEqual({
      token: smapiToken.token,
      key: smapiToken.key
    });
  });
});

describe("isSmapiRefreshTokenResultFault", () => {
  it("should return true for a refreshAuthTokenResult fault", () => {
    const faultWithRefreshAuthToken = {
      Fault: {
        faultcode: "",
        faultstring: "",
        detail: {
          refreshAuthTokenResult: {
            authToken: "x",
            privateKey: "x",
          },
        },
      },
    };
    expect(isSmapiRefreshTokenResultFault(faultWithRefreshAuthToken)).toEqual(
      true
    );
  });

  it("should return false when is not a refreshAuthTokenResult", () => {
    expect(isSmapiRefreshTokenResultFault({ Fault: { faultcode: "", faultstring:" " }})).toEqual(
      false
    );
  });
});

describe("auth", () => {
  describe("JWTSmapiLoginTokens", () => {
    const clock = new FixedClock(dayjs());

    const expiresIn = "1h";
    const secret = `secret-${uuid()}`;
    const smapiLoginTokens = new JWTSmapiLoginTokens(clock, secret, expiresIn);

    describe("issuing a new token", () => {
      it("should issue a token that can then be verified", () => {
        const serviceToken = uuid();

        const smapiToken = smapiLoginTokens.issue(serviceToken);

        expect(smapiToken.token).toEqual(
          jwt.sign(
            {
              serviceToken,
              iat: Math.floor(clock.now().toDate().getDate() / 1000),
            },
            secret + SMAPI_TOKEN_VERSION + smapiToken.key,
            { expiresIn }
          )
        );
        expect(smapiToken.token).not.toContain(serviceToken);
        expect(smapiToken.token).not.toContain(secret);
        expect(smapiToken.token).not.toContain(":");

        const roundTripped = smapiLoginTokens.verify(smapiToken);

        expect(roundTripped).toEqual(E.right(serviceToken));
      });
    });

    describe("when verifying the token fails", () => {
      describe("due to the version changing", () => {
        it("should return an error", () => {
          const authToken = uuid();

          const vXSmapiTokens = new JWTSmapiLoginTokens(
            clock,
            secret,
            expiresIn,
            () => uuid(),
            SMAPI_TOKEN_VERSION
          );

          const vXPlus1SmapiTokens = new JWTSmapiLoginTokens(
            clock,
            secret,
            expiresIn,
            () => uuid(),
            SMAPI_TOKEN_VERSION + 1
          );

          const v1Token = vXSmapiTokens.issue(authToken);
          expect(vXSmapiTokens.verify(v1Token)).toEqual(E.right(authToken));

          const result = vXPlus1SmapiTokens.verify(v1Token);
          expect(result).toEqual(
            E.left(new InvalidTokenError("invalid signature"))
          );
        });
      });
      
      describe("due to secret changing", () => {
        it("should return an error", () => {
          const authToken = uuid();

          const smapiToken = new JWTSmapiLoginTokens(
            clock,
            "A different secret",
            expiresIn
          ).issue(authToken);

          const result = smapiLoginTokens.verify(smapiToken);
          expect(result).toEqual(
            E.left(new InvalidTokenError("invalid signature"))
          );
        });
      });

      describe("due to key changing", () => {
        it("should return an error", () => {
          const authToken = uuid();

          const smapiToken = smapiLoginTokens.issue(authToken);

          const result = smapiLoginTokens.verify({
            ...smapiToken,
            key: "some other key",
          });
          expect(result).toEqual(
            E.left(new InvalidTokenError("invalid signature"))
          );
        });
      });
    });

    describe("when the token has expired", () => {
      it("should return an ExpiredTokenError, with the authToken", () => {
        const authToken = uuid();
        const now = dayjs();
        const tokenIssuedAt = now.subtract(31, "seconds");

        const tokensWith30SecondExpiry = new JWTSmapiLoginTokens(
          clock,
          uuid(),
          "30s"
        );

        clock.time = tokenIssuedAt;
        const expiredToken = tokensWith30SecondExpiry.issue(authToken);

        clock.time = now;

        const result = tokensWith30SecondExpiry.verify(expiredToken);
        expect(result).toEqual(
          E.left(
            new ExpiredTokenError(
              authToken,
              tokenIssuedAt.add(30, "seconds").unix()
            )
          )
        );
      });
    });
  });
});
