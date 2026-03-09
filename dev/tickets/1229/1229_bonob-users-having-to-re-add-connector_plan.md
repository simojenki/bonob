# OAuth Flow Fix — Implementation Plan

## Overview

Improve auth flow logging, fix a space leak from mismatched token key types, add branded types for compile-time safety, clean up log verbosity, and return the correct SOAP fault when the upstream Subsonic/Astiga service is unavailable. 

## Current State Analysis

### Token Flow
1. **serviceToken**: base64-encoded Subsonic credentials (`{username, password, type, bearer}`)
2. **SmapiToken**: `{token: JWT, key: UUID}` — the JWT payload contains the serviceToken
3. **`SonosSoap.tokens`**: dictionary keyed by JWT strings, values are `SmapiToken`

### The Space Leak
When Sonos sends an expired JWT:
```
auth() → verify() → ExpiredTokenError(serviceToken) →
  refreshToken(serviceToken) → issue(newServiceToken) → newSmapiToken →
  swapToken(serviceToken) → associateCredentialsForToken(newJwt, newSmapiToken, serviceToken) →
    delete this.tokens[serviceToken]  ← NO-OP: tokens keyed by JWT, not serviceToken
```
Old JWT entries accumulate in `this.tokens` and S3, never cleaned up.

### Upstream Unavailability Returns Wrong Fault
When Astiga returns HTTP 503 (or any non-auth error), the error flows through:
```
refreshToken → generateToken → getJSON("/rest/ping.view") → axios 503 →
  TE.tryCatch → TE.left(new AuthFailure("Subsonic failed with: ...")) →
  smapi.ts login(): TE.getOrElse → SMAPI_FAULT_LOGIN_UNAUTHORIZED
```
Per the [SMAPI error handling spec](https://docs.sonos.com/docs/error-handling), the correct fault is `Server.ServiceUnavailable`. Returning `Client.LoginUnauthorized` causes Sonos to treat upstream outages as credential failures, prompting users to re-add the service.

The `AuthFailure` class (`src/music_service.ts:12-16`) does not distinguish between authentication errors (bad credentials) and service unavailability (network/5xx). Both produce `AuthFailure`, and `smapi.ts` maps all `AuthFailure` to `LoginUnauthorized`.

### Key Discoveries
- `ExpiredTokenError.expiredToken` holds a **serviceToken**, not a JWT — the original JWT is discarded by `verify()` (`src/smapi_auth.ts:172`)
- `swapToken` passes this serviceToken as `oldToken` to `associateCredentialsForToken`, but `delete this.tokens[oldToken]` expects a JWT key (`src/smapi.ts:248`) — always a no-op
- Five error handlers silently discard errors: `src/smapi.ts:471,527,547,686` and the `.catch` at line 250
- Winston's `format.errors({ stack: true })` only works when Error is the first arg — throughout the codebase errors are passed in metadata where `JSON.stringify(error)` produces `{}`
- The `soapyService.log` handler at `src/smapi.ts:1348-1362` passes `{ level: "info", data }` as the first argument to `logger.debug()`, producing unnecessarily nested output like `{"level":"debug","message":{"data":"...`
- The serviceToken is base64 JSON containing `username` — can be extracted via `parseToken()` from `subsonic.ts` to add user context to SMAPI logs
- Debug level is controlled by `BNB_LOG_LEVEL` environment variable (`src/logger.ts:9`), defaulting to `info`

### What We're NOT Doing
- Fixing the Sonos client's failure to persist refreshed tokens (can't control client)
- Changing the `autoRefreshEnabled`/`pollInterval` behaviour
- Migrating existing accumulated orphan tokens in S3
- Changing the `PersistentTokenStore` interface

## Desired End State

After this plan is complete:
- All auth failure paths log the cause at WARN level with `reqId` and `username`
- The `soapyService.log` handler produces clean log output without double-nesting
- `swapToken` correctly deletes old JWT entries from in-memory and S3 stores
- Branded types prevent future mismatches between JWT strings and service token strings at compile time
- `authToken` values are truncated in logs to avoid leaking full JWTs
- "Updated credentials" log is promoted to INFO for visibility without debug mode
- Upstream Subsonic/Astiga unavailability returns `Server.ServiceUnavailable` instead of `Client.LoginUnauthorized`

## Implementation Approach

Four phases: (1) logging improvements and cleanup, (2) return correct SOAP fault for upstream unavailability, (3) branded types and space leak fix, (4) log level adjustments. Each phase is independently valuable and testable.

---

## Phase 1: Error Extraction Helper + Logging + Log Cleanup

### Overview
Add a utility to safely extract error details, add logging to all silent error handlers, fix the soap log nesting, add username to SMAPI logs, and truncate authTokens in log output.

### Changes Required:

#### 1a. Add `extractErrorDetails` to `src/logger.ts`

**File**: `src/logger.ts`

Add after the existing `debugIt` function:

```typescript
/**
 * Safely extracts loggable details from an unknown error value.
 * Handles Error instances, Axios errors (avoiding circular refs),
 * and arbitrary thrown values.
 */
export function extractErrorDetails(error: unknown): { message: string; stack?: string; code?: string } {
  if (error instanceof Error) {
    const details: { message: string; stack?: string; code?: string } = {
      message: error.message,
      stack: error.stack,
    };
    if ('code' in error && typeof (error as any).code === 'string') {
      details.code = (error as any).code;
    }
    return details;
  }
  if (typeof error === 'string') {
    return { message: error };
  }
  try {
    return { message: JSON.stringify(error) };
  } catch {
    return { message: String(error) };
  }
}
```

#### 1b. Add `usernameFrom` helper to `src/smapi.ts`

**File**: `src/smapi.ts`

Add inside `bindSmapiSoapServiceToExpress`, near the top (after `sonosSoap` construction). Import `parseToken` from `./subsonic`:

```typescript
import { parseToken } from "./subsonic";
```

```typescript
const usernameFrom = (serviceToken: string): string => {
  try {
    return parseToken(serviceToken).username;
  } catch {
    return "unknown";
  }
};
```

This safely extracts the username from a base64-encoded serviceToken for log context, matching the pattern already used in `subsonic.ts:528`.

#### 1c. Add logging to `swapToken` error handler

**File**: `src/smapi.ts:463-472`

Change:
```typescript
const swapToken = (expiredToken: string, reqId: string) => (newToken: SmapiToken) =>
  TE.tryCatch(
    async () => {
      logger.debug(`${reqId} oldToken: ` + expiredToken);
      logger.debug(`${reqId} newToken: ` + JSON.stringify(newToken));
      await sonosSoap.associateCredentialsForToken(newToken.token, newToken, expiredToken);
      return newToken;
    },
    (error) => error as Error
  );
```
To:
```typescript
const swapToken = (expiredToken: string, reqId: string) => (newToken: SmapiToken) =>
  TE.tryCatch(
    async () => {
      logger.debug(`${reqId} swapToken oldToken: ${expiredToken.substring(0, 20)}...`);
      logger.debug(`${reqId} swapToken newToken: ${newToken.token.substring(0, 20)}...`);
      await sonosSoap.associateCredentialsForToken(newToken.token, newToken, expiredToken);
      return newToken;
    },
    (error) => {
      logger.warn(`${reqId} swapToken failed`, extractErrorDetails(error));
      return error as Error;
    }
  );
```

Add import of `extractErrorDetails` from `./logger`.

#### 1d. Add logging to `login()` catch

**File**: `src/smapi.ts:524-529`

Change:
```typescript
    if (isAuth(authOrFail)) {
      return musicService
        .login(authOrFail.serviceToken)
        .then((musicLibrary) => ({ ...authOrFail, musicLibrary }))
        .catch((_) => {
          throw SMAPI_FAULT_LOGIN_UNAUTHORIZED;
        });
```
To:
```typescript
    if (isAuth(authOrFail)) {
      const username = usernameFrom(authOrFail.serviceToken);
      return musicService
        .login(authOrFail.serviceToken)
        .then((musicLibrary) => ({ ...authOrFail, musicLibrary }))
        .catch((e) => {
          logger.warn(`${reqId} [${username}] musicService.login failed`, extractErrorDetails(e));
          throw SMAPI_FAULT_LOGIN_UNAUTHORIZED;
        });
```

#### 1e. Add logging to `login()` expired-token path

**File**: `src/smapi.ts:530-548`

Change:
```typescript
    } else if (isExpiredTokenError(authOrFail)) {
      throw await pipe(
        musicService.refreshToken(authOrFail.expiredToken),
        TE.map((it) => smapiAuthTokens.issue(it.serviceToken)),
        TE.tap(swapToken(authOrFail.expiredToken, reqId)),
        TE.map((newToken) => ({
          ...
        })),
        TE.getOrElse(() => T.of(SMAPI_FAULT_LOGIN_UNAUTHORIZED))
      )();
```
To:
```typescript
    } else if (isExpiredTokenError(authOrFail)) {
      const username = usernameFrom(authOrFail.expiredToken);
      throw await pipe(
        musicService.refreshToken(authOrFail.expiredToken),
        TE.map((it) => smapiAuthTokens.issue(it.serviceToken)),
        TE.tap(swapToken(authOrFail.expiredToken, reqId)),
        TE.map((newToken) => ({
          ...
        })),
        TE.getOrElse((e) => {
          logger.warn(`${reqId} [${username}] token refresh failed, returning LoginUnauthorized`, extractErrorDetails(e));
          return T.of(SMAPI_FAULT_LOGIN_UNAUTHORIZED);
        })
      )();
```

#### 1f. Add logging to `refreshAuthToken` `TE.getOrElse`

**File**: `src/smapi.ts:686-688`

Change:
```typescript
        TE.getOrElse((_) => {
          throw SMAPI_FAULT_LOGIN_UNAUTHORIZED;
        })
```
To:
```typescript
        TE.getOrElse((e) => {
          logger.warn(`${reqId} refreshAuthToken failed`, extractErrorDetails(e));
          throw SMAPI_FAULT_LOGIN_UNAUTHORIZED;
        })
```

(Username is not easily available here without refactoring the serviceToken extraction — defer to Phase 3 where branded types make the flow clearer.)

#### 1g. Add `.catch` to `credentialsForToken` S3 lookup

**File**: `src/smapi.ts:490-510`

Add `.catch` to the promise chain and promote "Updated credentials" to info:

```typescript
const credentialsForToken = (token: string | undefined, credentials?: Credentials, reqId: string = '-') => {
  if(token) {
    logger.debug(`${reqId} Will use token in authorization header: ` + token.substring(0, 20) + "...");
    const credsForToken = sonosSoap.getCredentialsForToken(token);
    return credsForToken.then(smapiToken => {
        if(!smapiToken) throw new Error("Couldn't lookup token");
        credentials = {
          ...credentials!,
          loginToken: {
            ...credentials?.loginToken!,
            token: smapiToken.token,
            key: smapiToken.key,
          }
        }
        logger.info(`${reqId} Updated credentials from token cache`);
        return credentials;
    }).catch((e) => {
        logger.warn(`${reqId} credentialsForToken lookup failed, proceeding without cached credentials`, extractErrorDetails(e));
        return credentials;
    });
  }
  return credentials;
}
```

Note: "Updated credentials" is changed from `debug` to `info`, and the full credentials JSON is removed (it contains sensitive data). The truncation of the token in the debug line above avoids logging full JWTs.

#### 1h. Fix `soapyService.log` nesting

**File**: `src/smapi.ts:1348-1362`

Change:
```typescript
soapyService.log = (type, data) => {
  switch (type) {
    // routing all soap info messages to debug so less noisy
    case "info":
      logger.debug({ level: "info", data });
      break;
    case "warn":
      logger.warn({ level: "warn", data });
      break;
    case "error":
      logger.error({ level: "error", data });
      break;
    default:
      logger.debug({ level: "debug", data });
  }
};
```
To:
```typescript
soapyService.log = (type, data) => {
  switch (type) {
    case "info":
      logger.debug(data);
      break;
    case "warn":
      logger.warn(data);
      break;
    case "error":
      logger.error(data);
      break;
    default:
      logger.debug(data);
  }
};
```

This removes the double-nesting. Soap "info" messages (including "Attempting to bind" and "Trying SonosSoap") remain routed to `debug` level, so they won't appear at the default `info` log level. The `warn` and `error` cases pass `data` directly, producing clean output.

#### 1i. Truncate authToken in TokenRefreshRequired fault logging

The `TokenRefreshRequired` fault object (constructed at `src/smapi.ts:535-546`) is thrown, caught by `wrapSoapMethod`, and re-thrown without logging the body (line 576-577). So the full authToken is not currently logged in the fault itself.

However, the `swapToken` debug logs at lines 466-467 log the full old/new tokens. These are already truncated in change 1c above.

If SOAP-level logging is enabled (via `soapyService.log`), the full SOAP response XML including the authToken would be logged at debug level. To truncate at that layer would require intercepting the soap library's XML serialisation, which is disproportionate. Since this only appears at debug level, it's acceptable.

No additional changes needed beyond 1c.

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compiles: `nvm exec 20 npx tsc --noEmit`
- [ ] Tests pass: `nvm exec 20 npm test`
- [ ] `extractErrorDetails` correctly handles: `Error`, `string`, `{ code: 'ECONNREFUSED' }`, circular objects

#### Manual Verification:
- [ ] When `musicService.login()` throws, log output includes the cause at WARN with username
- [ ] When `refreshToken` pipeline fails, log output includes the cause at WARN with username
- [ ] When `credentialsForToken` S3 lookup fails, log output includes the cause at WARN and the flow continues with original credentials
- [ ] `soapyService.log` output no longer contains double-nested `{"level":"debug","message":{"data":"...`
- [ ] "Updated credentials" appears at INFO level without full credentials JSON
- [ ] Token values in debug logs are truncated to 20 chars

---

## Phase 2: Return Correct SOAP Fault for Upstream Unavailability

### Overview
When the upstream Subsonic/Astiga service is unavailable (HTTP 5xx, network errors, timeouts), return `Server.ServiceUnavailable` instead of `Client.LoginUnauthorized`. This prevents Sonos from treating upstream outages as credential failures.

### Changes Required:

#### 2a. Add `ServiceUnavailableError` to `src/music_service.ts`

**File**: `src/music_service.ts`

Add a new error class alongside `AuthFailure`:

```typescript
export class ServiceUnavailableError extends Error {
  constructor(message: string) {
    super(message);
  }
}
```

#### 2b. Add `SMAPI_FAULT_SERVICE_UNAVAILABLE` to `src/smapi_auth.ts`

**File**: `src/smapi_auth.ts`

Add after `SMAPI_FAULT_LOGIN_UNAUTHORIZED`:

```typescript
export const SMAPI_FAULT_SERVICE_UNAVAILABLE = {
  Fault: {
    faultcode: "Server.ServiceUnavailable",
    faultstring: "Upstream music service was not available",
  },
};
```

#### 2c. Distinguish service errors from auth errors in `src/subsonic.ts`

**File**: `src/subsonic.ts:584-592`

Currently `generateToken` wraps all ping failures as `AuthFailure`:
```typescript
TE.tryCatch(
  () =>
    this.getJSON<PingResponse>(
      _.pick(credentials, "username", "password"),
      "/rest/ping.view"
    ),
  (e) => new AuthFailure(e as string)
),
```

Change to distinguish HTTP 5xx / network errors from auth errors:
```typescript
TE.tryCatch(
  () =>
    this.getJSON<PingResponse>(
      _.pick(credentials, "username", "password"),
      "/rest/ping.view"
    ),
  (e) => {
    const message = e instanceof Error ? e.message : String(e);
    // HTTP 5xx or network errors indicate upstream unavailability, not auth failure
    if (message.includes("status code 5") || message.includes("ECONNREFUSED") || message.includes("ETIMEDOUT") || message.includes("ENOTFOUND")) {
      return new ServiceUnavailableError(message);
    }
    return new AuthFailure(message);
  }
),
```

Add import of `ServiceUnavailableError` from `./music_service`.

Also update the second `TE.tryCatch` for `libraryFor` (`src/subsonic.ts:596-599`):
```typescript
TE.tryCatch(
  () => this.libraryFor({ ...credentials, type }),
  (e) => {
    const message = e instanceof Error ? e.message : String(e);
    if (message.includes("status code 5") || message.includes("ECONNREFUSED") || message.includes("ETIMEDOUT") || message.includes("ENOTFOUND")) {
      return new ServiceUnavailableError(message);
    }
    return new AuthFailure("Failed to get library");
  }
),
```

#### 2d. Update `MusicService` interface return type

**File**: `src/music_service.ts:168-172`

Change `generateToken` and `refreshToken` to return a union error type:
```typescript
export interface MusicService {
  generateToken(credentials: Credentials): TE.TaskEither<AuthFailure | ServiceUnavailableError, AuthSuccess>;
  refreshToken(serviceToken: string): TE.TaskEither<AuthFailure | ServiceUnavailableError, AuthSuccess>;
  login(serviceToken: string): Promise<MusicLibrary>;
}
```

#### 2e. Handle `ServiceUnavailableError` in `smapi.ts` login()

**File**: `src/smapi.ts:530-548` (the expired-token path)

Change the `TE.getOrElse` (after Phase 1 changes) to distinguish error types:
```typescript
TE.getOrElse((e) => {
  if (e instanceof ServiceUnavailableError) {
    logger.warn(`${reqId} [${username}] upstream service unavailable during token refresh`, extractErrorDetails(e));
    return T.of(SMAPI_FAULT_SERVICE_UNAVAILABLE);
  }
  logger.warn(`${reqId} [${username}] token refresh failed, returning LoginUnauthorized`, extractErrorDetails(e));
  return T.of(SMAPI_FAULT_LOGIN_UNAUTHORIZED);
})
```

Add import of `ServiceUnavailableError` from `./music_service` and `SMAPI_FAULT_SERVICE_UNAVAILABLE` from `./smapi_auth`.

#### 2f. Handle `ServiceUnavailableError` in `smapi.ts` refreshAuthToken

**File**: `src/smapi.ts:686-688` (after Phase 1 changes)

```typescript
TE.getOrElse((e) => {
  if (e instanceof ServiceUnavailableError) {
    logger.warn(`${reqId} upstream service unavailable during refreshAuthToken`, extractErrorDetails(e));
    throw SMAPI_FAULT_SERVICE_UNAVAILABLE;
  }
  logger.warn(`${reqId} refreshAuthToken failed`, extractErrorDetails(e));
  throw SMAPI_FAULT_LOGIN_UNAUTHORIZED;
})
```

#### 2g. Handle `ServiceUnavailableError` in `smapi.ts` login() success path

**File**: `src/smapi.ts:524-529` (the `musicService.login()` catch, after Phase 1 changes)

The `musicService.login()` call can also fail due to upstream unavailability. The catch should distinguish:

```typescript
.catch((e) => {
  const message = e instanceof Error ? e.message : String(e);
  if (message.includes("status code 5") || message.includes("ECONNREFUSED") || message.includes("ETIMEDOUT") || message.includes("ENOTFOUND")) {
    logger.warn(`${reqId} [${username}] upstream service unavailable during login`, extractErrorDetails(e));
    throw SMAPI_FAULT_SERVICE_UNAVAILABLE;
  }
  logger.warn(`${reqId} [${username}] musicService.login failed`, extractErrorDetails(e));
  throw SMAPI_FAULT_LOGIN_UNAUTHORIZED;
});
```

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compiles: `nvm exec 20 npx tsc --noEmit`
- [ ] Tests pass: `nvm exec 20 npm test`

#### Manual Verification:
- [ ] When Astiga returns HTTP 503, Sonos receives `Server.ServiceUnavailable` (not `Client.LoginUnauthorized`)
- [ ] When Astiga returns HTTP 401/403, Sonos still receives `Client.LoginUnauthorized`
- [ ] When Astiga is unreachable (ECONNREFUSED), Sonos receives `Server.ServiceUnavailable`
- [ ] Log output shows WARN with "upstream service unavailable" message including username

---

## Phase 3: Branded Types + Space Leak Fix

### Overview
Add branded types to distinguish JWT token strings from service token strings at compile time. Fix the `swapToken` caller to pass the JWT (not serviceToken) as `oldToken`, so the in-memory and S3 delete actually removes the old entry. This also requires `ExpiredTokenError` to carry the original JWT alongside the serviceToken.

### Changes Required:

#### 2a. Define branded types

**File**: `src/smapi_auth.ts`

Add at the top, after imports:

```typescript
/** A JWT string — used as key in token stores */
export type JwtTokenString = string & { readonly __brand: unique symbol };

/** A UUID key — used as part of JWT signing secret */
export type SmapiKeyString = string & { readonly __brand: unique symbol };

/** Base64-encoded Subsonic credentials */
export type ServiceTokenString = string & { readonly __brand: unique symbol };
```

#### 2b. Update `SmapiToken` type

**File**: `src/smapi_auth.ts:26-29`

Change:
```typescript
export type SmapiToken = {
  token: string;
  key: string;
};
```
To:
```typescript
export type SmapiToken = {
  token: JwtTokenString;
  key: SmapiKeyString;
};
```

#### 2c. Update `SmapiAuthTokens` interface

**File**: `src/smapi_auth.ts:93-96`

Change:
```typescript
export type SmapiAuthTokens = {
  issue: (serviceToken: string) => SmapiToken;
  verify: (smapiToken: SmapiToken) => E.Either<ToSmapiFault, string>;
};
```
To:
```typescript
export type SmapiAuthTokens = {
  issue: (serviceToken: ServiceTokenString) => SmapiToken;
  verify: (smapiToken: SmapiToken) => E.Either<ToSmapiFault, ServiceTokenString>;
};
```

#### 2d. Update `JWTSmapiLoginTokens` methods

**File**: `src/smapi_auth.ts:141-176`

Update `issue` signature:
```typescript
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
```

Update `verify` return type and pass the JWT to `ExpiredTokenError`:
```typescript
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
```

Note: `verify()` now passes `smapiToken.token` (the original JWT) to `ExpiredTokenError` as a second argument.

#### 2e. Update `ExpiredTokenError` to carry the JWT

**File**: `src/smapi_auth.ts:76-91`

Change:
```typescript
export class ExpiredTokenError extends Error implements ToSmapiFault {
  _tag = "ExpiredTokenError";
  expiredToken: string;

  constructor(expiredToken: string) {
    super("SMAPI token has expired");
    this.expiredToken = expiredToken;
  }
```
To:
```typescript
export class ExpiredTokenError extends Error implements ToSmapiFault {
  _tag = "ExpiredTokenError";
  serviceToken: ServiceTokenString;
  expiredJwt: JwtTokenString;

  constructor(serviceToken: ServiceTokenString, expiredJwt: JwtTokenString) {
    super("SMAPI token has expired");
    this.serviceToken = serviceToken;
    this.expiredJwt = expiredJwt;
  }
```

#### 2f. Update `smapiTokenFromString` cast

**File**: `src/smapi_auth.ts:115-116`

Change:
```typescript
export const smapiTokenFromString = (smapiTokenString: string): SmapiToken =>
  JSON.parse(b64Decode(smapiTokenString));
```
To:
```typescript
export const smapiTokenFromString = (smapiTokenString: string): SmapiToken =>
  JSON.parse(b64Decode(smapiTokenString)) as SmapiToken;
```

`as SmapiToken` cast at the deserialization boundary — `JSON.parse` returns `any`.

#### 2g. Update `SonosSoap` in `src/smapi.ts`

**File**: `src/smapi.ts`

Add to imports from `./smapi_auth`:
```typescript
import { JwtTokenString, ServiceTokenString, SmapiKeyString } from "./smapi_auth";
```

Change `tokens` type (`src/smapi.ts:166`):
```typescript
tokens: {[tokenKey: JwtTokenString]:SmapiToken};
```

Change `associateCredentialsForToken` signature (`src/smapi.ts:244`):
```typescript
async associateCredentialsForToken(token: JwtTokenString, fullSmapiToken: SmapiToken, oldToken?: JwtTokenString): Promise<void> {
```

Change `getCredentialsForToken` signature (`src/smapi.ts:262`):
```typescript
async getCredentialsForToken(token: JwtTokenString): Promise<SmapiToken | undefined> {
```

#### 2h. Update `Credentials` type

**File**: `src/smapi.ts:70-78`

Change:
```typescript
export type Credentials = {
  loginToken: {
    token: string;
    key: string;
    householdId: string;
  };
  deviceId: string;
  deviceProvider: string;
};
```
To:
```typescript
export type Credentials = {
  loginToken: {
    token: JwtTokenString;
    key: SmapiKeyString;
    householdId: string;
  };
  deviceId: string;
  deviceProvider: string;
};
```

#### 2i. Update `Auth` type

**File**: `src/smapi.ts:408-412`

Change:
```typescript
type Auth = {
  serviceToken: string;
  credentials: Credentials;
  apiKey: string;
};
```
To:
```typescript
type Auth = {
  serviceToken: ServiceTokenString;
  credentials: Credentials;
  apiKey: string;
};
```

#### 2j. Update `swapToken` to accept JWT

**File**: `src/smapi.ts:463-472`

Change signature and body (building on Phase 1 changes):
```typescript
const swapToken = (expiredJwt: JwtTokenString, reqId: string) => (newToken: SmapiToken) =>
  TE.tryCatch(
    async () => {
      logger.debug(`${reqId} swapToken oldToken: ${expiredJwt.substring(0, 20)}...`);
      logger.debug(`${reqId} swapToken newToken: ${newToken.token.substring(0, 20)}...`);
      await sonosSoap.associateCredentialsForToken(newToken.token, newToken, expiredJwt);
      return newToken;
    },
    (error) => {
      logger.warn(`${reqId} swapToken failed`, extractErrorDetails(error));
      return error as Error;
    }
  );
```

#### 2k. Update `login()` callers of `swapToken`

**File**: `src/smapi.ts:530-534`

Change:
```typescript
} else if (isExpiredTokenError(authOrFail)) {
  const username = usernameFrom(authOrFail.expiredToken);
  throw await pipe(
    musicService.refreshToken(authOrFail.expiredToken),
    TE.map((it) => smapiAuthTokens.issue(it.serviceToken)),
    TE.tap(swapToken(authOrFail.expiredToken, reqId)),
```
To:
```typescript
} else if (isExpiredTokenError(authOrFail)) {
  const username = usernameFrom(authOrFail.serviceToken);
  throw await pipe(
    musicService.refreshToken(authOrFail.serviceToken),
    TE.map((it) => smapiAuthTokens.issue(it.serviceToken as ServiceTokenString)),
    TE.tap(swapToken(authOrFail.expiredJwt, reqId)),
```

Note: `musicService.refreshToken` receives the `serviceToken` (unchanged behaviour), but `swapToken` now receives the **JWT** so the delete works correctly.

The `as ServiceTokenString` cast on `it.serviceToken` is needed because `refreshToken` returns `AuthSuccess` whose `serviceToken` is typed as `string` in the `MusicService` interface. This is a system boundary — the cast is correct.

#### 2l. Update `refreshAuthToken` caller of `swapToken`

**File**: `src/smapi.ts:656-689`

The `refreshAuthToken` method needs the JWT to pass to `swapToken`. Currently it extracts `serviceToken` from `auth()`. We need to also track the JWT from credentials.

Change the `refreshAuthToken` handler:

```typescript
refreshAuthToken: async (
  _: any,
  _2: any,
  soapyHeaders: SoapyHeaders,
  { headers, id: reqId }: Pick<Request, "headers" | "id">
) => {
  const creds = await usePartialCredentialsIfPresent(soapyHeaders?.credentials, headers, reqId);
  const jwtFromCredentials = creds?.loginToken?.token;
  const serviceToken = pipe(
    auth(creds),
    E.fold(
      (fault) =>
        isExpiredTokenError(fault)
          ? E.right(fault.serviceToken)
          : E.left(fault),
      (creds) => E.right(creds.serviceToken)
    ),
    E.getOrElseW((fault) => {
      throw fault.toSmapiFault();
    })
  );
  const username = usernameFrom(serviceToken);
  return pipe(
    musicService.refreshToken(serviceToken),
    TE.map((it) => smapiAuthTokens.issue(it.serviceToken as ServiceTokenString)),
    TE.tap(swapToken(jwtFromCredentials!, reqId)),
    TE.map((it) => ({
      refreshAuthTokenResult: {
        authToken: it.token,
        privateKey: it.key,
      },
    })),
    TE.getOrElse((e) => {
      logger.warn(`${reqId} [${username}] refreshAuthToken failed`, extractErrorDetails(e));
      throw SMAPI_FAULT_LOGIN_UNAUTHORIZED;
    })
  )();
},
```

Key changes: `jwtFromCredentials` captures the original JWT from credentials before `auth()` discards it, and passes it to `swapToken`. Username added to error log.

#### 2m. Update `getDeviceAuthToken`

**File**: `src/smapi.ts:636-645`

The intermediate `getDeviceAuthTokenResult` uses plain `string` fields. Add casts:

```typescript
const smapiToken: SmapiToken = {
  token: deviceAuthTokenResult.getDeviceAuthTokenResult.authToken as JwtTokenString,
  key: deviceAuthTokenResult.getDeviceAuthTokenResult.privateKey as SmapiKeyString
};
```

#### 2n. Update `credentialsForToken`

**File**: `src/smapi.ts:490-510`

The `token` parameter comes from bearer headers or `credentials.loginToken.token`. With the `Credentials` type change in 2h, `credentials.loginToken.token` is already `JwtTokenString`. For the bearer header path, add a cast:

```typescript
const credentialsForToken = (token: JwtTokenString | undefined, credentials?: Credentials, reqId: string = '-') => {
```

At `src/smapi.ts:484`, add cast:
```typescript
const token = bearer?.split(" ")[1] as JwtTokenString | undefined;
```

At `src/smapi.ts:477`, `credentials.loginToken.token` is already `JwtTokenString` from the type change.

#### 2o. Update `MusicService` interface (minimal)

**File**: `src/music_service.ts:168-172`

The `MusicService` interface uses plain `string` for `serviceToken` in its return type `AuthSuccess`. Since `MusicService` is a broader interface not specific to SMAPI, we do **not** brand it. Instead, we cast at the boundary where results enter the SMAPI layer (already done in 2k and 2l with `as ServiceTokenString`).

#### 2p. Update test files

Tests construct `SmapiToken` as plain objects and `ExpiredTokenError` with one arg. These need updating:

**File**: `tests/smapi_auth.test.ts`

- Line 20: Cast `SmapiToken` fields:
  ```typescript
  const smapiToken = { token: uuid() as JwtTokenString, key: uuid() as SmapiKeyString };
  ```
- Line 180: Update `ExpiredTokenError` constructor:
  ```typescript
  new ExpiredTokenError(authToken as ServiceTokenString, "expired-jwt" as JwtTokenString)
  ```
  (or adapt to match test context — in the expiry test at line 173, `smapiToken` is available so use `smapiToken.token` for the JWT arg)

**File**: `tests/smapi.test.ts`

- Line 624-627: Cast the constructed `SmapiToken`:
  ```typescript
  const smapiAuthToken: SmapiToken = { token: `token-${uuid()}` as JwtTokenString, key: `key-${uuid()}` as SmapiKeyString };
  ```
- Line 797, 850, 1053-1056: Same pattern for `newSmapiAuthToken` / `newToken`
- Lines referencing `ExpiredTokenError` (799, 1058): update constructor to two args
- `smapiAuthTokens.verify` mock return: ensure `serviceToken` is cast to `ServiceTokenString`

**File**: `tests/server.test.ts`

- Line 772: Cast `SmapiToken` fields
- Lines 804, 902: Update `ExpiredTokenError` constructor to two args

**File**: `tests/scenarios.test.ts`

- Check if `SmapiToken` or `ExpiredTokenError` is used — if so, update similarly.

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compiles: `nvm exec 20 npx tsc --noEmit`
- [ ] Tests pass: `nvm exec 20 npm test`
- [ ] Passing a `ServiceTokenString` where `JwtTokenString` is expected produces a compile error (verify by temporarily introducing a type mismatch)

#### Manual Verification:
- [ ] After token refresh, old JWT entry is removed from `this.tokens` (not a no-op)
- [ ] After token refresh, new JWT entry is present in `this.tokens`
- [ ] S3 delete targets the old JWT key, not the serviceToken
- [ ] Consecutive token refreshes don't accumulate stale entries in memory

---

## Phase 4: Log Level Adjustments

### Overview
Ensure consistent log levels across auth-related code: errors at WARN, credential updates at INFO.

### Changes Required:

#### 3a. Ensure all auth error logging uses WARN

All error handlers added in Phase 1 already use `logger.warn`. Verify no `logger.error` was used for auth failures. The rationale: auth failures are expected operational events (expired tokens are normal), not bugs. WARN is appropriate. ERROR should be reserved for unexpected failures (e.g. the "BOOOOM" at `src/smapi.ts:1343`).

Review existing error logging in `wrapSoapMethod` (`src/smapi.ts:607`):
```typescript
logger.error(`${reqId} ${methodName} failed`, {
```
This logs unexpected exceptions (those not already SOAP faults). This is appropriate at ERROR since it represents genuinely unexpected failures. No change needed.

#### 3b. Document `BNB_LOG_LEVEL`

The debug level is controlled by the `BNB_LOG_LEVEL` environment variable (`src/logger.ts:9`), defaulting to `info`. Valid values: `error`, `warn`, `info`, `debug`. No code change needed — this is documentation for operators.

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compiles: `nvm exec 20 npx tsc --noEmit`
- [ ] Tests pass: `nvm exec 20 npm test`

#### Manual Verification:
- [ ] At default `info` level: auth failures appear as WARN, credential updates appear as INFO, soap library chatter does not appear
- [ ] At `debug` level: truncated token values appear, soap library messages appear without double-nesting

---

## Testing Strategy

### Unit Tests:
- Existing `smapi_auth.test.ts` tests cover `issue`/`verify`/`ExpiredTokenError` round-trips — update for new constructor signature
- Existing `smapi.test.ts` tests cover `refreshAuthToken` and `TokenRefreshRequired` flows — update mock constructions
- No new unit tests strictly required; the branded types provide compile-time safety

### Integration Tests:
- Existing `server.test.ts` streaming tests with expired tokens — update `ExpiredTokenError` constructor calls
- Existing `scenarios.test.ts` — verify still passes

### Manual Testing Steps:
1. Check logs for clean output without double-nesting at default log level
2. Monitor `this.tokens` size over time to confirm old entries are cleaned up
3. Verify Sonos app can play music without re-adding the service after token expiry
4. Set `BNB_LOG_LEVEL=debug` and verify truncated tokens and soap library messages appear

## Migration Notes

- Existing orphan tokens in S3 (from the space leak) are not cleaned up by this change
- A future cleanup script could enumerate S3 keys and remove entries that don't correspond to valid JWTs, but this is out of scope
- The branded types are purely compile-time — no runtime changes to serialized token formats

## References

- Investigation: `dev/tickets/oauth-flow/investigation.md`
- Log evidence: `dev/tickets/oauth-flow/log.md`
- SMAPI auth: `src/smapi_auth.ts`
- SMAPI SOAP: `src/smapi.ts:161-276` (SonosSoap), `src/smapi.ts:463-551` (swapToken/login)
- Subsonic refreshToken: `src/subsonic.ts:616-617`
- S3 token store: `src/app.ts:82-220` (MinioS3PersistentTokenStore)
- Logger config: `src/logger.ts:9` (`BNB_LOG_LEVEL` env var)
