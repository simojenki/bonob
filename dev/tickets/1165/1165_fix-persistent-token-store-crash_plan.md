# Fix PersistentTokenStore Crash Implementation Plan

## Overview

Fix the unhandled promise rejection crash that occurs when MinioPersistentTokenStore cannot connect to S3/Minio. Add retry logic with exponential backoff and proper error handling to all PersistentTokenStore operations.

## Current State Analysis

**The Bug:**
- When Sonos sends a SOAP request, `SonosSoap.associateCredentialsForToken()` (src/smapi.ts:244-252) calls `this.s3Client.put()` and `this.s3Client.delete()`
- `MinioPersistentTokenStore.put()` and `.delete()` (src/app.ts:126-131) call async Minio operations but don't return promises or handle errors
- When Minio is unreachable (ECONNREFUSED to 192.168.14.22:3900), unhandled promise rejection crashes Node.js process

**Current Implementation:**
- `PersistentTokenStore` interface (src/api_tokens.ts:35-39) declares `put/delete` as returning `void`
- Three implementations:
  - `NoopPersistentTokenStore`: Returns `void`, no-ops
  - `FilesystemPersistentTokenStore`: Already returns `Promise<void>` with proper error handling (catches ENOENT)
  - `MinioPersistentTokenStore`: Fire-and-forget, no error handling
- Client code in `SonosSoap` (src/smapi.ts:248, 251) doesn't await these operations
- No retry logic exists anywhere in the codebase

**Key Discoveries:**
- Codebase uses graceful degradation pattern (return undefined/false on failure)
- Error logging uses structured `logger.error()` with context objects
- TaskEither pattern (fp-ts) used for complex error handling chains
- Simple Promise then/catch used for most operations
- FilesystemPersistentTokenStore already has correct async patterns with ENOENT handling (src/api_tokens.ts:82-114)

## Desired End State

After implementation:
1. All three PersistentTokenStore methods (`get`, `put`, `delete`) return `Promise<void>` or `Promise<string | undefined>`
2. S3/Minio operations retry up to 3 times with exponential backoff (500ms → 1000ms → 2000ms, max 5000ms)
3. When S3 is unreachable:
   - `get()`: Retries, then returns `undefined` on failure (logged)
   - `put()`: Retries, then throws/rejects on failure (logged, error returned to client)
   - `delete()`: Retries asynchronously in background, logs on failure, never blocks caller
4. Server continues running even when S3 is permanently unavailable
5. All tests pass with no regressions

## What We're NOT Doing

- Not adding retry logic to other external service calls (Subsonic, Sonos discovery)
- Not adding metrics/monitoring hooks (just logging)
- Not changing the S3 bucket name or configuration structure
- Not adding retry configuration via environment variables (hardcoded for now)
- Not changing NoopPersistentTokenStore behavior (it remains synchronous void)
- Not adding unit tests for retry logic itself (relying on existing integration tests)

## Implementation Approach

Use the existing Promise then/catch pattern (consistent with codebase style), not TaskEither. Add a private retry utility method to MinioPersistentTokenStore that all three operations use. Make delete() fire-and-forget by not awaiting it in client code.

---

## Phase 1: Run Baseline Tests

### Overview
Establish baseline by running all tests before making any changes to verify current state.

### Changes Required:

#### 1. Run Full Test Suite
**Command**: `nvm exec 20 npm test`
**Purpose**: Document current test state (expecting some failures per CLAUDE.md)

**Expected output**: Test results showing any existing failures

### Success Criteria:

#### Automated Verification:
- [x] Test suite completes (even with failures)
- [x] Baseline test results documented

#### Manual Verification:
- [x] Review test output to identify pre-existing failures
- [x] Confirm no issues with test infrastructure itself

---

## Phase 2: Update PersistentTokenStore Interface

### Overview
Change the interface to declare that `put` and `delete` return `Promise<void>`, making the async contract explicit.

### Changes Required:

#### 1. Update Interface Definition
**File**: `src/api_tokens.ts`
**Changes**: Update PersistentTokenStore type definition

**Before** (lines 35-39):
```typescript
type PersistentTokenStore = {
  get: (key:string) => Promise<string | undefined>;
  put: (key: string, value: string) => void;
  delete: (key: string) => void;
}
```

**After**:
```typescript
type PersistentTokenStore = {
  get: (key:string) => Promise<string | undefined>;
  put: (key: string, value: string) => Promise<void>;
  delete: (key: string) => Promise<void>;
}
```

### Success Criteria:

#### Automated Verification:
- [x] TypeScript compilation passes: `npx tsc --noEmit`
- [x] No type errors in implementations or client code

#### Manual Verification:
- [x] Interface change is minimal and clear
- [x] All implementations will now be type-checked for async returns

---

## Phase 3: Update NoopPersistentTokenStore

### Overview
Make NoopPersistentTokenStore conform to updated interface by returning resolved promises.

### Changes Required:

#### 1. Update No-op Implementation
**File**: `src/api_tokens.ts`
**Changes**: Return `Promise<void>` from put and delete methods

**Before** (lines 46-49):
```typescript
put(_key:string, _value:string) {
}
delete(_key:string) {
}
```

**After**:
```typescript
put(_key:string, _value:string): Promise<void> {
  return Promise.resolve();
}
delete(_key:string): Promise<void> {
  return Promise.resolve();
}
```

### Success Criteria:

#### Automated Verification:
- [x] TypeScript compilation passes: `npx tsc --noEmit`
- [x] No type errors for NoopPersistentTokenStore

#### Manual Verification:
- [x] No-op behavior unchanged (still does nothing)
- [x] Conforms to interface contract

---

## Phase 4: Update MinioPersistentTokenStore with Retry Logic

### Overview
Add retry utility and update all three methods to use it. Make operations return promises with proper error handling.

### Changes Required:

#### 1. Add Retry Configuration Constants
**File**: `src/app.ts`
**Changes**: Add constants after S3_BUCKET definition (after line 83)

```typescript
const S3_BUCKET="astiga-sonos-tokens";

// Retry configuration for S3 operations
const S3_RETRY_ATTEMPTS = 3;
const S3_RETRY_INITIAL_DELAY_MS = 500;
const S3_RETRY_MAX_DELAY_MS = 5000;
const S3_RETRY_BACKOFF_MULTIPLIER = 2;
```

#### 2. Add Retry Utility Method
**File**: `src/app.ts`
**Changes**: Add private method to MinioPersistentTokenStore class (after constructor, around line 97)

```typescript
class MinioPersistentTokenStore implements PersistentTokenStore {
  client: Minio.Client;

  constructor() {
    this.client = new Minio.Client({
      endPoint: config.tokenStore.s3Endpoint,
      port: config.tokenStore.s3Port,
      useSSL: config.tokenStore.s3UseSsl,
      region: config.tokenStore.s3Region,
      accessKey: config.tokenStore.s3AccessKey,
      secretKey: config.tokenStore.s3SecretKey,
      pathStyle: config.tokenStore.s3PathStyle,
    });
  }

  /**
   * Retry a Minio operation with exponential backoff
   * @param operation - The async operation to retry
   * @param operationName - Name for logging
   * @returns Promise that resolves/rejects after all retries
   */
  private async retryWithBackoff<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<T> {
    let lastError: any;
    let delay = S3_RETRY_INITIAL_DELAY_MS;

    for (let attempt = 1; attempt <= S3_RETRY_ATTEMPTS; attempt++) {
      try {
        return await operation();
      } catch (err) {
        lastError = err;

        if (attempt < S3_RETRY_ATTEMPTS) {
          logger.warn(
            `S3 ${operationName} failed (attempt ${attempt}/${S3_RETRY_ATTEMPTS}), retrying in ${delay}ms`,
            { error: err }
          );

          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, delay));

          // Calculate next delay with exponential backoff (capped at max)
          delay = Math.min(delay * S3_RETRY_BACKOFF_MULTIPLIER, S3_RETRY_MAX_DELAY_MS);
        }
      }
    }

    // All retries exhausted, throw the last error
    throw lastError;
  }

  // ... rest of methods below
}
```

#### 3. Update get() Method with Retry
**File**: `src/app.ts`
**Changes**: Wrap operation in retryWithBackoff, return undefined on failure

**Before** (lines 98-125):
```typescript
get(key: string) : Promise<string | undefined> {
  var buff: Uint8Array[] = [];

  return this.client.getObject(S3_BUCKET, key)
    .then((dataStream: NodeJS.ReadableStream): Promise<string> => {
      return new Promise((resolve, reject) => {
        dataStream.on('data', (chunk: Uint8Array) => {
          //logger.debug("data: " + chunk);
          buff.push(chunk);
        });
        dataStream.on('error', function (err) {
          logger.error("error");
          reject(err);
        });
        dataStream.on('end', () => {
          const value = Buffer.concat(buff).toString('utf8');
          resolve(value);
        });
      });
    })
    .catch(err => {
      if (err.code === 'NoSuchKey') {
        // Gracefully handle missing key — return undefined
        return undefined;
      }
      throw err; // Propagate unexpected errors
    });
}
```

**After**:
```typescript
async get(key: string): Promise<string | undefined> {
  try {
    return await this.retryWithBackoff(async () => {
      const buff: Uint8Array[] = [];

      const dataStream = await this.client.getObject(S3_BUCKET, key);

      return new Promise<string>((resolve, reject) => {
        dataStream.on('data', (chunk: Uint8Array) => {
          buff.push(chunk);
        });
        dataStream.on('error', (err) => {
          reject(err);
        });
        dataStream.on('end', () => {
          const value = Buffer.concat(buff).toString('utf8');
          resolve(value);
        });
      });
    }, `get(${key})`);
  } catch (err: any) {
    if (err.code === 'NoSuchKey') {
      // Gracefully handle missing key — return undefined
      return undefined;
    }

    // Log error and return undefined (graceful degradation)
    logger.error(`S3 get failed after all retries for key: ${key}`, {
      error: err,
      code: err.code,
      endpoint: config.tokenStore.s3Endpoint,
      port: config.tokenStore.s3Port
    });
    return undefined;
  }
}
```

#### 4. Update put() Method with Retry
**File**: `src/app.ts`
**Changes**: Make async, wrap in retryWithBackoff, throw on failure

**Before** (lines 126-128):
```typescript
put(key:string, value:string) {
  this.client.putObject(S3_BUCKET, key, value);
}
```

**After**:
```typescript
async put(key: string, value: string): Promise<void> {
  try {
    await this.retryWithBackoff(async () => {
      await this.client.putObject(S3_BUCKET, key, value);
    }, `put(${key})`);
  } catch (err: any) {
    // Log error with full context
    logger.error(`S3 put failed after all retries for key: ${key}`, {
      error: err,
      code: err.code,
      endpoint: config.tokenStore.s3Endpoint,
      port: config.tokenStore.s3Port
    });

    // Re-throw to notify caller of failure
    throw new Error(`Failed to store token in S3: ${err.message || err}`);
  }
}
```

#### 5. Update delete() Method with Retry
**File**: `src/app.ts`
**Changes**: Make async, wrap in retryWithBackoff, log but don't throw on failure

**Before** (lines 129-131):
```typescript
delete(key:string) {
  this.client.removeObject(S3_BUCKET, key);
}
```

**After**:
```typescript
async delete(key: string): Promise<void> {
  try {
    await this.retryWithBackoff(async () => {
      await this.client.removeObject(S3_BUCKET, key);
    }, `delete(${key})`);
  } catch (err: any) {
    // Log error but don't throw (idempotent operation, non-critical)
    // Token is already removed from memory, S3 is just backup
    logger.error(`S3 delete failed after all retries for key: ${key}`, {
      error: err,
      code: err.code,
      endpoint: config.tokenStore.s3Endpoint,
      port: config.tokenStore.s3Port
    });
    // Explicitly don't throw - delete failures are non-critical
  }
}
```

### Success Criteria:

#### Automated Verification:
- [x] TypeScript compilation passes: `npx tsc --noEmit`
- [x] No type errors in MinioPersistentTokenStore

#### Manual Verification:
- [x] All three methods use retry utility
- [x] Retry logic implements exponential backoff (500ms, 1000ms, 2000ms)
- [x] get() returns undefined on failure
- [x] put() throws on failure
- [x] delete() never throws, only logs
- [x] All errors include connection details for debugging

---

## Phase 5: Update Client Code in SonosSoap

### Overview
Update the client code that calls put/delete to handle async operations properly. Make delete() fire-and-forget.

### Changes Required:

#### 1. Update associateCredentialsForToken Method
**File**: `src/smapi.ts`
**Changes**: Make method async, await put(), don't await delete()

**Before** (lines 244-252):
```typescript
associateCredentialsForToken(token: string, fullSmapiToken: SmapiToken, oldToken?:string) {
  logger.debug("Adding token: " + token + " " + JSON.stringify(fullSmapiToken));
  if(oldToken) {
    delete this.tokens[oldToken];
    this.s3Client.delete(token);
  }
  this.tokens[token] = fullSmapiToken;
  this.s3Client.put(token, smapiTokenAsString(fullSmapiToken));
}
```

**After**:
```typescript
async associateCredentialsForToken(token: string, fullSmapiToken: SmapiToken, oldToken?: string): Promise<void> {
  logger.debug("Adding token: " + token + " " + JSON.stringify(fullSmapiToken));

  if(oldToken) {
    delete this.tokens[oldToken];
    // Fire-and-forget delete (logs errors internally, doesn't block)
    this.s3Client.delete(oldToken).catch(() => {
      // Error already logged by delete() method, nothing to do
    });
  }

  // Store in memory first (works even if S3 fails)
  this.tokens[token] = fullSmapiToken;

  // Then persist to S3 (will throw if S3 unavailable after retries)
  await this.s3Client.put(token, smapiTokenAsString(fullSmapiToken));
}
```

**Bug Fix**: The original code at line 248 calls `this.s3Client.delete(token)` but should call `this.s3Client.delete(oldToken)`. It's deleting the NEW token instead of the old one! This fix corrects that error.

#### 2. Update Call Site #1: swapToken Function
**File**: `src/smapi.ts`
**Location**: Lines 455-460
**Context**: Used in TaskEither chain for token refresh (line 522)

**Before**:
```typescript
const swapToken = (expiredToken:string) => (newToken:SmapiToken) => {
  logger.debug("oldToken: "+expiredToken);
  logger.debug("newToken: "+JSON.stringify(newToken));
  sonosSoap.associateCredentialsForToken(newToken.token, newToken, expiredToken);
  return TE.right(newToken);
}
```

**After**:
```typescript
const swapToken = (expiredToken: string) => (newToken: SmapiToken) =>
  TE.tryCatch(
    async () => {
      logger.debug("oldToken: " + expiredToken);
      logger.debug("newToken: " + JSON.stringify(newToken));
      await sonosSoap.associateCredentialsForToken(newToken.token, newToken, expiredToken);
    },
    (error) => error as Error
  );
```

**Explanation**:
- Changed to return TaskEither wrapping async operation
- Used `TE.tryCatch` to handle the async call and potential errors
- This is used in `TE.tap()` (line 522) which expects TaskEither return
- Errors from put() will propagate through the TaskEither chain

#### 3. Update Call Site #2: getDeviceAuthToken SOAP Method
**File**: `src/smapi.ts`
**Location**: Lines 618-627
**Context**: SOAP method wrapped by wrapSoapMethod (which awaits)

**Before**:
```typescript
getDeviceAuthToken: ({ linkCode }: { linkCode: string }) => {
  const deviceAuthTokenResult = sonosSoap.getDeviceAuthToken({ linkCode });
  const smapiToken: SmapiToken = {
    token: deviceAuthTokenResult.getDeviceAuthTokenResult.authToken,
    key: deviceAuthTokenResult.getDeviceAuthTokenResult.privateKey
  };

  sonosSoap.associateCredentialsForToken(smapiToken.token, smapiToken);
  return deviceAuthTokenResult;
},
```

**After**:
```typescript
getDeviceAuthToken: async ({ linkCode }: { linkCode: string }) => {
  const deviceAuthTokenResult = sonosSoap.getDeviceAuthToken({ linkCode });
  const smapiToken: SmapiToken = {
    token: deviceAuthTokenResult.getDeviceAuthTokenResult.authToken,
    key: deviceAuthTokenResult.getDeviceAuthTokenResult.privateKey
  };

  await sonosSoap.associateCredentialsForToken(smapiToken.token, smapiToken);
  return deviceAuthTokenResult;
},
```

**Explanation**:
- Made method async
- Await the associateCredentialsForToken call
- If S3 put() fails, error will be caught by wrapSoapMethod and converted to SOAP Fault
- Client (Sonos) will receive error but server won't crash

### Success Criteria:

#### Automated Verification:
- [x] TypeScript compilation passes: `npx tsc --noEmit`
- [x] No type errors in smapi.ts
- [x] Grep search shows all 3 call sites updated: `grep -n "associateCredentialsForToken" src/smapi.ts`
  - Line 244: Method definition (async)
  - Line 468: swapToken call site (wrapped in TE.tryCatch)
  - Line 637: getDeviceAuthToken call site (awaited)

#### Manual Verification:
- [x] associateCredentialsForToken method is async (line 244)
- [x] Method correctly deletes oldToken, not token (bug fix)
- [x] delete() is fire-and-forget with .catch() suppression
- [x] put() is awaited (will throw on failure)
- [x] swapToken returns TaskEither wrapping async operation
- [x] getDeviceAuthToken is async and awaits the call
- [x] Both call sites will propagate put() errors appropriately

---

## Phase 6: Run Tests and Verify

### Overview
Run full test suite to verify no regressions and that error handling works correctly.

### Changes Required:

#### 1. Run Full Test Suite
**Command**: `nvm exec 20 npm test`
**Purpose**: Verify no new failures introduced

#### 2. Type Check
**Command**: `npx tsc --noEmit`
**Purpose**: Verify all TypeScript types are correct

#### 3. Manual Testing (if possible)
If you have a test environment where you can simulate S3 failure:
1. Start bonob with S3 unavailable
2. Trigger a token creation (login via Sonos)
3. Verify server doesn't crash
4. Check logs for retry attempts and error messages
5. Verify token works (stored in memory even if S3 fails)

### Success Criteria:

#### Automated Verification:
- [x] All tests pass: `npm test`
- [x] TypeScript compilation passes: `npx tsc --noEmit`
- [x] No new test failures compared to baseline
- [x] Build succeeds: `npm run build`

#### Manual Verification:
- [ ] Server continues running when S3 is unreachable
- [ ] Retry attempts visible in logs (3 attempts with delays)
- [ ] Error messages include connection details
- [ ] Tokens work even when S3 fails (stored in memory)
- [ ] delete() errors don't propagate to client
- [ ] put() errors are returned to client appropriately

---

## Testing Strategy

### Automated Testing:
- Existing integration tests in `tests/server.test.ts` and `tests/smapi.test.ts` use `unimplS3Client` (NoopPersistentTokenStore)
- These tests will verify behavior unchanged when S3 is not used
- Tests will catch any breaking changes to the interface or client code

### Manual Testing:
1. **S3 Unavailable Scenario**:
   - Stop S3/Minio service
   - Start bonob
   - Attempt login via Sonos app
   - Expected: 3 retry attempts, then error returned to client, server continues running

2. **S3 Available Scenario**:
   - Ensure S3/Minio running
   - Start bonob
   - Login via Sonos app
   - Expected: Token stored successfully, no retries

3. **S3 Intermittent Failure**:
   - Configure network to drop some packets
   - Attempt operations
   - Expected: Retries succeed when connection restored

### Error Log Verification:
Expected log patterns when S3 unavailable:
```
[warn] S3 put(token123) failed (attempt 1/3), retrying in 500ms { error: {...} }
[warn] S3 put(token123) failed (attempt 2/3), retrying in 1000ms { error: {...} }
[warn] S3 put(token123) failed (attempt 3/3), retrying in 2000ms { error: {...} }
[error] S3 put failed after all retries for key: token123 { error: {...}, endpoint: '192.168.14.22', port: 3900 }
```

---

## Performance Considerations

**Impact of Retry Logic**:
- Worst case: Operation takes ~7.5 seconds (500ms + 1000ms + 2000ms + 5000ms for last attempt)
- This only occurs when S3 is completely unreachable
- Normal case (S3 available): No performance impact
- Token stored in memory first, so Sonos functionality not blocked

**Mitigation**:
- delete() is fire-and-forget, doesn't block
- get() returns undefined quickly after retries (graceful degradation)
- put() blocks but necessary to know if persistence succeeded
- In-memory cache means tokens work even during S3 outage

---

## Migration Notes

**No Migration Required**:
- Changes are backward compatible
- No data format changes
- No configuration changes required
- Existing tokens in S3 continue to work

**Deployment**:
- Safe to deploy without downtime
- No database migrations needed
- No S3 bucket changes required

**Rollback**:
- Safe to rollback to previous version
- Tokens stored during new version will be readable by old version
- No data loss risk

---

## References

- Crash log: ECONNREFUSED error connecting to 192.168.14.22:3900
- Original bug location: src/app.ts:126-131 (MinioPersistentTokenStore put/delete)
- Method definition: src/smapi.ts:244-252 (SonosSoap.associateCredentialsForToken)
- Call sites found:
  - src/smapi.ts:458 (swapToken function in TaskEither chain)
  - src/smapi.ts:625 (getDeviceAuthToken SOAP method)
- Token deletion bug: src/smapi.ts:248 (deletes wrong token)
- Similar implementation: src/api_tokens.ts:82-114 (FilesystemPersistentTokenStore with ENOENT handling)
- Error handling patterns: src/subsonic.ts (Promise catch patterns), src/smapi.ts:550-602 (SOAP error wrapper)
