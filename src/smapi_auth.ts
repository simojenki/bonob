import { either as E } from "fp-ts";
import { pipe } from "fp-ts/lib/function";
import jwt, { JwtPayload } from "jsonwebtoken";
import { Clock } from "./clock";
import { StringValue } from 'ms'
import { cryptoEncryption, Encryption } from "./encryption";

export type SmapiFault = { readonly Fault: { readonly faultcode: string; readonly faultstring: string } };
export type SmapiRefreshTokenResultFault = SmapiFault & {
  readonly Fault: {
    readonly detail: {
      readonly refreshAuthTokenResult: { readonly authToken: string; readonly privateKey: string };
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
  readonly token: string
};

// eslint-disable-next-line functional/no-mixed-types
export interface ToSmapiFault {
  readonly _tag: string;
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
  readonly _tag = "MissingLoginTokenError";

  constructor() {
    super("Missing Login Token");
  }

  readonly toSmapiFault = () => SMAPI_FAULT_LOGIN_UNSUPPORTED;
}


export class InvalidTokenError extends Error implements ToSmapiFault {
  readonly _tag = "InvalidTokenError";

  constructor(message: string) {
    super(message);
  }

  readonly toSmapiFault = () => SMAPI_FAULT_LOGIN_UNAUTHORIZED;
}

export function isExpiredTokenError(thing: any): thing is ExpiredTokenError {
  return thing._tag == "ExpiredTokenError";
}

export class ExpiredTokenError extends Error implements ToSmapiFault {
  readonly _tag = "ExpiredTokenError";
  readonly expiredToken: string;

  constructor(expiredToken: string) {
    super("SMAPI token has expired");
    this.expiredToken = expiredToken;
  }

  readonly toSmapiFault = () => ({
    Fault: {
      faultcode: "Client.TokenRefreshRequired",
      faultstring: "Token has expired",
    },
  });
}

export type SmapiAuthTokens = {
  readonly issue: (serviceToken: string) => SmapiToken;
  readonly verify: (smapiToken: SmapiToken) => E.Either<ToSmapiFault, string>;
};

type TokenExpiredError = {
  readonly name: string;
  readonly message: string;
  readonly expiredAt: number;
};

function isTokenExpiredError(thing: any): thing is TokenExpiredError {
  return thing.name == "TokenExpiredError";
}

export const SMAPI_TOKEN_VERSION = 6;

export class JWTSmapiLoginTokens implements SmapiAuthTokens {
  private readonly clock: Clock;
  private readonly secret: string;
  private readonly expiresIn: StringValue;
  private readonly encryption: Encryption;

  constructor(
    clock: Clock,
    secret: string,
    expiresIn: StringValue,
    version: number = SMAPI_TOKEN_VERSION
  ) {
    this.clock = clock;
    this.expiresIn = expiresIn;
    this.secret = secret + "." + version 
    this.encryption = cryptoEncryption(`${this.secret}.serviceToken`);
  }

  readonly issue = (serviceToken: string) => ({
      token: jwt.sign(
        { serviceToken: this.encryption.encrypt(serviceToken), iat: this.clock.now().unix() },
        this.secret,
        { 
          algorithm: "HS256",
          expiresIn: this.expiresIn,
          issuer: "bonob"
        }
      )
    });

  private readonly serviceTokenFrom = (payload: string | Readonly<JwtPayload>): E.Either<ToSmapiFault, string> =>
    pipe(
      this.encryption.decrypt((payload as any).serviceToken),
      E.mapLeft(() => new InvalidTokenError("Failed to decrypt service token"))
    );

  readonly verify = (smapiToken: SmapiToken): E.Either<ToSmapiFault, string> => {
    try {
      return this.serviceTokenFrom(
        jwt.verify(
          smapiToken.token,
          this.secret
        )
      );
    } catch (e) {
      if (isTokenExpiredError(e)) {
        return pipe(
          this.serviceTokenFrom(
            jwt.verify(
              smapiToken.token,
              this.secret,
              { ignoreExpiration: true }
            )
          ),
          E.flatMap((serviceToken) => E.left(new ExpiredTokenError(serviceToken)))
        );
      } else if (isError(e)) return E.left(new InvalidTokenError(e.message));
      else return E.left(new InvalidTokenError("Failed to verify token"));
    }
  };
}
