import { Either, left, right } from "fp-ts/lib/Either";
import jwt from "jsonwebtoken";
import { v4 as uuid } from "uuid";
import { b64Decode, b64Encode } from "./b64";
import { Clock } from "./clock";

export type SmapiFault = { Fault: { faultcode: string, faultstring: string } }
export type SmapiRefreshTokenResultFault = SmapiFault & { Fault: { detail: { refreshAuthTokenResult: { authToken: string, privateKey: string  } }} }

function isError(thing: any): thing is Error {
  return thing.name && thing.message
}

export function isSmapiRefreshTokenResultFault(fault: SmapiFault): fault is SmapiRefreshTokenResultFault {
  return (fault.Fault as any).detail?.refreshAuthTokenResult != undefined;
}

export type SmapiToken = {
  token: string;
  key: string;
};

export interface ToSmapiFault {
  toSmapiFault(smapiAuthTokens: SmapiAuthTokens): SmapiFault
}

export class MissingLoginTokenError extends Error implements ToSmapiFault {
  _tag = "MissingLoginTokenError";

  constructor() {
    super("Missing Login Token");
  }

  toSmapiFault = (_: SmapiAuthTokens) => ({
    Fault: {
      faultcode: "Client.LoginUnsupported",
      faultstring: "Missing credentials...",
    },
  })
}


export class InvalidTokenError extends Error implements ToSmapiFault {
  _tag = "InvalidTokenError";

  constructor(message: string) {
    super(message);
  }

  toSmapiFault = (_: SmapiAuthTokens) => ({
    Fault: {
      faultcode: "Client.LoginUnauthorized",
      faultstring: "Failed to authenticate, try Re-Authorising your account in the sonos app",
    },
  })
}

export class ExpiredTokenError extends Error implements ToSmapiFault {
  _tag = "ExpiredTokenError";
  authToken: string;
  expiredAt: number;

  constructor(authToken: string, expiredAt: number) {
    super("SMAPI token has expired");
    this.authToken = authToken;
    this.expiredAt = expiredAt;
  }

  toSmapiFault = (smapiAuthTokens: SmapiAuthTokens) => {
    const newToken = smapiAuthTokens.issue(this.authToken)
    return {
      Fault: {
        faultcode: "Client.TokenRefreshRequired",
        faultstring: "Token has expired",
        detail: {
          refreshAuthTokenResult: {
            authToken: newToken.token,
            privateKey: newToken.key,
          },
        },
      }
    };
  }
}

export function isExpiredTokenError(thing: any): thing is ExpiredTokenError {
  return thing._tag == "ExpiredTokenError";
}

export type SmapiAuthTokens = {
  issue: (serviceToken: string) => SmapiToken;
  verify: (smapiToken: SmapiToken) => Either<ToSmapiFault, string>;
};

type TokenExpiredError = {
  name: string,
  message: string,
  expiredAt: number
}

function isTokenExpiredError(thing: any): thing is TokenExpiredError {
  return thing.name == 'TokenExpiredError';
}

export const smapiTokenAsString = (smapiToken: SmapiToken) => b64Encode(JSON.stringify({
  token: smapiToken.token,
  key: smapiToken.key
}));
export const smapiTokenFromString = (smapiTokenString: string): SmapiToken => JSON.parse(b64Decode(smapiTokenString));

export const SMAPI_TOKEN_VERSION = 2;

export class JWTSmapiLoginTokens implements SmapiAuthTokens {
  private readonly clock: Clock;
  private readonly secret: string;
  private readonly expiresIn: string;
  private readonly version: number;
  private readonly keyGenerator: () => string;

  constructor(clock: Clock, secret: string, expiresIn: string, keyGenerator: () => string = uuid, version: number = SMAPI_TOKEN_VERSION) {
    this.clock = clock;
    this.secret = secret;
    this.expiresIn = expiresIn;
    this.version = version;
    this.keyGenerator = keyGenerator;
  }

  issue = (serviceToken: string) => {
    const key = this.keyGenerator();
    return {
      token: jwt.sign(
        { serviceToken, iat: this.clock.now().unix() },
        this.secret + this.version + key,
        { expiresIn: this.expiresIn }
      ),
      key,
    };
  };

  verify = (smapiToken: SmapiToken): Either<ToSmapiFault, string> => {
    try {
      return right((jwt.verify(smapiToken.token, this.secret + this.version + smapiToken.key) as any).serviceToken);
    } catch (e) {
      if(isTokenExpiredError(e)) {
        const x = ((jwt.verify(smapiToken.token, this.secret + this.version + smapiToken.key, { ignoreExpiration: true })) as any).serviceToken;
        return left(new ExpiredTokenError(x, e.expiredAt))
      } else if(isError(e))
        return left(new InvalidTokenError(e.message));
      else
        return left(new InvalidTokenError("Failed to verify token"))
    }
  };
}
