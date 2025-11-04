import { either as E } from "fp-ts";
import jwt from "jsonwebtoken";
import { b64Decode, b64Encode } from "./b64";
import { Clock } from "./clock";
import { StringValue } from 'ms'

export type SmapiFault = { Fault: { faultcode: string; faultstring: string } };
export type SmapiRefreshTokenResultFault = SmapiFault & {
  Fault: {
    detail: {
      refreshAuthTokenResult: { authToken: string; privateKey: string };
    };
  };
};

function isError(thing: any): thing is Error {
  return thing.name && thing.message;
}

export function isSmapiRefreshTokenResultFault(
  fault: SmapiFault
): fault is SmapiRefreshTokenResultFault {
  return (fault.Fault as any).detail?.refreshAuthTokenResult != undefined;
}

export type SmapiToken = {
  token: string;
  key: string;
};

export interface ToSmapiFault {
  _tag: string;
  toSmapiFault(): SmapiFault
}

export const SMAPI_FAULT_LOGIN_UNAUTHORIZED = {
  Fault: {
    faultcode: "Client.LoginUnauthorized",
    faultstring:
      "Failed to authenticate, try Re-Authorising your account in the sonos app",
  },
};

export const SMAPI_FAULT_LOGIN_UNSUPPORTED = {
  Fault: {
    faultcode: "Client.LoginUnsupported",
    faultstring: "Missing credentials...",
  },
};

export class MissingLoginTokenError extends Error implements ToSmapiFault {
  _tag = "MissingLoginTokenError";

  constructor() {
    super("Missing Login Token");
  }

  toSmapiFault = () => SMAPI_FAULT_LOGIN_UNSUPPORTED;
}


export class InvalidTokenError extends Error implements ToSmapiFault {
  _tag = "InvalidTokenError";

  constructor(message: string) {
    super(message);
  }

  toSmapiFault = () => SMAPI_FAULT_LOGIN_UNAUTHORIZED;
}

export function isExpiredTokenError(thing: any): thing is ExpiredTokenError {
  return thing._tag == "ExpiredTokenError";
}

export class ExpiredTokenError extends Error implements ToSmapiFault {
  _tag = "ExpiredTokenError";
  expiredToken: string;

  constructor(expiredToken: string) {
    super("SMAPI token has expired");
    this.expiredToken = expiredToken;
  }

  toSmapiFault = () => ({
    Fault: {
      faultcode: "Client.TokenRefreshRequired",
      faultstring: "Token has expired",
    },
  });
}

export type SmapiAuthTokens = {
  issue: (serviceToken: string) => SmapiToken;
  verify: (smapiToken: SmapiToken) => E.Either<ToSmapiFault, string>;
};

type TokenExpiredError = {
  name: string;
  message: string;
  expiredAt: number;
};

function isTokenExpiredError(thing: any): thing is TokenExpiredError {
  return thing.name == "TokenExpiredError";
}

export const smapiTokenAsString = (smapiToken: SmapiToken) =>
  b64Encode(
    JSON.stringify({
      token: smapiToken.token,
      key: smapiToken.key,
    })
  );
export const smapiTokenFromString = (smapiTokenString: string): SmapiToken =>
  JSON.parse(b64Decode(smapiTokenString));

export const SMAPI_TOKEN_VERSION = 3;

export class JWTSmapiLoginTokens implements SmapiAuthTokens {
  private readonly clock: Clock;
  private readonly secret: string;
  private readonly expiresIn: StringValue;
  private readonly key: string;

  constructor(
    clock: Clock,
    secret: string,
    expiresIn: StringValue,
    version: number = SMAPI_TOKEN_VERSION
  ) {
    this.clock = clock;
    this.secret = secret;
    this.expiresIn = expiresIn;
    this.key = this.secret + "." + version 
  }

  issue = (serviceToken: string) => ({
      token: jwt.sign(
        { serviceToken, iat: this.clock.now().unix() },
        this.key,
        { expiresIn: this.expiresIn }
      ),
      // todo: remove this entirely
      key: "nonsense"
    });

  verify = (smapiToken: SmapiToken): E.Either<ToSmapiFault, string> => {
    try {
      return E.right(
        (
          jwt.verify(
            smapiToken.token,
            this.key
          ) as any
        ).serviceToken
      );
    } catch (e) {
      if (isTokenExpiredError(e)) {
        const serviceToken = (
          jwt.verify(
            smapiToken.token,
            this.key,
            { ignoreExpiration: true }
          ) as any
        ).serviceToken;
        return E.left(new ExpiredTokenError(serviceToken));
      } else if (isError(e)) return E.left(new InvalidTokenError(e.message));
      else return E.left(new InvalidTokenError("Failed to verify token"));
    }
  };
}
