# Persist Token to S3 on Successful Auth Implementation Plan

## Overview

When a SMAPI request arrives with complete credentials (both token and key), and the token is not already in the in-memory cache, persist it to S3. This ensures that after a server restart, clients that send token-without-key (e.g. Android Sonos app) can still look up the key from S3.

## Current State Analysis

Tokens are only persisted to S3 in two places:
- `getDeviceAuthToken` (src/smapi.ts:674) — initial device auth
- `swapToken` (src/smapi.ts:479) — during token refresh

The `login()` function (src/smapi.ts:528) authenticates requests but never persists the token+key. After a server restart, the in-memory cache is empty. Clients that omit the key (Android Sonos app) try to look it up from S3, but since it was never stored there during normal auth, the lookup fails and the user gets `LoginUnauthorized`.

### Key Discoveries:
- The Android Sonos app sometimes sends both token+key (via Java HttpClient), sometimes only token (via the app itself)
- The Sonos hardware always sends both token+key
- `SonosSoap.associateCredentialsForToken` (src/smapi.ts:247) stores to both in-memory cache and S3
- `SonosSoap.getCredentialsForToken` (src/smapi.ts:265) checks in-memory first, then S3
- The in-memory cache check `token in this.tokens` (src/smapi.ts:267) can be used to avoid redundant S3 writes

## Desired End State

After a successful `login()` with complete credentials, the token+key pair is persisted to S3 (if not already in the in-memory cache). After a server restart, keyless requests can look up the key from S3 and authenticate successfully.

### Verification:
- Existing tests pass
- After restart, a keyless request for a previously-seen token succeeds via S3 lookup

## What We're NOT Doing

- Not changing the token refresh flow
- Not adding a recovery/refresh path for completely unknown tokens
- Not changing how incomplete credentials are handled

## Implementation Approach

Add a fire-and-forget call to `sonosSoap.associateCredentialsForToken` in the successful auth path of `login()`, gated by a check that the token isn't already in the in-memory cache.

## Phase 1: Add cache-aware persistence to login

### Changes Required:

#### 1. Expose a cache-check method on SonosSoap
**File**: `src/smapi.ts`
**Context**: `SonosSoap` class (around line 200)

Add a method to check whether a token is already known in-memory:

```typescript
hasTokenInMemory(token: JwtTokenString): boolean {
  return token in this.tokens;
}
```

#### 2. Persist token after successful login
**File**: `src/smapi.ts`
**Context**: `login()` function, inside the `isAuth(authOrFail)` branch (line 539), after `musicService.login()` succeeds (line 543)

After the successful `.login()` call, add fire-and-forget persistence:

```typescript
if (isAuth(authOrFail)) {
  const username = usernameFrom(authOrFail.serviceToken);
  return musicService
    .login(authOrFail.serviceToken)
    .then((musicLibrary) => {
      // Persist complete credentials to S3 if not already cached in memory
      const token = credentials?.loginToken?.token;
      const key = credentials?.loginToken?.key;
      if (token && key && !sonosSoap.hasTokenInMemory(token)) {
        sonosSoap.associateCredentialsForToken(token, { token, key }).catch((e) => {
          logger.warn(`${reqId} [${username}] failed to persist token to S3`, extractErrorDetails(e));
        });
      }
      return { ...authOrFail, musicLibrary };
    })
    .catch((e) => {
      // ... existing error handling unchanged ...
    });
}
```

Note: The `associateCredentialsForToken` call is deliberately not awaited — it's fire-and-forget so it doesn't slow down the response.

### Success Criteria:

#### Automated Verification:
- [x] Existing tests pass: `nvm exec 20 npm test` (pre-existing failures unrelated to this change)

#### Manual Verification:
- [ ] Restart bonob server
- [ ] Make a request from the Sonos hardware (sends token+key) — should succeed and persist token to S3
- [ ] Make a request from the Android app (sends token only) — should succeed via S3 lookup
- [ ] Subsequent requests from the Android app should succeed from in-memory cache without S3 writes

## References

- `SonosSoap.associateCredentialsForToken`: src/smapi.ts:247
- `SonosSoap.getCredentialsForToken`: src/smapi.ts:265
- `login()`: src/smapi.ts:528
- Log evidence of the issue: /tmp/astiga_sonos/0bbe1f2a-871a-c6fb-769d-26c3703fc812/bonob.stdout.0
