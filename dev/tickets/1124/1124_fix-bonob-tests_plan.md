# Fix Bonob Tests Implementation Plan

## Overview

Fix the remaining 33 failing tests in `tests/subsonic.test.ts`. These are all test infrastructure issues - the production code is working correctly. The failures are caused by outdated mock sequences that don't match the current code behavior.

## Current State Analysis

**Test Results:**
- Total: 137 tests
- Passing: 104 (76%)
- Failing: 33 (24%)

### Root Cause Summary

All 33 test failures have the same root cause pattern: **the production code was refactored to make fewer API calls, but the tests still mock the old API call sequence**.

| Issue | Tests Affected | Old Behavior | New Behavior |
|-------|----------------|--------------|--------------|
| `getTrack` no longer calls `getAlbum` | 22 tests | getSong → getAlbum | getSong only |
| `albums()` no longer calls `getArtists` | 15 tests | getArtists → getAlbumList2 | getAlbumList2 only |
| coverArt UUID inconsistency | 8 tests | - | Track and album coverArt must match |

### Key Discovery: Production Code Changes

The production code was updated so that:

1. **`getTrack()` (line 729-749)**: Only calls `/rest/getSong`, extracts album info from the song response
2. **`stream()` (line 868-905)**: Calls `getTrack()` then `/rest/stream`
3. **`rate()` (line 834-867)**: Calls `getTrack()` then conditionally star/unstar/setRating
4. **`similarSongs()` (line 1034-1058)**: Calls `/rest/getSimilarSongs2`, creates albums from song data
5. **`topSongs()` (line 1060-1085)**: Calls `getArtist()` then `/rest/getTopSongs`, creates albums from song data
6. **`albums()` (line 809-810)**: Directly calls `getAlbumList2()`, does NOT call `getArtists()` first

## Desired End State

All 137 tests in `tests/subsonic.test.ts` pass.

### Success Criteria:

#### Automated Verification:
- [ ] `npm test -- tests/subsonic.test.ts` passes with 0 failures
- [ ] TypeScript compilation succeeds: `npx tsc --noEmit`

#### Manual Verification:
- [ ] Review changes to ensure no test logic was removed, only mock sequences corrected

## What We're NOT Doing

- NOT modifying production code in `src/subsonic.ts`
- NOT adding new tests
- NOT changing test assertions (except removing obsolete endpoint verifications)

## Implementation Approach

All fixes follow the same pattern: **remove extra mock calls that the code no longer makes**.

---

## Phase 1: Fix Streaming Tests (8 tests) ✅ COMPLETE

### Overview
Remove the unnecessary `getAlbumJson` mock from all streaming tests.

### Root Cause
`stream()` calls `getTrack()` which only calls `/rest/getSong`. Tests incorrectly mock an additional `getAlbum` call.

### Changes Required:

**File**: `tests/subsonic.test.ts`

#### Test 1: Line ~3159-3178
**Test**: "when navidrome doesnt return a content-range, accept-ranges or content-length"

**Before:**
```typescript
mockGET
  .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
  .mockImplementationOnce(() => Promise.resolve(ok(getSongJson(track))))
  .mockImplementationOnce(() => Promise.resolve(ok(getAlbumJson(artist, album, []))))  // REMOVE
  .mockImplementationOnce(() => Promise.resolve(streamResponse));
```

**After:**
```typescript
mockGET
  .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
  .mockImplementationOnce(() => Promise.resolve(ok(getSongJson(track))))
  .mockImplementationOnce(() => Promise.resolve(streamResponse));
```

#### Test 2: Line ~3198-3217
**Test**: "when navidrome returns a undefined for content-range, accept-ranges or content-length"

Remove the `getAlbumJson` mock (same pattern as Test 1).

#### Test 3: Line ~3239-3270
**Test**: "navidrome returns a 200"

Remove the `getAlbumJson` mock (same pattern as Test 1).

#### Test 4: Line ~3285-3301
**Test**: "navidrome returns something other than a 200"

Remove the `getAlbumJson` mock (same pattern as Test 1).

#### Test 5: Line ~3307-3323
**Test**: "io exception occurs"

Remove the `getAlbumJson` mock (same pattern as Test 1).

#### Test 6: Line ~3345-3377
**Test**: "with range specified"

Remove the `getAlbumJson` mock (same pattern as Test 1).

#### Test 7: Line ~3406-3430 (custom players section)
**Test**: "when no range specified"

Remove the `getAlbumJson` mock (same pattern as Test 1).

#### Test 8: Line ~3445-3470
**Test**: "when range specified" (custom players)

Remove the `getAlbumJson` mock (same pattern as Test 1).

### Success Criteria:

#### Automated Verification:
- [x] `npm test -- tests/subsonic.test.ts -t "streaming a track"` - all 8 tests pass

---

## Phase 2: Fix Album Tests (15 tests)

### Overview
Remove the unnecessary `getArtistList` mock from all album filtering/pagination tests.

### Root Cause
`albums()` now calls `getAlbumList2()` directly. Tests incorrectly mock a `getArtistList` call first.

### Changes Required:

**File**: `tests/subsonic.test.ts`

#### 2.1 Album Filtering Tests (5 tests)

All filtering tests in the "filtering" describe block (lines ~1852-2090) need the `asArtistsJson` mock removed.

**Tests:**
1. "by genre" (line ~1852)
2. "by newest" (line ~1905)
3. "by recently played" (line ~1956)
4. "by frequently played" (line ~2007)
5. "by starred" (line ~2049)

**Before (example from "by genre"):**
```typescript
mockGET
  .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
  .mockImplementationOnce(() => Promise.resolve(ok(asArtistsJson([artist]))))  // REMOVE
  .mockImplementationOnce(() => Promise.resolve(ok(getAlbumListJson([...]))));
```

**After:**
```typescript
mockGET
  .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
  .mockImplementationOnce(() => Promise.resolve(ok(getAlbumListJson([...]))));
```

Also remove the endpoint verification for `/rest/getArtistList`:
```typescript
// REMOVE THIS BLOCK:
expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getArtistList' }).href(), {
  params: asURLSearchParams(authParamsPlusJson),
  headers,
});
```

#### 2.2 Single Album Tests (2 tests)

**Tests:**
1. "when the artist has only 1 album" (line ~2092)
2. "when the only artist has no albums" (line ~2142)

Same fix as filtering tests - remove `asArtistsJson` mock and `/rest/getArtistList` verification.

#### 2.3 Pagination Tests (8 tests)

**Location**: Lines ~2192-2600

**Tests in "when there are 6 albums in total":**
1. "querying for all of them"
2. "querying for a page of them"

**Tests in "when the number of albums reported...":**
3-8. Various mismatch/pre-fetch tests

Same fix pattern - remove `asArtistsJson` mock and `/rest/getArtistList` verification from each test.

### Success Criteria:

#### Automated Verification:
- [ ] `npm test -- tests/subsonic.test.ts -t "getting albums"` - all album tests pass

---

## Phase 3: Fix Single Track Tests (4 tests)

### Overview
Remove the unnecessary `getAlbumJson` mock and fix coverArt UUID consistency.

### Root Cause
1. `track()` calls `getTrack()` which only calls `/rest/getSong`
2. Track coverArt UUID doesn't match album coverArt UUID

### Changes Required:

**File**: `tests/subsonic.test.ts`

#### 3.1 Fix "getting tracks for an album" tests (2 tests)

**Location**: Lines ~2820-3007

**Tests:**
1. "when the album has multiple tracks, some of which are rated"
2. "when a custom player is configured for the mime type"

**Fix**: Ensure track coverArt matches album coverArt when creating test tracks:

**Before:**
```typescript
const track = aTrack({
  artist: artistToArtistSummary(artist),
  album: albumToAlbumSummary(album),
  genre: hipHop,
  // coverArt not set - defaults to random UUID
});
```

**After:**
```typescript
const track = aTrack({
  artist: artistToArtistSummary(artist),
  album: albumToAlbumSummary(album),
  genre: hipHop,
  coverArt: album.coverArt,  // ADD: ensure coverArt matches album
});
```

#### 3.2 Fix "a single track" tests (2 tests)

**Location**: Lines ~3010-3118

**Tests:**
1. "that is starred"
2. "that is not starred"

**Fix Part 1**: Remove the `getAlbumJson` mock:

**Before:**
```typescript
mockGET
  .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
  .mockImplementationOnce(() => Promise.resolve(ok(getSongJson(track))))
  .mockImplementationOnce(() => Promise.resolve(ok(getAlbumJson(artist, album, []))));  // REMOVE
```

**After:**
```typescript
mockGET
  .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
  .mockImplementationOnce(() => Promise.resolve(ok(getSongJson(track))));
```

**Fix Part 2**: Remove the `/rest/getAlbum` endpoint verification:

```typescript
// REMOVE THIS BLOCK:
expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getAlbum' }).href(), {
  params: asURLSearchParams({
    ...authParamsPlusJson,
    id: album.id,
  }),
  headers,
});
```

**Fix Part 3**: Ensure track coverArt matches album coverArt:

```typescript
const track = aTrack({
  artist: artistToArtistSummary(artist),
  album: albumToAlbumSummary(album),
  genre: pop,
  coverArt: album.coverArt,  // ADD
  rating: { love: true, stars: 4 },
});
```

### Success Criteria:

#### Automated Verification:
- [ ] `npm test -- tests/subsonic.test.ts -t "getting tracks"` - all 4 tests pass

---

## Phase 4: Fix Rating Tests (2 tests)

### Overview
Remove the unnecessary `getAlbumJson` mock and fix expected call count.

### Root Cause
`rate()` calls `getTrack()` which only calls `/rest/getSong`. When rating hasn't changed, no additional API calls are made.

### Changes Required:

**File**: `tests/subsonic.test.ts`

#### Test 1: Line ~3776-3800
**Test**: "loving a track that is already loved › shouldn't do anything"

**Before:**
```typescript
mockGET
  .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
  .mockImplementationOnce(() => Promise.resolve(ok(getSongJson(track))))
  .mockImplementationOnce(() => Promise.resolve(ok(getAlbumJson(artist, album, []))));  // REMOVE

// ...
expect(mockGET).toHaveBeenCalledTimes(3);  // CHANGE TO 2
```

**After:**
```typescript
mockGET
  .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
  .mockImplementationOnce(() => Promise.resolve(ok(getSongJson(track))));

// ...
expect(mockGET).toHaveBeenCalledTimes(2);
```

Also add coverArt consistency:
```typescript
const track = aTrack({
  id: trackId,
  artist,
  album: albumToAlbumSummary(album),
  rating: { love: true, stars: 0 },
  coverArt: album.coverArt,  // ADD
});
```

#### Test 2: Line ~3836-3860
**Test**: "rating a track with the same rating it already has › shouldn't do anything"

Same fix as Test 1:
- Remove `getAlbumJson` mock
- Change `toHaveBeenCalledTimes(3)` to `toHaveBeenCalledTimes(2)`
- Add `coverArt: album.coverArt` to track creation

### Success Criteria:

#### Automated Verification:
- [ ] `npm test -- tests/subsonic.test.ts -t "rating a track"` - all rating tests pass

---

## Phase 5: Fix Similar/Top Songs Tests (4 tests)

### Overview
Remove the unnecessary `getAlbumJson` mocks and fix coverArt UUID consistency.

### Root Cause
1. `similarSongs()` and `topSongs()` no longer call `getAlbum()` - they extract album info from song responses
2. Track coverArt UUIDs don't match album coverArt UUIDs

### Changes Required:

**File**: `tests/subsonic.test.ts`

#### 5.1 Similar Songs Tests (2 tests)

**Location**: Lines ~4680-4798

**Test 1: "when there is one similar songs" (line ~4680)**

**Before:**
```typescript
mockGET
  .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
  .mockImplementationOnce(() => Promise.resolve(ok(getSimilarSongsJson([track1]))))
  .mockImplementationOnce(() => Promise.resolve(ok(getAlbumJson(artist1, album1, []))));  // REMOVE
```

**After:**
```typescript
mockGET
  .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
  .mockImplementationOnce(() => Promise.resolve(ok(getSimilarSongsJson([track1]))));
```

Also fix track creation:
```typescript
const track1 = aTrack({
  id: "track1",
  artist: artistToArtistSummary(artist1),
  album: albumToAlbumSummary(album1),
  genre: pop,
  coverArt: album1.coverArt,  // ADD
});
```

**Test 2: "when there are similar songs" (line ~4731)**

Remove ALL three `getAlbumJson` mocks:
```typescript
mockGET
  .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
  .mockImplementationOnce(() => Promise.resolve(ok(getSimilarSongsJson([track1, track2, track3]))));
  // REMOVE the three getAlbumJson mocks
```

Add coverArt to all track creations:
```typescript
const track1 = aTrack({ ..., coverArt: album1.coverArt });
const track2 = aTrack({ ..., coverArt: album2.coverArt });
const track3 = aTrack({ ..., coverArt: album1.coverArt });
```

#### 5.2 Top Songs Tests (2 tests)

**Location**: Lines ~4846-4963

**Test 1: "when there is one top song" (line ~4851)**

**Before:**
```typescript
mockGET
  .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
  .mockImplementationOnce(() => Promise.resolve(ok(getArtistJson(artist))))
  .mockImplementationOnce(() => Promise.resolve(ok(getTopSongsJson([track1]))))
  .mockImplementationOnce(() => Promise.resolve(ok(getAlbumJson(artist, album1, []))));  // REMOVE
```

**After:**
```typescript
mockGET
  .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
  .mockImplementationOnce(() => Promise.resolve(ok(getArtistJson(artist))))
  .mockImplementationOnce(() => Promise.resolve(ok(getTopSongsJson([track1]))));
```

Add coverArt:
```typescript
const track1 = aTrack({ ..., coverArt: album1.coverArt });
```

**Test 2: "when there are many top songs" (line ~4899)**

Remove ALL three `getAlbumJson` mocks and add coverArt to all tracks:
```typescript
const track1 = aTrack({ ..., coverArt: album1.coverArt });
const track2 = aTrack({ ..., coverArt: album2.coverArt });
const track3 = aTrack({ ..., coverArt: album1.coverArt });
```

### Success Criteria:

#### Automated Verification:
- [ ] `npm test -- tests/subsonic.test.ts -t "similarSongs"` - all tests pass
- [ ] `npm test -- tests/subsonic.test.ts -t "topSongs"` - all tests pass

---

## Testing Strategy

### Running Individual Test Groups
```bash
# Phase 1: Streaming tests
npm test -- tests/subsonic.test.ts -t "streaming a track"

# Phase 2: Album tests
npm test -- tests/subsonic.test.ts -t "getting albums"

# Phase 3: Track tests
npm test -- tests/subsonic.test.ts -t "getting tracks"

# Phase 4: Rating tests
npm test -- tests/subsonic.test.ts -t "rating a track"

# Phase 5: Similar/Top songs
npm test -- tests/subsonic.test.ts -t "similarSongs"
npm test -- tests/subsonic.test.ts -t "topSongs"
```

### Final Verification
```bash
# Run full subsonic test suite
npm test -- tests/subsonic.test.ts

# TypeScript compilation check
npx tsc --noEmit

# Run ALL tests
npm test
```

## Implementation Order

**Recommended order (by complexity and impact):**

1. **Phase 1: Streaming Tests** - Simple removal of one mock line per test. 8 tests fixed.
2. **Phase 4: Rating Tests** - Simple removal + call count change. 2 tests fixed.
3. **Phase 2: Album Tests** - Removal of mock + endpoint verification. 15 tests fixed.
4. **Phase 3: Track Tests** - Removal + coverArt fix. 4 tests fixed.
5. **Phase 5: Similar/Top Songs** - Removal + coverArt fix. 4 tests fixed.

## Summary of Changes Pattern

For each failing test, the fix follows this pattern:

1. **Identify the extra mock** - Usually `getAlbumJson` or `asArtistsJson`
2. **Remove the extra mock line** from `mockGET.mockImplementationOnce(...)` chain
3. **Remove the endpoint verification** if it tests the removed call (e.g., `/rest/getAlbum`)
4. **Fix coverArt consistency** by adding `coverArt: album.coverArt` to track creation
5. **Fix call counts** if the test verifies `toHaveBeenCalledTimes()`

## References

- Original ticket: `dev/tickets/1124/1124_fix-bonob-tests_ticket.md`
- Test failures report: `dev/tickets/1124/TEST_FAILURES_REPORT.md`
- Test fixes summary: `dev/tickets/1124/TEST_FIXES_SUMMARY.md`
- Source: `src/subsonic.ts:729-749` (getTrack), `src/subsonic.ts:868-905` (stream)
- Source: `src/subsonic.ts:809-810` (albums), `src/subsonic.ts:1034-1085` (similarSongs/topSongs)
- Test file: `tests/subsonic.test.ts`
- Builders: `tests/builders.ts:175-198` (aTrack), `tests/builders.ts:200-212` (anAlbum)
