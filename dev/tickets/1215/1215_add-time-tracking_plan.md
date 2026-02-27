# Add Time Tracking Implementation Plan

## Overview

Add timing instrumentation to all SMAPI and Subsonic calls to diagnose slow requests causing "Something went wrong" errors in Sonos. Log duration after each request with ASCII markers for easy grep-based analysis.

## Current State Analysis

- SMAPI calls all pass through `wrapSoapMethod` (`smapi.ts:562-614`) which wraps each SOAP handler in try/catch error handling. No timing exists.
- Subsonic calls all pass through the `get` method (`subsonic.ts:522-552`) which calls axios and has debug-level logging of path/params before the call. No timing exists.
- Logger (`logger.ts`) outputs JSON format with timestamps via Winston.

### Key Discoveries:
- `wrapSoapMethod` at `smapi.ts:562` is the single choke point for all SMAPI calls — ideal instrumentation point
- `Subsonic.get` at `subsonic.ts:522` is the single choke point for all Subsonic REST calls (including `getJSON` which delegates to it)
- Both success and failure paths need timing

## Desired End State

All SMAPI and Subsonic calls log their duration after completion with a `[TIMING]` marker. A grep one-liner can extract and sort these by duration to find slow requests.

Example log lines:
```
{"level":"info","message":"[TIMING] SMAPI getMetadata 1523ms","durationMs":1523,"method":"getMetadata",...}
{"level":"info","message":"[TIMING] Subsonic /rest/getAlbumList2 892ms","durationMs":892,"path":"/rest/getAlbumList2",...}
```

## What We're NOT Doing

- Not instrumenting `/stream` endpoint (excluded per ticket)
- Not instrumenting Navidrome auth POST (`subsonic.ts:1132`) or external image fetches (`subsonic.ts:462`)
- Not adding alerting or dashboards — just logs
- Not changing log format or logger configuration

## Implementation Approach

Use `Date.now()` before and after each call. Log at `info` level with `[TIMING]` prefix for grepability. Include duration as both human-readable in the message and as a structured `durationMs` field.

## Phase 1: SMAPI Timing

### Overview
Instrument `wrapSoapMethod` to time every SOAP method call.

### Changes Required:

**File**: `src/smapi.ts`
**Changes**: Add timing around the handler call in `wrapSoapMethod` (line 562-614). Time both success and failure paths.

Replace the body of the wrapped function:

```typescript
const wrapSoapMethod = (methodName: string, handler: Function) => {
  return async (...args: any[]) => {
    const startTime = Date.now();
    try {
      const result = await handler(...args);
      const durationMs = Date.now() - startTime;
      logger.info(`[TIMING] SMAPI ${methodName} ${durationMs}ms`, { method: methodName, durationMs });
      return result;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      logger.info(`[TIMING] SMAPI ${methodName} ${durationMs}ms FAILED`, { method: methodName, durationMs, failed: true });

      // existing error handling unchanged from here...
      if (error && typeof error === 'object' && 'Fault' in error) {
        throw error;
      }
      // ... rest of existing catch block stays the same
    }
  };
};
```

The key points:
- `startTime` captured before `await handler(...args)`
- On success: log timing then return result
- On failure: log timing with `FAILED` suffix, then continue with existing error handling (the rest of the catch block remains unchanged)

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compiles without errors
- [ ] All existing tests pass: `nvm exec 20 npm test`

#### Manual Verification:
- [ ] Make a Sonos request, confirm `[TIMING] SMAPI` lines appear in logs
- [ ] Confirm duration values are reasonable (not 0ms, not negative)

---

## Phase 2: Subsonic Timing

### Overview
Instrument the `get` method to time every Subsonic REST call.

### Changes Required:

**File**: `src/subsonic.ts`
**Changes**: Add timing around the axios call in the `get` method (line 522-552).

```typescript
get = async (
  { username, password }: Credentials,
  path: string,
  q: {} = {},
  config: AxiosRequestConfig | undefined = {}
) => {
  logger.debug(username + " " + path + " " + JSON.stringify(q));
  const startTime = Date.now();
  return axios
    .get(this.url.append({ pathname: path }).href(), {
      params: asURLSearchParams({
        u: username,
        v: "1.16.1",
        c: DEFAULT_CLIENT_APPLICATION,
        ...t_and_s(password),
        ...q,
      }),
      headers: {
        "User-Agent": USER_AGENT,
      },
      ...config,
    })
    .catch((e) => {
      const durationMs = Date.now() - startTime;
      logger.info(`[TIMING] Subsonic ${path} ${durationMs}ms FAILED`, { path, durationMs, failed: true });
      logger.error(`Subsonic request failed: ${path}`, { query: q, error: e instanceof Error ? e.message : String(e) });
      throw `Subsonic failed with: ${e}`;
    })
    .then((response) => {
      const durationMs = Date.now() - startTime;
      logger.info(`[TIMING] Subsonic ${path} ${durationMs}ms`, { path, durationMs });
      if (response.status != 200 && response.status != 206) {
        throw `Subsonic failed with a ${response.status || "no!"} status`;
      } else return response;
    });
}
```

The key points:
- `startTime` captured before the axios call
- On catch: log timing with `FAILED`, then continue with existing error handling
- On success (`.then`): log timing before the status check

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compiles without errors
- [ ] All existing tests pass: `nvm exec 20 npm test`

#### Manual Verification:
- [ ] Make a Sonos request that triggers Subsonic calls, confirm `[TIMING] Subsonic` lines appear in logs
- [ ] Confirm both SMAPI and Subsonic timing appear for a single user action

---

## Phase 3: Grep Command

### Overview
Document a grep one-liner for analysing timing logs, sorted by duration (slowest first).

### Command:

```bash
grep '\[TIMING\]' bonob.log | sed 's/.*\[TIMING\] //' | sort -t' ' -k3 -rn
```

This extracts timing lines, strips the JSON prefix to show just the readable part, and sorts by the duration number (descending — slowest first).

For structured JSON parsing (if `jq` is available):

```bash
grep '\[TIMING\]' bonob.log | jq -r '[.durationMs, .message] | @tsv' | sort -rn
```

To show only slow requests (e.g. > 5000ms):

```bash
grep '\[TIMING\]' bonob.log | jq -r 'select(.durationMs > 5000) | [.durationMs, .message] | @tsv' | sort -rn
```

### Where to document:
Add these commands as a comment block at the top of this ticket or in the PR description. No code changes needed.

### Success Criteria:

#### Automated Verification:
- [ ] N/A — documentation only

#### Manual Verification:
- [ ] Run the grep command against real logs and verify output is sorted by duration
- [ ] Verify the slow-request filter works correctly

---

## Testing Strategy

### Unit Tests:
No new unit tests required — this is logging-only instrumentation. Existing tests verify the SMAPI and Subsonic functionality is unchanged.

### Manual Testing Steps:
1. Start bonob, connect Sonos, browse music
2. Verify `[TIMING] SMAPI` and `[TIMING] Subsonic` lines appear in logs
3. Verify failed requests also get timing logged
4. Run grep one-liner against the logs and confirm sorting works
5. Verify no regressions in Sonos playback/browsing

## Performance Considerations

`Date.now()` is extremely fast (nanoseconds) — no measurable overhead.

## References

- Original ticket: `dev/tickets/1215/1215_add-time-tracking_ticket.md`
- SMAPI wrapper: `src/smapi.ts:562`
- Subsonic get: `src/subsonic.ts:522`
