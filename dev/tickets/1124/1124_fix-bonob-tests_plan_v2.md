# Fix Bonob Tests Implementation Plan v2

## Overview

Fix the 25 failing tests in `tests/subsonic.test.ts`. The failures are caused by outdated mock sequences that don't match the current production code behavior. This revised plan provides more precise, unambiguous instructions to avoid errors during implementation.

## Current State Analysis

**Test Results (as of this plan creation):**
- Total: 137 tests
- Passing: 112 (82%)
- Failing: 25 (18%)

### Root Causes Confirmed

After analyzing the production code in `src/subsonic.ts`:

1. **`albums()` (line 809-810)**: Directly calls `getAlbumList2()` - does NOT call `getArtists()` first
2. **`track()` / `getTrack()` (line 729-754)**: Only calls `/rest/getSong` and extracts album info from song response - does NOT call `getAlbum()`
3. **`similarSongs()` (lines 1034-1059)**: Calls `/rest/getSimilarSongs2` and extracts album from song data - does NOT call `getAlbum()`
4. **`topSongs()` (lines 1060-1093)**: Calls `getArtist()` then `/rest/getTopSongs` and extracts album from song data - does NOT call `getAlbum()`
5. **`rate()` (uses `getTrack()`)**: Only needs `/rest/getSong`, not `getAlbum()`
6. **`stream()` (uses `getTrack()`)**: Only needs `/rest/getSong`, not `getAlbum()`

### CoverArt Mismatch Issue

When a test creates a track using `aTrack()` without specifying `coverArt`, the builder generates a random UUID for `coverArt` (line 194 in builders.ts). This causes mismatches when the production code extracts `coverArt` from the song response (which should match the album's coverArt).

**Solution**: When creating tracks for tests that verify the full track object, set `coverArt: album.coverArt` explicitly in the track creation.

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
- NOT changing test assertions (except removing obsolete endpoint verifications and fixing coverArt)

## Critical Sequencing Rule

**DO NOT edit `tests/subsonic.test.ts` until Phase 1 (file splitting) is complete and verified.**

The original file must remain untouched as the source of truth while extracting sections to new files. Only after:
1. All new test files are created
2. All new test files pass their tests independently
3. The total test count across all files equals the original (137 tests)

...should you proceed to Phase 2 and beyond, editing only the **new split files**, not the original.

If you choose the "Alternative: Fix In Place Without Splitting" approach, then you may edit `tests/subsonic.test.ts` directly, but be aware this is higher risk due to file size.

---

## Phase 1: Split Test File (Prerequisite for Safe Editing)

### Overview
The test file is 5064 lines, which is too large for safe editing. Split it into smaller, focused test files before making any fixes.

**IMPORTANT: Do NOT modify `tests/subsonic.test.ts` during this phase. Only READ from it to create new files. The original file serves as the source of truth until splitting is complete and verified.**

### Rationale
- Large files cause context overflow and editing errors
- Splitting by REST endpoint makes tests easier to reason about
- Each file can be fixed independently

### File Structure Analysis

The current `tests/subsonic.test.ts` has this structure:

| Line Range | Content |
|------------|---------|
| 1-70 | Imports |
| 71-233 | Standalone describe blocks (t, isValidImage, StreamClient(s), asURLSearchParams, cachingImageFetcher) |
| 235-546 | Helper functions (ok, error, JSON helpers, PING_OK, EMPTY, FAILURE, etc.) |
| 548-614 | describe("artistURN", ...) |
| 615-745 | describe("asTrack", ...) |
| 747-5064 | **describe("Subsonic", ...)** - main test block |

**Inside describe("Subsonic", ...):**

| Line Range | Content | Has Failing Tests? |
|------------|---------|-------------------|
| 747-800 | Setup (url, username, password, mockGET, beforeEach, authParams, login helper) | - |
| 801-888 | describe("generateToken", ...) | No |
| 889-965 | describe("refreshToken", ...) | No |
| 966-988 | describe("login", ...) | No |
| 989-1016 | describe("bearerToken", ...) | No |
| 1017-1100 | describe("getting genres", ...) | No |
| 1101-1643 | describe("getting an artist", ...) | No |
| 1644-1839 | describe("getting artists", ...) | No |
| **1840-2690** | **describe("getting albums", ...)** | **YES - 15 tests** |
| 2692-2734 | describe("getting an album", ...) | No |
| **2736-3121** | **describe("getting tracks", ...)** | **YES - 2 tests** |
| 3123-3449 | describe("streaming a track", ...) | No (fixed) |
| 3451-3669 | describe("fetching cover art", ...) | No |
| **3671-3913** | **describe("rate", ...)** | **YES - 2 tests** |
| 3915-3968 | describe("scrobble", ...) | No |
| 3970-4023 | describe("nowPlaying", ...) | No |
| 4025-4113 | describe("searchArtists", ...) | No |
| 4115-4225 | describe("searchAlbums", ...) | No |
| 4227-4362 | describe("searchSongs", ...) | No |
| 4364-4655 | describe("playlists", ...) | No |
| **4657-4820** | **describe("similarSongs", ...)** | **YES - 2 tests** |
| **4822-4981** | **describe("topSongs", ...)** | **YES - 2 tests** |
| 4983-5062 | describe("radioStations", ...) | No |
| 5064 | Closing `});` for describe("Subsonic", ...) | - |

### Changes Required:

#### 1.0 Create Shared Test Helpers File

**File**: `tests/subsonic.test.helpers.ts`

This file will contain all the shared helper functions so they can be imported by split test files.

**Copy these line ranges from `tests/subsonic.test.ts`:**

| Lines | Content |
|-------|---------|
| 235-238 | `const ok = ...` |
| 240-253 | `const asSimilarArtistJson = ...` |
| 255-268 | `const getArtistInfoJson = ...` |
| 270-275 | `const maybeIdFromCoverArtUrn = ...` |
| 277-299 | `const asAlbumJson = ...` |
| 301-326 | `const asSongJson = ...` |
| 328-334 | `const getAlbumListJson = ...` |
| 336-347 | `type ArtistExtras`, `const asArtistJson = ...` |
| 349-352 | `const getArtistJson = ...` |
| 354-364 | `const getRadioStationsJson = ...` |
| 366-377 | `const asGenreJson = ...`, `const getGenresJson = ...` |
| 379-382 | `const getAlbumJson = ...`, `const getSongJson = ...` |
| 389-397 | `const subsonicOK = ...` |
| 399-403 | `const getSimilarSongsJson = ...`, `const getTopSongsJson = ...` |
| 405-408 | `export type ArtistWithAlbum = ...` |
| 410-431 | Playlist JSON helpers |
| 433-471 | `const getPlayListJson = ...` |
| 473-488 | `const getSearchResult3Json = ...` |
| 490-503 | `const asArtistsJson = ...` |
| 505-532 | `const error = ...`, `const EMPTY = ...`, `const FAILURE = ...` |
| 536-546 | `const pingJson = ...`, `const PING_OK = ...` |

**Export all functions** by adding `export` keyword to each `const`.

**Required imports for this file:**
```typescript
import { option as O } from "fp-ts";
import { pipe } from "fp-ts/lib/function";
import { Album, Artist, AlbumSummary, Track, PlaylistSummary, Playlist, SimilarArtist, RadioStation } from "../src/music_service";
import { BUrn } from "../src/burn";
import { PingResponse, images } from "../src/subsonic";
```

#### 1.1 Create `tests/subsonic.albums.test.ts`

**Copy these exact line ranges:**

| Lines | Content |
|-------|---------|
| 1-70 | All imports (modify to also import from helpers file) |
| 747-800 | Subsonic describe block setup (wrap in `describe("Subsonic", () => { ... })`) |
| 1840-2690 | The entire `describe("getting albums", ...)` block |

**Structure of the new file:**
```typescript
// Lines 1-70 from original (imports)
// + import helpers from './subsonic.test.helpers'

describe("Subsonic", () => {
  // Lines 747-800 from original (setup)

  // Lines 1840-2690 from original
  describe("getting albums", () => {
    // ... entire block ...
  });
});
```

#### 1.2 Create `tests/subsonic.tracks.test.ts`

**Copy these exact line ranges:**

| Lines | Content |
|-------|---------|
| 1-70 | All imports |
| 747-800 | Subsonic describe block setup |
| 2736-3121 | The entire `describe("getting tracks", ...)` block |

#### 1.3 Create `tests/subsonic.rate.test.ts`

**Copy these exact line ranges:**

| Lines | Content |
|-------|---------|
| 1-70 | All imports |
| 747-800 | Subsonic describe block setup |
| 3671-3913 | The entire `describe("rate", ...)` block |

#### 1.4 Create `tests/subsonic.similarSongs.test.ts`

**Copy these exact line ranges:**

| Lines | Content |
|-------|---------|
| 1-70 | All imports |
| 747-800 | Subsonic describe block setup |
| 4657-4820 | The entire `describe("similarSongs", ...)` block |

#### 1.5 Create `tests/subsonic.topSongs.test.ts`

**Copy these exact line ranges:**

| Lines | Content |
|-------|---------|
| 1-70 | All imports |
| 747-800 | Subsonic describe block setup |
| 4822-4981 | The entire `describe("topSongs", ...)` block |

### Alternative: Fix In Place Without Splitting

If splitting is too complex, the fixes can be made directly in `tests/subsonic.test.ts`. In this case:

1. **Do NOT rely on line numbers after any edit** - they become stale immediately
2. **Use text search patterns** to locate each test to fix
3. **Make one fix at a time** and verify before proceeding
4. **Run TypeScript check after each edit**: `npx tsc --noEmit tests/subsonic.test.ts`

The remaining phases (2-7) document the exact text patterns to search for and modify.

### Success Criteria:

#### Automated Verification:
- [x] All new test files pass TypeScript compilation: `npx tsc --noEmit`
- [x] Each new test file runs independently: `npm test -- tests/subsonic.<name>.test.ts`
- [x] `tests/subsonic.test.ts` remains UNMODIFIED (verify with `git diff tests/subsonic.test.ts`)
- [x] Combined test count matches original: run `npm test -- tests/subsonic.test.ts` (137 tests) AND count tests in new files

#### Before Proceeding to Phase 2:
- [x] Confirm all new files are working
- [x] Confirm original file is unchanged
- [x] Only THEN proceed to edit the **new split files** (NOT the original)

---

## Phase 2: Fix Album Tests (15 failing tests)

**Target file: `tests/subsonic.albums.test.ts`** (the new split file, NOT the original)

### Overview
Remove the unnecessary `asArtistsJson` mock and `/rest/getArtistList` verification from all album tests.

### Root Cause
`albums()` now calls `getAlbumList2()` directly without first calling `getArtists()`.

### Pattern for Each Fix

**Before (incorrect - has 3 mocks):**
```typescript
mockGET
  .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
  .mockImplementationOnce(() => Promise.resolve(ok(asArtistsJson([artist]))))  // ← REMOVE THIS
  .mockImplementationOnce(() => Promise.resolve(ok(getAlbumListJson([...]))));
```

**After (correct - has 2 mocks):**
```typescript
mockGET
  .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
  .mockImplementationOnce(() => Promise.resolve(ok(getAlbumListJson([...]))));
```

**Also remove the getArtistList verification:**
```typescript
// REMOVE THIS ENTIRE BLOCK:
expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getArtistList' }).href(), {
  params: asURLSearchParams(authParamsPlusJson),
  headers,
});
```

### Failing Tests to Fix (with exact line numbers):

#### 2.1 Filtering Tests (5 tests)

| # | Test Name | beforeEach Lines | it() Lines | getArtistList expect Lines |
|---|-----------|------------------|------------|---------------------------|
| 1 | "by genre" > "should map the 64 encoded genre..." | 1853-1870 | 1872-1902 | 1887-1890 |
| 2 | "by newest" > "should pass the filter to navidrome" | 1906-1923 | 1925-1953 | 1939-1942 |
| 3 | "by recently played" > "should pass the filter to navidrome" | 1957-1974 | 1976-2004 | 1990-1993 |
| 4 | "by frequently played" > "should pass the filter to navidrome" | 2008-2020 | 2022-2046 | 2032-2035 |
| 5 | "by starred" > "should pass the filter to navidrome" | 2050-2062 | 2064-2088 | 2074-2077 |

**For each test:**
1. In the `beforeEach` block, remove the line containing `asArtistsJson([artist])`
2. In the `it()` block, remove the entire `expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getArtistList' })...)` block (4 lines)

#### 2.2 Single Artist Tests (2 tests)

| # | Test Name | beforeEach Lines | it() Lines | getArtistList expect Lines |
|---|-----------|------------------|------------|---------------------------|
| 6 | "when the artist has only 1 album" > "should return the album" | 2100-2108 | 2110-2139 | 2125-2128 |
| 7 | "when the only artist has no albums" > "should return the album" | 2150-2158 | 2161-2189 | 2175-2178 |

**Same fix pattern as 2.1**

#### 2.3 Pagination Tests - 6 albums (2 tests)

| # | Test Name | mockGET Lines (in it block) | getArtistList expect Lines |
|---|-----------|----------------------------|---------------------------|
| 8 | "querying for all of them" > "should return all..." | 2218-2225 | 2240-2243 |
| 9 | "querying for a page of them" > "should return the page..." | 2259-2276 | 2291-2294 |

**Same fix pattern as 2.1** (note: these tests have mockGET setup inside the `it()` block, not in beforeEach)

#### 2.4 Album Count Mismatch Tests (6 tests)

| # | Test Name | beforeEach Lines | it() Lines | getArtistList expect Lines |
|---|-----------|------------------|------------|---------------------------|
| 10 | "less albums" > "1 page" > "should return the page..." | 2329-2347 | 2350-2381 | 2364-2367 |
| 11 | "less albums" > "first page" > "should filter out..." | 2385-2405 | 2407-2438 | 2421-2424 |
| 12 | "less albums" > "last page only" > "should return the last..." | 2442-2460 | 2463-2494 | 2477-2480 |
| 13 | "more albums" > "1 page" > "should return the page..." | 2500-2526 | 2529-2560 | 2543-2546 |
| 14 | "more albums" > "first page" > "should filter out..." | 2564-2590 | 2593-2624 | 2607-2610 |
| 15 | "more albums" > "last page only" > "should return the last..." | 2628-2650 | 2652-2686 | 2666-2669 |

**Same fix pattern as 2.1**

### Success Criteria:

#### Automated Verification:
- [ ] `npm test -- tests/subsonic.albums.test.ts` - all tests pass (or all tests in the albums section if not split)

---

## Phase 3: Fix Single Track Tests (2 failing tests)

**Target file: `tests/subsonic.tracks.test.ts`** (the new split file, NOT the original)

### Overview
Remove the unnecessary `getAlbumJson` mock and `/rest/getAlbum` verification, plus fix coverArt consistency.

### Root Cause
`track()` calls `getTrack()` which only calls `/rest/getSong`. The album info is extracted from the song response, not a separate `getAlbum` call.

### Tests to Fix (with exact line numbers):

**File**: `tests/subsonic.tracks.test.ts` (after split) or `tests/subsonic.test.ts` lines 3010-3119

| # | Test Name | Lines | Track Creation | mockGET Setup | getAlbum expect |
|---|-----------|-------|----------------|---------------|-----------------|
| 1 | "that is starred" > "should return the track" | 3026-3070 | 3028-3036 | 3038-3045 | 3063-3069 |
| 2 | "that is not starred" > "should return the track" | 3073-3117 | 3075-3083 | 3085-3092 | 3110-3116 |

#### 3.1 Test: "that is starred" > "should return the track"

**Current code (lines 3026-3070 in original file):**
```typescript
describe("that is starred", () => {
  it("should return the track", async () => {
    const track = aTrack({
      artist: artistToArtistSummary(artist),
      album: albumToAlbumSummary(album),
      genre: pop,
      rating: {
        love: true,
        stars: 4,
      },
    });

    mockGET
      .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
      .mockImplementationOnce(() =>
        Promise.resolve(ok(getSongJson(track)))
      )
      .mockImplementationOnce(() =>                          // ← REMOVE
        Promise.resolve(ok(getAlbumJson(artist, album, []))) // ← REMOVE
      );                                                      // ← REMOVE

    // ... result code ...

    expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getAlbum' }).href(), {  // ← REMOVE
      params: asURLSearchParams({                                                                // ← REMOVE
        ...authParamsPlusJson,                                                                   // ← REMOVE
        id: album.id,                                                                            // ← REMOVE
      }),                                                                                        // ← REMOVE
      headers,                                                                                   // ← REMOVE
    });                                                                                          // ← REMOVE
  });
});
```

**Fixed code:**
```typescript
describe("that is starred", () => {
  it("should return the track", async () => {
    const track = aTrack({
      artist: artistToArtistSummary(artist),
      album: albumToAlbumSummary(album),
      genre: pop,
      coverArt: album.coverArt,  // ← ADD THIS
      rating: {
        love: true,
        stars: 4,
      },
    });

    mockGET
      .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
      .mockImplementationOnce(() =>
        Promise.resolve(ok(getSongJson(track)))
      );

    // ... result code stays the same ...

    // REMOVE the expect for /rest/getAlbum
  });
});
```

#### 3.2 Test: "that is not starred" > "should return the track"

**Same fix pattern as 3.1**

### Success Criteria:

#### Automated Verification:
- [ ] `npm test -- tests/subsonic.tracks.test.ts -t "a single track"` - all tests pass

---

## Phase 4: Fix Rating Tests (2 failing tests)

**Target file: `tests/subsonic.rate.test.ts`** (the new split file, NOT the original)

### Overview
Remove the unnecessary `getAlbumJson` mock and fix the expected call count.

### Root Cause
`rate()` calls `getTrack()` which only calls `/rest/getSong`. When the rating hasn't changed, no additional API calls are made.

### Tests to Fix (with exact line numbers):

**File**: `tests/subsonic.rate.test.ts` (after split) or `tests/subsonic.test.ts` lines 3671-3913

| # | Test Name | Lines | Track Creation | mockGET Setup | CallTimes expect |
|---|-----------|-------|----------------|---------------|------------------|
| 1 | "loving a track that is already loved" > "shouldn't do anything" | 3752-3775 | 3754-3759 | 3761-3768 | 3774 |
| 2 | "rating a track with the same rating it already has" > "shouldn't do anything" | 3812-3835 | 3814-3819 | 3821-3828 | 3834 |

#### 4.1 Test: "loving a track that is already loved" > "shouldn't do anything"

**Current code (lines 3752-3775):**
```typescript
describe("loving a track that is already loved", () => {
  it("shouldn't do anything", async () => {
    const track = aTrack({
      id: trackId,
      artist,
      album: albumToAlbumSummary(album),
      rating: { love: true, stars: 0 },
    });

    mockGET
      .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
      .mockImplementationOnce(() =>
        Promise.resolve(ok(getSongJson(track)))
      )
      .mockImplementationOnce(() =>                          // ← REMOVE
        Promise.resolve(ok(getAlbumJson(artist, album, []))) // ← REMOVE
      );                                                      // ← REMOVE

    const result = await rate(trackId, { love: true, stars: 0 });

    expect(result).toEqual(true);

    expect(mockGET).toHaveBeenCalledTimes(3);  // ← CHANGE TO 2
  });
});
```

**Fixed code:**
```typescript
describe("loving a track that is already loved", () => {
  it("shouldn't do anything", async () => {
    const track = aTrack({
      id: trackId,
      artist,
      album: albumToAlbumSummary(album),
      rating: { love: true, stars: 0 },
      coverArt: album.coverArt,  // ← ADD THIS (for consistency, though may not be needed for this test)
    });

    mockGET
      .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
      .mockImplementationOnce(() =>
        Promise.resolve(ok(getSongJson(track)))
      );

    const result = await rate(trackId, { love: true, stars: 0 });

    expect(result).toEqual(true);

    expect(mockGET).toHaveBeenCalledTimes(2);  // ← CHANGED FROM 3
  });
});
```

#### 4.2 Test: "rating a track with the same rating it already has" > "shouldn't do anything"

**Same fix pattern as 4.1** - around line 3812-3835

### Success Criteria:

#### Automated Verification:
- [ ] `npm test -- tests/subsonic.rate.test.ts -t "loving a track that is already loved"` passes
- [ ] `npm test -- tests/subsonic.rate.test.ts -t "rating a track with the same rating"` passes

---

## Phase 5: Fix Similar Songs Tests (2 failing tests)

**Target file: `tests/subsonic.similarSongs.test.ts`** (the new split file, NOT the original)

### Overview
Remove the unnecessary `getAlbumJson` mocks and fix coverArt consistency.

### Root Cause
`similarSongs()` extracts album data directly from the song response. It does NOT call `getAlbum()`.

### Tests to Fix (with exact line numbers):

**File**: `tests/subsonic.similarSongs.test.ts` (after split) or `tests/subsonic.test.ts` lines 4657-4820

| # | Test Name | Lines | Track Creations | mockGET Setup |
|---|-----------|-------|-----------------|---------------|
| 1 | "when there is one similar songs" > "should return it" | 4662-4704 | 4674-4679 (track1) | 4681-4688 |
| 2 | "when there are similar songs" > "should return them" | 4707-4774 | 4726-4743 (track1,2,3) | 4745-4758 |

#### 5.1 Test: "when there is one similar songs" > "should return it"

**Current code (lines 4662-4704):**
```typescript
describe("when there is one similar songs", () => {
  it("should return it", async () => {
    const id = "idWithTracks";
    const pop = asGenre("Pop");

    const album1 = anAlbum({ id: "album1", name: "Burnin", genre: pop });
    const artist1 = anArtist({
      id: "artist1",
      name: "Bob Marley",
      albums: [album1],
    });

    const track1 = aTrack({
      id: "track1",
      artist: artistToArtistSummary(artist1),
      album: albumToAlbumSummary(album1),
      genre: pop,
    });

    mockGET
      .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
      .mockImplementationOnce(() =>
        Promise.resolve(ok(getSimilarSongsJson([track1])))
      )
      .mockImplementationOnce(() =>                           // ← REMOVE
        Promise.resolve(ok(getAlbumJson(artist1, album1, []))) // ← REMOVE
      );                                                       // ← REMOVE

    // ...
  });
});
```

**Fixed code:**
```typescript
describe("when there is one similar songs", () => {
  it("should return it", async () => {
    const id = "idWithTracks";
    const pop = asGenre("Pop");

    const album1 = anAlbum({ id: "album1", name: "Burnin", genre: pop });
    const artist1 = anArtist({
      id: "artist1",
      name: "Bob Marley",
      albums: [album1],
    });

    const track1 = aTrack({
      id: "track1",
      artist: artistToArtistSummary(artist1),
      album: albumToAlbumSummary(album1),
      genre: pop,
      coverArt: album1.coverArt,  // ← ADD THIS
    });

    mockGET
      .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
      .mockImplementationOnce(() =>
        Promise.resolve(ok(getSimilarSongsJson([track1])))
      );

    // ...
  });
});
```

#### 5.2 Test: "when there are similar songs" > "should return them"

**Current code has 5 mocks (PING + getSimilarSongs + 3 getAlbum):**
```typescript
mockGET
  .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
  .mockImplementationOnce(() =>
    Promise.resolve(ok(getSimilarSongsJson([track1, track2, track3])))
  )
  .mockImplementationOnce(() =>                           // ← REMOVE
    Promise.resolve(ok(getAlbumJson(artist1, album1, []))) // ← REMOVE
  )                                                        // ← REMOVE
  .mockImplementationOnce(() =>                           // ← REMOVE
    Promise.resolve(ok(getAlbumJson(artist2, album2, []))) // ← REMOVE
  )                                                        // ← REMOVE
  .mockImplementationOnce(() =>                           // ← REMOVE
    Promise.resolve(ok(getAlbumJson(artist1, album1, []))) // ← REMOVE
  );                                                       // ← REMOVE
```

**Fixed code:**
```typescript
// Also add coverArt to each track:
const track1 = aTrack({
  id: "track1",
  artist: artistToArtistSummary(artist1),
  album: albumToAlbumSummary(album1),
  genre: pop,
  coverArt: album1.coverArt,  // ← ADD
});
const track2 = aTrack({
  id: "track2",
  artist: artistToArtistSummary(artist2),
  album: albumToAlbumSummary(album2),
  genre: pop,
  coverArt: album2.coverArt,  // ← ADD
});
const track3 = aTrack({
  id: "track3",
  artist: artistToArtistSummary(artist1),
  album: albumToAlbumSummary(album1),
  genre: pop,
  coverArt: album1.coverArt,  // ← ADD
});

mockGET
  .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
  .mockImplementationOnce(() =>
    Promise.resolve(ok(getSimilarSongsJson([track1, track2, track3])))
  );
```

### Success Criteria:

#### Automated Verification:
- [ ] `npm test -- tests/subsonic.similarSongs.test.ts` - all tests pass

---

## Phase 6: Fix Top Songs Tests (2 failing tests)

**Target file: `tests/subsonic.topSongs.test.ts`** (the new split file, NOT the original)

### Overview
Remove the unnecessary `getAlbumJson` mocks and fix coverArt consistency.

### Root Cause
`topSongs()` calls `getArtist()` (to get artist name) then `/rest/getTopSongs`. Album data is extracted from song response - does NOT call `getAlbum()`.

### Tests to Fix (with exact line numbers):

**File**: `tests/subsonic.topSongs.test.ts` (after split) or `tests/subsonic.test.ts` lines 4822-4981

| # | Test Name | Lines | Track Creations | mockGET Setup |
|---|-----------|-------|-----------------|---------------|
| 1 | "when there is one top song" > "should return it" | 4827-4872 | 4840-4844 (track1) | 4846-4856 |
| 2 | "when there are many top songs" > "should return them" | 4875-4939 | 4889-4905 (track1,2,3) | 4907-4923 |

#### 6.1 Test: "when there is one top song" > "should return it"

**Current code (lines 4827-4872) has 4 mocks (PING + getArtist + getTopSongs + getAlbum):**
```typescript
mockGET
  .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
  .mockImplementationOnce(() =>
    Promise.resolve(ok(getArtistJson(artist)))
  )
  .mockImplementationOnce(() =>
    Promise.resolve(ok(getTopSongsJson([track1])))
  )
  .mockImplementationOnce(() =>                           // ← REMOVE
    Promise.resolve(ok(getAlbumJson(artist, album1, []))) // ← REMOVE
  );                                                       // ← REMOVE
```

**Fixed code:**
```typescript
// Add coverArt to track:
const track1 = aTrack({
  artist: artistToArtistSummary(artist),
  album: albumToAlbumSummary(album1),
  genre: pop,
  coverArt: album1.coverArt,  // ← ADD
});

mockGET
  .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
  .mockImplementationOnce(() =>
    Promise.resolve(ok(getArtistJson(artist)))
  )
  .mockImplementationOnce(() =>
    Promise.resolve(ok(getTopSongsJson([track1])))
  );
```

#### 6.2 Test: "when there are many top songs" > "should return them"

**Current code has 6 mocks (PING + getArtist + getTopSongs + 3 getAlbum):**

**Fixed code:**
```typescript
// Add coverArt to each track:
const track1 = aTrack({
  artist: artistToArtistSummary(artist),
  album: albumToAlbumSummary(album1),
  genre: POP,
  coverArt: album1.coverArt,  // ← ADD
});
const track2 = aTrack({
  artist: artistToArtistSummary(artist),
  album: albumToAlbumSummary(album2),
  genre: POP,
  coverArt: album2.coverArt,  // ← ADD
});
const track3 = aTrack({
  artist: artistToArtistSummary(artist),
  album: albumToAlbumSummary(album1),
  genre: POP,
  coverArt: album1.coverArt,  // ← ADD
});

mockGET
  .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
  .mockImplementationOnce(() =>
    Promise.resolve(ok(getArtistJson(artist)))
  )
  .mockImplementationOnce(() =>
    Promise.resolve(ok(getTopSongsJson([track1, track2, track3])))
  );
```

### Success Criteria:

#### Automated Verification:
- [ ] `npm test -- tests/subsonic.topSongs.test.ts` - all tests pass

---

## Phase 7: Fix Rate Tests with getAlbum mocks (bonus - may already pass)

**Target file: `tests/subsonic.rate.test.ts`** (the new split file, NOT the original)

### Overview
Several rating tests that DO make changes still have `getAlbumJson` mocks. These tests may pass because of how Jest handles extra mocks, but should be cleaned up.

### Tests to Clean Up (with exact line numbers):

| # | Test Name | Lines | mockGET Setup | Line with getAlbumJson to remove |
|---|-----------|-------|---------------|----------------------------------|
| 1 | "loving a track that isnt already loved" | 3686-3716 | 3695-3703 | 3700-3702 |
| 2 | "unloving a track that is loved" | 3719-3750 | 3728-3736 | 3733-3735 |
| 3 | "rating a track with a different rating" | 3778-3809 | 3787-3795 | 3792-3794 |
| 4 | "loving and rating a track" | 3838-3877 | 3847-3856 | 3852-3854 |

For each test, remove the `.mockImplementationOnce(() => Promise.resolve(ok(getAlbumJson(artist, album, []))))` line (which spans 3 lines in the actual code).

### Success Criteria:

#### Automated Verification:
- [ ] `npm test -- tests/subsonic.rate.test.ts` - all tests pass

---

## Testing Strategy

### After Each Phase:

```bash
# Run just the specific test file
npm test -- tests/subsonic.<feature>.test.ts

# Run TypeScript check
npx tsc --noEmit
```

### Final Verification:

```bash
# Run ALL subsonic tests
npm test -- tests/subsonic.*.test.ts

# Run full test suite
npm test
```

## Implementation Notes for Agents

### Critical Rules:

1. **Never remove closing braces/parentheses without the matching opening one**
2. **Always verify bracket matching after each edit**
3. **When removing a `.mockImplementationOnce(...)` call, remove the ENTIRE chain including the `)` and any trailing `;`**
4. **Line numbers become stale after any edit - use text search patterns instead**

### Safe Edit Pattern:

When removing a mock implementation line like:
```typescript
.mockImplementationOnce(() =>
  Promise.resolve(ok(getAlbumJson(artist, album, [])))
)
```

Search for this EXACT text pattern rather than relying on line numbers. Remove all 3 lines including the closing `)`.

### Verification After Each Edit:

1. Check that the file still has valid TypeScript syntax: `npx tsc --noEmit tests/subsonic.test.ts`
2. Run the specific test to verify it passes
3. Check that surrounding tests still pass

## Summary of All Changes

| Phase | Tests Fixed | Change Type |
|-------|-------------|-------------|
| 1 | 0 | Split file for safety |
| 2 | 15 | Remove `asArtistsJson` mock + `/rest/getArtistList` verify |
| 3 | 2 | Remove `getAlbumJson` mock + `/rest/getAlbum` verify + add coverArt |
| 4 | 2 | Remove `getAlbumJson` mock + fix call count |
| 5 | 2 | Remove `getAlbumJson` mocks + add coverArt |
| 6 | 2 | Remove `getAlbumJson` mocks + add coverArt |
| 7 | 0 | Cleanup (tests may already pass) |
| **Total** | **23** | |

Note: The 25 failing tests include some that may be related to the same root causes. The plan accounts for 23 explicit fixes; the remaining 2 should be fixed by the coverArt corrections in related tests.

## References

- Original ticket: `dev/tickets/1124/1124_fix-bonob-tests_ticket.md`
- Previous plan: `dev/tickets/1124/1124_fix-bonob-tests_plan.md`
- Source: `src/subsonic.ts:809-810` (albums), `src/subsonic.ts:729-754` (getTrack)
- Source: `src/subsonic.ts:1034-1059` (similarSongs), `src/subsonic.ts:1060-1093` (topSongs)
- Test file: `tests/subsonic.test.ts` (5064 lines)
- Builders: `tests/builders.ts:175-198` (aTrack), `tests/builders.ts:200-212` (anAlbum)
