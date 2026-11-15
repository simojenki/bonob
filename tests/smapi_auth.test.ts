import { randomUUID as uuid } from "crypto";
import jwt from "jsonwebtoken";

import {
  ExpiredTokenError,
  InvalidTokenError,
  isSmapiRefreshTokenResultFault,
  JWTSmapiLoginTokens,
  SMAPI_TOKEN_VERSION,
} from "../src/smapi_auth";
import { either as E } from "fp-ts";
import { FixedClock } from "../src/clock";
import dayjs from "dayjs";


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
      const serviceToken = `service-token-${uuid()}`;

      it("should issue a token that can then be verified", () => {
        const smapiToken = smapiLoginTokens.issue(serviceToken);

        expect(smapiToken.token).not.toContain(secret);
        expect(smapiToken.token).not.toContain(":");

        const roundTripped = smapiLoginTokens.verify(smapiToken);

        expect(roundTripped).toEqual(E.right(serviceToken));
      });

      it("should sign it with HS256 as bonob, expiring after expiresIn", () => {
        const { header, payload } = jwt.decode(smapiLoginTokens.issue(serviceToken).token, { complete: true })!;

        expect(header.alg).toEqual("HS256");
        expect(payload).toMatchObject({
          iss: "bonob",
          iat: clock.now().unix(),
          exp: clock.now().unix() + 60 * 60,
        });
      });

      it("should not expose the service token", () => {
        // JWT payloads are only base64-encoded, so anyone holding the token can decode them
        const decoded = JSON.stringify(jwt.decode(smapiLoginTokens.issue(serviceToken).token));

        expect(decoded).not.toContain(serviceToken);
      });
    });

    describe("when verifying the token fails", () => {
      describe("due to the version changing", () => {
        it("should return an error", () => {
          const authToken = uuid();

          const vXSmapiTokens = new JWTSmapiLoginTokens(
            clock,
            secret,
            expiresIn
          );

          const vXPlus1SmapiTokens = new JWTSmapiLoginTokens(
            clock,
            secret,
            expiresIn,
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

          const result = new JWTSmapiLoginTokens(clock, "different-secret", expiresIn).verify(smapiToken);
          expect(result).toEqual(
            E.left(new InvalidTokenError("invalid signature"))
          );
        });
      });

      describe("due to the service token not being encrypted", () => {
        it("should return an error", () => {
          const smapiToken = {
            token: jwt.sign(
              { serviceToken: uuid(), iat: clock.now().unix() },
              secret + "." + SMAPI_TOKEN_VERSION,
              { algorithm: "HS256", expiresIn, issuer: "bonob" }
            ),
          };

          const result = smapiLoginTokens.verify(smapiToken);
          expect(result).toEqual(
            E.left(new InvalidTokenError("Failed to decrypt service token"))
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
              authToken
            )
          )
        );
      });
    });
  });
});
