import { either as E } from "fp-ts";
import jwt from "jsonwebtoken";
import { v4 as uuid } from "uuid";
import { b64Decode, b64Encode } from "./b64";
import { Clock } from "./clock";

/** A JWT string — used as key in token stores */
export type JwtTokenString = string & { readonly __brand: unique symbol };

/** A UUID key — used as part of JWT signing secret */
export type SmapiKeyString = string & { readonly __brand: unique symbol };

/** Base64-encoded Subsonic credentials */
export type ServiceTokenString = string & { readonly __brand: unique symbol };

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
  token: JwtTokenString;
  key: SmapiKeyString;
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

export const smapiLoginUnauthorized = (faultstring?: string) =>
  faultstring
    ? { Fault: { ...SMAPI_FAULT_LOGIN_UNAUTHORIZED.Fault, faultstring } }
    : SMAPI_FAULT_LOGIN_UNAUTHORIZED;

export const SMAPI_FAULT_SERVICE_UNAVAILABLE = {
  Fault: {
    faultcode: "Server.ServiceUnavailable",
    faultstring: "Upstream music service was not available",
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
  serviceToken: ServiceTokenString;
  expiredJwt: JwtTokenString;

  constructor(serviceToken: ServiceTokenString, expiredJwt: JwtTokenString) {
    super("SMAPI token has expired");
    this.serviceToken = serviceToken;
    this.expiredJwt = expiredJwt;
  }

  toSmapiFault = () => ({
    Fault: {
      faultcode: "Client.TokenRefreshRequired",
      faultstring: "Token has expired",
    },
  });
}

export type SmapiAuthTokens = {
  issue: (serviceToken: ServiceTokenString) => SmapiToken;
  verify: (smapiToken: SmapiToken) => E.Either<ToSmapiFault, ServiceTokenString>;
  decodeUnverified: (token: JwtTokenString) => ServiceTokenString | undefined;
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
  JSON.parse(b64Decode(smapiTokenString)) as SmapiToken;

export const SMAPI_TOKEN_VERSION = 2;

export class JWTSmapiLoginTokens implements SmapiAuthTokens {
  private readonly clock: Clock;
  private readonly secret: string;
  private readonly expiresIn: string;
  private readonly version: number;
  private readonly keyGenerator: () => string;

  constructor(
    clock: Clock,
    secret: string,
    expiresIn: string,
    keyGenerator: () => string = uuid,
    version: number = SMAPI_TOKEN_VERSION
  ) {
    this.clock = clock;
    this.secret = secret;
    this.expiresIn = expiresIn;
    this.version = version;
    this.keyGenerator = keyGenerator;
  }

  issue = (serviceToken: ServiceTokenString) => {
    const key = this.keyGenerator() as SmapiKeyString;
    return {
      token: jwt.sign(
        { serviceToken, iat: this.clock.now().unix() },
        this.secret + this.version + key,
        { expiresIn: this.expiresIn }
      ) as JwtTokenString,
      key,
    };
  };

  decodeUnverified = (token: JwtTokenString): ServiceTokenString | undefined => {
    try {
      const decoded = jwt.decode(token) as any;
      return decoded?.serviceToken as ServiceTokenString | undefined;
    } catch {
      return undefined;
    }
  };

  verify = (smapiToken: SmapiToken): E.Either<ToSmapiFault, ServiceTokenString> => {
    try {
      return E.right(
        (
          jwt.verify(
            smapiToken.token,
            this.secret + this.version + smapiToken.key
          ) as any
        ).serviceToken as ServiceTokenString
      );
    } catch (e) {
      if (isTokenExpiredError(e)) {
        const serviceToken = (
          jwt.verify(
            smapiToken.token,
            this.secret + this.version + smapiToken.key,
            { ignoreExpiration: true }
          ) as any
        ).serviceToken as ServiceTokenString;
        return E.left(new ExpiredTokenError(serviceToken, smapiToken.token));
      } else if (isError(e)) return E.left(new InvalidTokenError(e.message));
      else return E.left(new InvalidTokenError("Failed to verify token"));
    }
  };
}
