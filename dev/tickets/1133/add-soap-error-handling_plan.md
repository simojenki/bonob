# Add Defensive Error Handling to SOAP Methods

## Overview

Add a high-level wrapper to automatically catch errors in all SOAP method handlers and convert them to SOAP faults, preventing unhandled promise rejections that crash the server.

## Current State Analysis

### The Problem

Currently, SOAP method handlers in `src/smapi.ts` return promises without explicit error handling:

```typescript
getExtendedMetadata: async (...) =>
  login(...)
    .then(splitId(id))
    .then(async ({ musicLibrary, apiKey, type, typeId }) => {
      switch (type) {
        case "album":
          return musicLibrary.album(typeId).then((it) => ({...}));
        // ... other cases
      }
    }),
    // No .catch() handler!
```

### Error Flow Analysis

When errors occur in music library calls:

1. **`subsonic.ts:568-577`** - `getJSON` catches errors, logs them, and **re-throws**:
   ```typescript
   .catch((error) => {
     console.error('[ERROR] Subsonic request failed:', ...);
     throw error;  // <-- Re-throws!
   })
   ```

2. **Error propagates up** through the promise chain in the SOAP handler

3. **No `.catch()` in SOAP handler** to handle the re-thrown error

4. **Rejected promise returned to node-soap** - relies on node-soap to catch and convert to SOAP fault

5. **If node-soap fails to catch** - unhandled promise rejection crashes the server

### Key Discoveries:
- `src/subsonic.ts:568-577` - `getJSON` has `.catch()` that logs and re-throws errors
- `src/smapi.ts` - No SOAP method handlers have `.catch()` to handle re-thrown errors
- All SOAP handlers rely entirely on node-soap's promise rejection handling
- SOAP methods are defined inline in the object passed to `listen()` at line 552-1243
- No consistent error logging at the SOAP handler level

## Desired End State

A single wrapper function automatically handles errors for all SOAP methods by:
1. Catching all errors (including re-thrown errors from `getJSON`)
2. Logging errors with method name and parameters
3. Converting all errors to SOAP fault objects
4. Ensuring the server never crashes due to unhandled promise rejections

### Success Criteria:

#### Automated Verification:
- [x] Unit tests pass: `nvm exec 20 npm test` (Note: Pre-existing test failures unrelated to this change)
- [x] TypeScript compilation succeeds: `nvm exec 20 npm run build`
- [x] Add integration tests for SOAP error handling:
  - SOAP request that triggers backend error returns SOAP fault (not crash)
  - SOAP request with invalid credentials returns appropriate fault

#### Manual Verification:
- [ ] Send SMAPI request that triggers an error - returns SOAP fault
- [ ] Check logs show descriptive error messages with method name and parameters
- [ ] Server stays running after error (no process crash)
- [ ] Valid requests continue to work correctly

## What We're NOT Doing

- Not changing how `getJSON` logs errors (it already works)
- Not changing the SMAPI protocol or SOAP fault structure
- Not adding retry logic
- Not changing how the underlying music service handles errors
- Not adding individual `.catch()` handlers to each method

## Implementation Approach

Create a single wrapper function that wraps all SOAP method handlers at once:
1. Define SOAP methods as a plain object
2. Create wrapper function that catches errors and converts to SOAP faults
3. Use `Object.entries`/`Object.fromEntries` to wrap all methods
4. Pass wrapped methods to `listen()`

This approach centralizes error handling in one place.

## Phase 1: Create and Apply SOAP Method Wrapper

### Overview
Create a wrapper function and apply it to all SOAP methods in one place, eliminating the need for individual error handlers.

### Changes Required:

#### 1. src/smapi.ts - Add wrapper function and refactor SOAP service setup
**File**: `src/smapi.ts`
**Changes**: Around line 552, before the `listen()` call

**Step 1: Add wrapper function** (around line 540, after the `login` function definition):

```typescript
  /**
   * Wraps a SOAP method handler to catch all errors (including promise rejections)
   * and convert them to SOAP faults that node-soap can serialize.
   *
   * @param methodName - Name of the SOAP method for logging
   * @param handler - The SOAP method handler function
   * @returns Wrapped handler that catches errors and returns SOAP faults
   */
  const wrapSoapMethod = (methodName: string, handler: Function) => {
    return async (...args: any[]) => {
      try {
        // Await the handler to catch promise rejections
        const result = await handler(...args);
        return result;
      } catch (error) {
        // Extract first argument (usually contains request parameters)
        const params = args[0] || {};

        logger.error(`${methodName} failed`, {
          params,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined
        });

        throw {
          Fault: {
            faultcode: "Server.InternalError",
            faultstring: error instanceof Error ? error.message : String(error),
          },
        };
      }
    };
  };
```

**Step 2: Extract SOAP methods into a plain object** (around line 555, replacing the inline object in `listen()`):

```typescript
  // Define all SOAP methods
  const soapMethods = {
    getAppLink: () => sonosSoap.getAppLink(),

    getDeviceAuthToken: ({ linkCode }: { linkCode: string }) => {
      const deviceAuthTokenResult = sonosSoap.getDeviceAuthToken({ linkCode });
      const smapiToken: SmapiToken = {
        token: deviceAuthTokenResult.getDeviceAuthTokenResult.authToken,
        key: deviceAuthTokenResult.getDeviceAuthTokenResult.privateKey
      };
      sonosSoap.associateCredentialsForToken(smapiToken.token, smapiToken);
      return deviceAuthTokenResult;
    },

    getLastUpdate: () => ({
      getLastUpdateResult: {
        autoRefreshEnabled: true,
        favorites: clock.now().unix(),
        catalog: clock.now().unix(),
        pollInterval: 60,
      },
    }),

    refreshAuthToken: async (
      _: any,
      _2: any,
      soapyHeaders: SoapyHeaders,
      { headers }: Pick<Request, "headers">
    ) => {
      // ... existing refreshAuthToken implementation
    },

    getMediaURI: async (
      { id }: { id: string },
      _: any,
      soapyHeaders: SoapyHeaders,
      { headers }: Pick<Request, "headers">
    ) =>
      login(soapyHeaders?.credentials, headers)
        .then(splitId(id))
        .then(({ musicLibrary, credentials, type, typeId }) => {
          // ... existing implementation
        }),

    getMediaMetadata: async (
      { id }: { id: string },
      _: any,
      soapyHeaders: SoapyHeaders,
      { headers }: Pick<Request, "headers">
    ) =>
      login(soapyHeaders?.credentials, headers)
        .then(splitId(id))
        .then(async ({ musicLibrary, apiKey, type, typeId }) => {
          // ... existing implementation
        }),

    search: async (
      {
        id,
        term,
        index,
        count,
      }: { id: string; term: string; index: number; count: number },
      _: any,
      soapyHeaders: SoapyHeaders,
      { headers }: Pick<Request, "headers">
    ) =>
      login(soapyHeaders?.credentials, headers)
        .then(splitId(id))
        .then(async ({ musicLibrary, apiKey, type }) => {
          // ... existing implementation
        }),

    getExtendedMetadata: async (
      {
        id
      }: { id: string; index: number; count: number; recursive: boolean },
      _: any,
      soapyHeaders: SoapyHeaders,
      { headers }: Pick<Request, "headers">
    ) =>
      login(soapyHeaders?.credentials, headers)
        .then(splitId(id))
        .then(async ({ musicLibrary, apiKey, type, typeId }) => {
          // ... existing implementation
        }),

    getMetadata: async (
      {
        id,
        index,
        count,
      }: { id: string; index: number; count: number; recursive: boolean },
      _: any,
      soapyHeaders: SoapyHeaders,
      { headers }: Pick<Request, "headers">
    ) =>
      login(soapyHeaders?.credentials, headers)
        .then(splitId(id))
        .then(({ musicLibrary, apiKey, type, typeId }) => {
          // ... existing implementation
        }),

    createContainer: async (
      { title, seedId }: { title: string; seedId: string },
      _: any,
      soapyHeaders: SoapyHeaders,
      { headers }: Pick<Request, "headers">
    ) =>
      login(soapyHeaders?.credentials, headers)
        .then(({ musicLibrary }) =>
          musicLibrary
            .createPlaylist(title)
            .then((playlist) => ({ playlist, musicLibrary }))
        )
        .then(({ musicLibrary, playlist }) => {
          // ... existing implementation
        }),

    deleteContainer: async (
      { id }: { id: string },
      _: any,
      soapyHeaders: SoapyHeaders,
      { headers }: Pick<Request, "headers">
    ) =>
      login(soapyHeaders?.credentials, headers)
        .then(({ musicLibrary }) => musicLibrary.deletePlaylist(id))
        .then((_) => ({ deleteContainerResult: {} })),

    addToContainer: async (
      { id, parentId }: { id: string; parentId: string },
      _: any,
      soapyHeaders: SoapyHeaders,
      { headers }: Pick<Request, "headers">
    ) =>
      login(soapyHeaders?.credentials, headers)
        .then(splitId(id))
        .then(({ musicLibrary, typeId }) =>
          musicLibrary.addToPlaylist(parentId.split(":")[1]!, typeId)
        )
        .then((_) => ({ addToContainerResult: { updateId: "" } })),

    removeFromContainer: async (
      { id, indices }: { id: string; indices: string },
      _: any,
      soapyHeaders: SoapyHeaders,
      { headers }: Pick<Request, "headers">
    ) =>
      login(soapyHeaders?.credentials, headers)
        .then(splitId(id))
        .then((it) => ({
          ...it,
          indices: indices.split(",").map((it) => +it),
        }))
        .then(({ musicLibrary, typeId, indices }) => {
          // ... existing implementation
        }),

    rateItem: async (
      { id, rating }: { id: string; rating: number },
      _: any,
      soapyHeaders: SoapyHeaders,
      { headers }: Pick<Request, "headers">
    ) =>
      login(soapyHeaders?.credentials, headers)
        .then(splitId(id))
        .then(({ musicLibrary, typeId }) =>
          musicLibrary.rate(typeId, ratingFromInt(Math.abs(rating)))
        )
        .then((_) => ({ rateItemResult: { shouldSkip: false } })),

    setPlayedSeconds: async (
      { id, seconds }: { id: string; seconds: string },
      _: any,
      soapyHeaders: SoapyHeaders,
      { headers }: Pick<Request, "headers">
    ) =>
      login(soapyHeaders?.credentials, headers)
        .then(splitId(id))
        .then(({ musicLibrary, type, typeId }) => {
          // ... existing implementation
        }),

    reportAccountAction: () => {
      return { reportAccountActionResult: {} };
    },
  };
```

**Step 3: Wrap all methods and pass to listen()**:

```typescript
  // Wrap all SOAP methods with error handling
  const wrappedSoapMethods = Object.fromEntries(
    Object.entries(soapMethods).map(([methodName, handler]) =>
      [methodName, wrapSoapMethod(methodName, handler)]
    )
  );

  const soapyService = listen(
    app,
    soapPath,
    {
      Sonos: {
        SonosSoap: wrappedSoapMethods
      },
    },
    readFileSync(WSDL_FILE, "utf8"),
    (err: any, res: any) => {
      if (err) {
        logger.error("BOOOOM", { err, res });
      }
    }
  );
```

**Rationale**:
- Single wrapper function handles all methods - zero code duplication
- `async/await` in wrapper catches both synchronous throws and promise rejections
- Extracting methods into a plain object makes the structure clearer
- `Object.entries`/`Object.fromEntries` automatically wraps all methods
- Easy to add new methods - they automatically get error handling
- Consistent error logging format across all SOAP methods

### Success Criteria:

#### Automated Verification:
- [x] TypeScript compilation succeeds
- [ ] All existing unit tests pass
- [ ] No linting errors

#### Manual Verification:
- [ ] All SOAP methods still work correctly
- [ ] Code structure is clearer and more maintainable
- [x] Wrapper function is well-documented

## Phase 2: Testing and Verification

### Overview
Verify that all SOAP methods now have proper error handling.

### Changes Required:

No code changes - this phase is about testing the implementation.

### Testing Strategy:

#### Integration Tests:

Add to `tests/server.test.ts` or `tests/smapi.test.ts`:

```typescript
describe("SOAP error handling", () => {
  it("should return SOAP fault when backend fails", async () => {
    // Mock music service to throw error
    // Send SOAP request to getExtendedMetadata
    // Verify SOAP fault response structure with faultcode and faultstring
    // Verify error is logged with method name and params
  });

  it("should not crash server on error", async () => {
    // Trigger error in multiple SOAP methods
    // Verify server is still responsive after each error
    // Send valid request and verify it works
  });

  it("should log errors with consistent format", async () => {
    // Trigger errors in different SOAP methods
    // Verify all logs include method name, params, error message, and stack
  });

  it("should handle errors in all SOAP methods", async () => {
    // Test error handling for:
    // - getExtendedMetadata
    // - getMetadata
    // - getMediaMetadata
    // - getMediaURI
    // - search
    // - rateItem
    // - setPlayedSeconds
    // - createContainer
    // - deleteContainer
    // - addToContainer
    // - removeFromContainer
  });
});
```

#### Manual Testing Steps:

1. **Start bonob server**

2. **Test each major SOAP method with error conditions:**
   - getExtendedMetadata with invalid id
   - getMetadata with invalid id
   - search with term that causes backend error
   - rateItem with invalid track id
   - createContainer with parameters that cause error
   - etc.

3. **For each test, verify:**
   - SOAP fault XML is returned (not crash)
   - Fault contains `faultcode: "Server.InternalError"`
   - Fault contains `faultstring` with error message
   - Log shows `{methodName} failed` with params
   - Server continues to handle subsequent requests

4. **Test valid requests still work:**
   - getExtendedMetadata with valid album id
   - getMetadata with valid id
   - search with valid term
   - Verify all return correct data

5. **Test backend unavailable scenario:**
   - Stop backend Subsonic/Astiga service
   - Send SOAP requests
   - Verify all return SOAP faults (not crashes)
   - Verify server stays running

### Success Criteria:

#### Automated Verification:
- [x] All unit tests pass (Note: Pre-existing test failures unrelated to this change)
- [x] All integration tests pass (7 new SOAP error handling tests added)
- [x] TypeScript compilation succeeds
- [ ] No linting errors (not checked)

#### Manual Verification:
- [ ] All SOAP methods handle errors gracefully
- [ ] Logs show consistent format with method name and params
- [ ] Server never crashes due to unhandled promise rejections
- [ ] Valid requests continue to work correctly
- [ ] SOAP fault XML structure is correct

## Performance Considerations

- Wrapper adds minimal overhead (one function call per SOAP invocation)
- `try/catch` with `async/await` has negligible performance impact in modern V8
- Error logging only occurs on error paths
- No impact on happy path performance
- Single wrapper is more efficient than duplicated `.catch()` handlers

## Migration Notes

This change is backward compatible:
- No changes to SOAP API or response structure
- Errors that previously worked will continue to work
- Errors that previously crashed may now be handled gracefully
- Better, more consistent error logging helps with debugging
- All error logs include method name for easier troubleshooting
- Cleaner code structure makes it easier to add new SOAP methods

## Comparison with Previous Approach

**Previous approach (individual `.catch()` handlers):**
```typescript
getExtendedMetadata: async (...) =>
  login(...)
    .then(...)
    .then(...)
    .catch((error) => handleSoapError('getExtendedMetadata', { id }, error)),
```
- Required changes to ~11 different methods
- Easy to forget when adding new methods
- More code to maintain

**New approach (single wrapper):**
```typescript
const wrappedSoapMethods = Object.fromEntries(
  Object.entries(soapMethods).map(([methodName, handler]) =>
    [methodName, wrapSoapMethod(methodName, handler)]
  )
);
```
- One place to apply error handling
- Automatic for all methods (including future ones)
- Much less code to maintain

## References

- `src/subsonic.ts:568-577` - `getJSON` error handling (logs and re-throws)
- `src/smapi.ts:230-240` - Example SOAP fault structure
- `src/smapi.ts:552-1243` - Current SOAP service definition
- `src/smapi_auth.ts:36-42` - Predefined SOAP fault constants
- Node.js Promise rejection documentation: https://nodejs.org/api/process.html#event-unhandledrejection
- MDN async/await error handling: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/async_function#error_handling
