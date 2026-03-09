# Decode and Reissue Token for Keyless Requests

## Overview

When a SMAPI request arrives with a token but no key, and the token cannot be found in the in-memory cache or S3, decode the JWT without verification to extract the `serviceToken`, validate against Subsonic via `refreshToken`, and return `TokenRefreshRequired` with a fresh token+key pair. This ensures clients that never send the key (or whose key was never persisted) can recover without manual re-authorization.

## Current State Analysis

After commit 8e77c01, tokens are persisted to S3 on successful auth when both token and key are present. However, if a client *never* sends the key (e.g. the Android Sonos app in some flows), there is nothing to persist.

Current flow for keyless requests when token is not in cache/S3:
1. `login()` detects incomplete credentials (line 534)
2. `usePartialCredentialsIfPresent` → `credentialsForToken` tries cache then S3 (line 511)
3. S3 lookup fails → catch block returns credentials without key (line 524-527)
4. `auth()` calls `smapiAuthTokens.verify()` with null key → signature mismatch → `InvalidTokenError`
5. Falls through to `authOrFail.toSmapiFault()` → `SMAPI_FAULT_LOGIN_UNAUTHORIZED` (line 595)
6. Client shows "Failed to authenticate, try Re-Authorising"

### Key Discoveries:
- `jwt.decode()` can extract the `serviceToken` payload without the key (no signature verification)
- The existing expired-token path (lines 567-593) already does exactly what we need: `refreshToken` → `issue` → `swapToken` → `TokenRefreshRequired`
- `InvalidTokenError` has `_tag = "InvalidTokenError"` but no type guard function exists
- `jwt` is imported in `smapi_auth.ts`, not in `smapi.ts`
- Per Sonos docs, `TokenRefreshRequired` is the correct response when the service cannot honour a token but can issue a new one

## Desired End State

When a keyless request arrives for an unknown token:
1. The JWT is decoded (without verification) to extract `serviceToken`
2. `refreshToken` validates the `serviceToken` against Subsonic
3. A fresh token+key pair is issued and persisted to both in-memory cache and S3
4. `TokenRefreshRequired` is returned to the client with the new credentials
5. The client retries with the new token+key and succeeds

### Verification:
- Existing tests pass
- A keyless request for an unknown token triggers `TokenRefreshRequired` instead of `LoginUnauthorized`
- The fresh token is persisted to S3

## What We're NOT Doing

- Not changing the happy path (complete credentials with both token+key)
- Not changing `getDeviceAuthToken` or `swapToken` persistence
- Not removing the S3 lookup fallback — decode-and-reissue is a last resort

## Implementation Approach

When `auth()` returns `InvalidTokenError` and the credentials have a token but no key, attempt to decode the JWT unverified, extract the `serviceToken`, and go through the same refresh+reissue flow as the expired-token path.

## Phase 1: Add decode-and-reissue fallback in `login()`

### Changes Required:

#### 1. Add a method to decode JWT without verification on `SmapiAuthTokens`
**File**: `src/smapi_auth.ts`
**Context**: `JWTSmapiAuthTokens` class

Add a method that decodes without verification, returning the `serviceToken` if present:

```typescript
decodeUnverified = (token: JwtTokenString): ServiceTokenString | undefined => {
  try {
    const decoded = jwt.decode(token) as any;
    return decoded?.serviceToken as ServiceTokenString | undefined;
  } catch {
    return undefined;
  }
};
```

Also add this to the `SmapiAuthTokens` type:

```typescript
export type SmapiAuthTokens = {
  issue: (serviceToken: ServiceTokenString) => SmapiToken;
  verify: (smapiToken: SmapiToken) => E.Either<ToSmapiFault, ServiceTokenString>;
  decodeUnverified: (token: JwtTokenString) => ServiceTokenString | undefined;
};
```

#### 2. Handle `InvalidTokenError` with keyless credentials in `login()`
**File**: `src/smapi.ts`
**Context**: `login()` function, the final `else` branch (line 594-596)

Replace the catch-all `else` with a check for recoverable keyless requests:

```typescript
    } else if (incompleteCredentialsProvided && credentials?.loginToken?.token) {
      // Token present but no key, and not in cache/S3 — attempt decode-and-reissue
      const serviceToken = smapiAuthTokens.decodeUnverified(credentials.loginToken.token);
      if (serviceToken) {
        const username = usernameFrom(serviceToken);
        logger.info(`${reqId} [${username}] Token without key not in cache, attempting decode-and-reissue`);
        throw await pipe(
          musicService.refreshToken(serviceToken),
          TE.map((it) => smapiAuthTokens.issue(it.serviceToken as ServiceTokenString)),
          TE.tap(swapToken(credentials.loginToken.token, reqId)),
          TE.map((newToken) => ({
            Fault: {
              faultcode: "Client.TokenRefreshRequired",
              faultstring: "Token has expired",
              detail: {
                refreshAuthTokenResult: {
                  authToken: newToken.token,
                  privateKey: newToken.key,
                },
              },
            },
          })),
          TE.getOrElse((e) => {
            if (e instanceof ServiceUnavailableError) {
              logger.warn(`${reqId} [${username}] upstream service unavailable during decode-and-reissue`, extractErrorDetails(e));
              return T.of(SMAPI_FAULT_SERVICE_UNAVAILABLE);
            }
            logger.warn(`${reqId} [${username}] decode-and-reissue failed, returning LoginUnauthorized`, extractErrorDetails(e));
            return T.of(SMAPI_FAULT_LOGIN_UNAUTHORIZED);
          })
        )();
      } else {
        throw authOrFail.toSmapiFault();
      }
    } else {
      throw authOrFail.toSmapiFault();
    }
```

### Success Criteria:

#### Automated Verification:
- [ ] All tests pass at 100% with no failures: `docker exec priceless_noyce /bin/bash -c "cd /workspaces/bonob; npm test"`
- Tests covering the new behaviour are already written in `tests/smapi.test.ts` within `itShouldHandleInvalidCredentials` under "when token is sent without key and not in cache":
  - Keyless request for unknown token returns `TokenRefreshRequired` with new token+key
  - Keyless request with undecodable JWT returns `LoginUnauthorized`
  - Keyless request where `refreshToken` fails returns `LoginUnauthorized`
- Currently these tests fail because the implementation is missing — once the implementation is complete they must all pass

#### Manual Verification:
- [ ] Restart bonob server (clearing in-memory cache)
- [ ] Clear the token from S3 for the Android app user
- [ ] Make a request from the Android app (sends token only) — should get `TokenRefreshRequired` and recover
- [ ] Subsequent requests from the Android app use the new token and succeed

## References

- `SmapiAuthTokens.verify`: src/smapi_auth.ts:171
- `JWTSmapiAuthTokens` class: src/smapi_auth.ts:140
- `login()`: src/smapi.ts:532
- Expired token path: src/smapi.ts:567-593
- `swapToken`: src/smapi.ts:474
- Sonos auth token docs: https://docs.sonos.com/docs/use-authentication-tokens
- Previous fix (persist on auth): commit 8e77c01
