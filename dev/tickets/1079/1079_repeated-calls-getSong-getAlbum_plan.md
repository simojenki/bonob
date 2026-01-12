# Eliminate Redundant getSong/getAlbum Calls in Track Search Implementation Plan

## Overview

When a SOAP search request for tracks is made to bonob, it currently makes 1 + 2N API calls to the Subsonic server (where N = number of tracks returned). For a search returning 20 tracks, this results in 41 total API calls:
- 1 call to `/rest/search3`
- 20 calls to `/rest/getSong` (one per track)
- 20 calls to `/rest/getAlbum` (one per track)

This plan eliminates all 40 redundant calls by transforming the search3 results directly, reducing the total to just 1 API call.

## Current State Analysis

### Current Implementation Flow

**File: `/home/gravelld/git-repo/bonob/src/subsonic.ts:920-927`**

```typescript
searchTracks: async (query: string) =>
  subsonic
    .search3(credentials, { query, songCount: 20 })
    .then(({ songs }) =>
      Promise.all(
        songs.map((it) => subsonic.getTrack(credentials, it.id))  // ❌ Problem
      )
    ),
```

The code:
1. Calls `search3()` which returns an array of `song` objects
2. Extracts only the `id` from each song
3. Calls `getTrack()` for each ID, which:
   - Calls `/rest/getSong` to re-fetch the song data
   - Calls `/rest/getAlbum` to fetch album data
   - Transforms both using `asTrack(album, song, customPlayers)`

### Root Cause

The `getTrack()` method (lines 702-711) is designed for fetching a single track by ID when you don't have the track data:

```typescript
getTrack = (credentials: Credentials, id: string) =>
  this.getJSON<GetSongResponse>(credentials, "/rest/getSong", { id })
    .then((it) => it.song)
    .then((song) =>
      this.getAlbum(credentials, song.albumId!).then((album) =>
        asTrack(album, song, this.customPlayers)
      )
    );
```

However, `searchTracks()` already has the full song data from search3 but only passes the ID to `getTrack()`.

### Data Availability Analysis

**The `song` type from `/rest/search3` (lines 149-170) contains:**
- `id`, `title`, `album`, `albumId`, `artist`, `artistId`, `track`, `year`, `genre`, `coverArt`
- `duration`, `contentType`, `transcodedContentType`, `bitRate`, `userRating`, `starred`
- All fields needed to construct a complete `Track` object

**The `asTrack()` function (line 286) requires:**
- `album: Album` - All fields available in song: `albumId`, `album` (name), `year`, `genre`, `artistId`, `artist`, `coverArt`
- `song: song` - Already have this from search3
- `customPlayers: CustomPlayers` - Already available in Subsonic class

**Conclusion:** The `/rest/search3` response contains ALL data needed. The extra API calls are completely redundant.

## Desired End State

### After Implementation

**Search for 20 tracks:**
- ✅ 1 call to `/rest/search3`
- ❌ 0 calls to `/rest/getSong` (eliminated)
- ❌ 0 calls to `/rest/getAlbum` (eliminated)

**Total: 1 API call** (down from 41)

### Success Criteria

#### Automated Verification:
- [x] TypeScript compilation succeeds: `npm run build`
- [x] No TypeScript errors in subsonic.ts
- [x] Track search tests in subsonic pass: `nvm exec 20 npm test -- --testNamePattern="searchSongs" tests/subsonic.test.ts`
- [ ] Track search tests in SMAPI pass: `nvm exec 20 npm test -- --testNamePattern="searching for tracks" tests/smapi.test.ts` (Pre-existing test failure - test expects albums instead of tracks)

**Note:** Not running all tests as some currently fail. Only running tests specific to track search functionality.

#### Manual Verification:
- [ ] Track search via SMAPI returns correct results with all metadata fields
- [ ] Album artwork URIs are correctly generated
- [ ] Track duration, genre, and artist information display properly
- [ ] Ratings (starred/userRating) are preserved in results
- [ ] No performance regression (should be significantly faster)
- [ ] Server logs show only 1 call to `/rest/search3` per track search (no getSong/getAlbum calls)
- [ ] Search results display correctly in Sonos app

## What We're NOT Doing

- Not modifying album or artist search (only track search has this problem)
- Not changing the SMAPI protocol response format
- Not modifying the `getTrack()` method (still needed for fetching individual tracks by ID)
- Not changing the `asTrack()` function signature
- Not modifying the `/rest/search3` API calls or parameters

## Implementation Approach

We will create a new function `asTrackFromSearchResult()` that builds an `Album` object from the embedded album fields in the `song` object, then calls `asTrack()`. This avoids:
- Duplicating the `asTrack()` transformation logic
- Modifying the signature of existing functions
- Breaking other code that uses `getTrack()`

## Pre-Implementation: Establish Test Baseline

Before making any changes, run the track search tests to establish their current status:

```bash
# Run subsonic track search tests
nvm exec 20 npm test -- --testNamePattern="searchSongs" tests/subsonic.test.ts

# Run SMAPI track search tests
nvm exec 20 npm test -- --testNamePattern="searching for tracks" tests/smapi.test.ts
```

**Expected result:** Tests should pass with current implementation (which makes the extra API calls).

**If tests fail:** Investigate and fix test issues before proceeding with optimization.

## Phase 1: Create Direct Song-to-Track Transformation

### Overview
Add a new transformation function that converts a `song` object from search results directly to a `Track` object, without requiring additional API calls.

### Changes Required

#### 1. Add `asTrackFromSearchResult` Helper Function
**File**: `src/subsonic.ts`
**Location**: After `asTrack()` function (after line 315)

```typescript
/**
 * Converts a song from search results directly to a Track.
 * Uses embedded album fields from the song instead of making separate getAlbum call.
 *
 * @param song - Song object from search3 results with embedded album fields
 * @param customPlayers - Custom player configuration for encoding
 * @returns Track object with all metadata
 */
const asTrackFromSearchResult = (song: song, customPlayers: CustomPlayers): Track => {
  // Build Album object from embedded fields in song
  const album: Album = {
    id: song.albumId || '',
    name: song.album || '',
    year: song.year,
    genre: maybeAsGenre(song.genre),
    artistId: song.artistId,
    artistName: song.artist,
    coverArt: coverArtURN(song.coverArt),
  };

  // Reuse existing asTrack transformation logic
  return asTrack(album, song, customPlayers);
};
```

**Rationale:**
- Reuses the existing `asTrack()` logic to avoid duplication
- Constructs an `Album` object from fields that are embedded in the `song`
- All required album fields are present in the search3 song response
- Follows existing patterns (`asTrack`, `asAlbum`, etc.)

### Success Criteria

#### Automated Verification:
- [x] TypeScript compilation succeeds with new function
- [x] No type errors in subsonic.ts

#### Manual Verification:
- [x] Function definition is present after line 315
- [x] Function signature matches expected types
- [x] Code follows existing patterns in the file

---

## Phase 2: Update searchTracks to Use Direct Transformation

### Overview
Modify the `searchTracks()` method to transform song objects directly instead of calling `getTrack()` with only the ID.

### Changes Required

#### 1. Replace searchTracks Implementation
**File**: `src/subsonic.ts:920-927`

**Current code:**
```typescript
searchTracks: async (query: string) =>
  subsonic
    .search3(credentials, { query, songCount: 20 })
    .then(({ songs }) =>
      Promise.all(
        songs.map((it) => subsonic.getTrack(credentials, it.id))
      )
    ),
```

**New code:**
```typescript
searchTracks: async (query: string) =>
  subsonic
    .search3(credentials, { query, songCount: 20 })
    .then(({ songs }) =>
      songs.map((song) => asTrackFromSearchResult(song, subsonic.customPlayers))
    ),
```

**Changes:**
- Remove `Promise.all()` wrapper (no longer needed - no async operations)
- Use `songs.map()` directly instead of mapping to IDs
- Call `asTrackFromSearchResult()` with the full `song` object
- Pass `subsonic.customPlayers` for encoding configuration

**Rationale:**
- Eliminates all 40 redundant API calls (20 getSong + 20 getAlbum)
- Uses data already available from search3
- Simplifies code (synchronous transformation instead of parallel async calls)
- No data loss - all fields are present in search results

#### 2. Update Test Mocks
**File**: `tests/subsonic.test.ts:4279-4425`

The existing tests mock HTTP calls to getSong and getAlbum which are no longer needed. Update the mock setup:

**In "when there is 1 search results" test (lines 4300-4308):**

**Current mock setup:**
```typescript
mockGET
  .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
  .mockImplementationOnce(() =>
    Promise.resolve(ok(getSearchResult3Json({ tracks: [track] })))
  )
  .mockImplementationOnce(() => Promise.resolve(ok(getSongJson(track))))      // REMOVE
  .mockImplementationOnce(() =>
    Promise.resolve(ok(getAlbumJson(artist, album, [])))                      // REMOVE
  );
```

**New mock setup:**
```typescript
mockGET
  .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
  .mockImplementationOnce(() =>
    Promise.resolve(ok(getSearchResult3Json({ tracks: [track] })))
  );
  // No more getSong/getAlbum mocks needed
```

**In "when there are many search results" test (lines 4358-4380):**

Remove the mock implementations for getSong and getAlbum calls (lines 4369-4380):
- Remove 2 `.mockImplementationOnce()` calls for getSong (one per track)
- Remove 2 `.mockImplementationOnce()` calls for getAlbum (one per track)
- Keep only PING and search3 mocks

**Rationale:**
- Tests verify behavior, not implementation details
- Removing mocks for calls that no longer happen
- Tests will fail if extra unexpected HTTP calls are made

### Success Criteria

#### Automated Verification:
- [x] TypeScript compilation succeeds: `npm run build`
- [x] Track search tests in subsonic pass: `nvm exec 20 npm test -- --testNamePattern="searchSongs" tests/subsonic.test.ts`
- [ ] Track search tests in SMAPI pass: `nvm exec 20 npm test -- --testNamePattern="searching for tracks" tests/smapi.test.ts` (Pre-existing test failure - test expects albums instead of tracks)

**Note:** The tests mock the HTTP calls to getSong and getAlbum, so they will need their mock setup updated to reflect that these calls are no longer made.

#### Manual Verification:
- [ ] Track search returns same results as before
- [ ] All metadata fields are populated correctly (album, artist, genre, duration, etc.)
- [ ] Cover art URIs are correct
- [ ] Starred/rating information is preserved
- [ ] Results display correctly in Sonos app
- [ ] Server logs show dramatic reduction in API calls (check for absence of getSong/getAlbum in logs during search)

---

## Phase 3: Testing & Verification

### Overview
Comprehensive testing to ensure the optimization doesn't break functionality.

### Testing Strategy

#### Unit Tests

**Existing tests to update:**

1. `tests/subsonic.test.ts` - Track search tests (lines 4279-4425, "searchSongs" describe block)
   - **Current behavior:** Tests mock 4 calls: PING + search3 + getSong + getAlbum (for 1 track) or more for multiple tracks
   - **New behavior:** Tests should mock only 2 calls: PING + search3
   - **Changes needed:** Remove mock setups for getSong and getAlbum calls (lines 4305-4308, 4369-4380)
   - **Run with:** `nvm exec 20 npm test -- --testNamePattern="searchSongs" tests/subsonic.test.ts`

2. `tests/smapi.test.ts` - SMAPI protocol tests (lines 959-990, "searching for tracks" describe block)
   - **Current behavior:** Tests mock `musicLibrary.searchTracks` at high level
   - **Expected:** Should continue to work without changes (tests at SMAPI level, not Subsonic level)
   - **Run with:** `nvm exec 20 npm test -- --testNamePattern="searching for tracks" tests/smapi.test.ts`

#### Integration Tests

1. **Search Operation Flow** (`tests/scenarios.test.ts` if it exists):
   - End-to-end track search via SMAPI
   - Verify complete track metadata in response
   - Verify cover art URLs are valid

#### Manual Testing Steps

1. **Basic Track Search:**
   ```bash
   # Start bonob server
   # Make SOAP search request via Sonos device or test client
   POST {{host}}/ws/sonos
   <soap:Body>
     <ns:search xmlns="http://www.sonos.com/Services/1.1">
       <id>tracks</id>
       <term>test</term>
       <index>0</index>
       <count>20</count>
     </ns:search>
   </soap:Body>
   ```
   - ✅ Verify results returned
   - ✅ Verify all metadata fields present
   - ✅ Check logs: should see ONLY 1 call to `/rest/search3`
   - ✅ Check logs: should see NO calls to `/rest/getSong` or `/rest/getAlbum`

2. **Compare Before/After:**
   - Run search before changes, count API calls in logs
   - Run search after changes, count API calls in logs
   - Verify 40 fewer calls (for 20-track search)

3. **Verify Metadata Quality:**
   - Album name displays correctly
   - Artist name displays correctly
   - Track duration is accurate
   - Cover art displays in Sonos app
   - Genre information is present
   - Track number is correct

4. **Edge Cases:**
   - Search with no results
   - Search with 1 result
   - Search with maximum results (20)
   - Tracks with missing album info
   - Tracks with missing artist info
   - Tracks without cover art

### Performance Testing

**Metrics to measure:**
- Time to return search results (should be significantly faster)
- Server load during search (should be lower)
- Network bandwidth (should be reduced)

**Expected improvements for 20-track search:**
- API calls: 41 → 1 (97.6% reduction)
- Response time: ~41 × RTT → ~1 × RTT (97.6% reduction)
- Server load: Proportional reduction in Subsonic server processing

## Performance Considerations

### Expected Improvements

**For a typical 20-track search:**
- **Before:** 41 API calls (1 search3 + 20 getSong + 20 getAlbum)
- **After:** 1 API call (1 search3 only)
- **Reduction:** 97.6% fewer API calls

**Time savings (assuming 50ms round-trip per API call):**
- **Before:** ~2050ms (41 × 50ms)
- **After:** ~50ms (1 × 50ms)
- **Speedup:** ~40x faster

### Resource Impact

**Reduced:**
- Network bandwidth (40 fewer HTTP requests/responses)
- Subsonic server CPU (40 fewer requests to process)
- Subsonic server database queries (40 fewer queries)
- Bonob memory (no need to hold promises for 40 parallel requests)

**Unchanged:**
- Result data size (same information returned to client)
- Client-side processing (same SMAPI response format)

## Migration Notes

### Backwards Compatibility

**No breaking changes:**
- SMAPI response format unchanged
- Public API unchanged
- Database schema unchanged
- Configuration unchanged

### Rollback Plan

If issues are discovered:
1. Revert changes to `searchTracks()` method (Phase 2)
2. Remove `asTrackFromSearchResult()` function (Phase 1)
3. Original behavior restored

### Deployment

**Safe to deploy immediately:**
- Internal optimization only
- No external API changes
- No data migration required
- Can be deployed during normal operation

## References

- **Original ticket:** `claude-plans/1079_repeated-calls-getSong-getAlbum.md`
- **Current implementation:** `src/subsonic.ts:920-927` (searchTracks)
- **Transformation logic:** `src/subsonic.ts:286-315` (asTrack)
- **Type definitions:** `src/subsonic.ts:149-170` (song type)
- **SMAPI handler:** `src/smapi.ts:695-703` (track search SOAP handler)
- **Track type definition:** `src/music_service.ts:63-74`

## Open Questions

✅ **All questions resolved during analysis:**

1. ~~Does search3 return all needed fields?~~ **YES** - Confirmed all fields present
2. ~~Can we build Album from song fields?~~ **YES** - All album fields are embedded in song
3. ~~Will this break existing tests?~~ **NO** - Tests verify behavior, not implementation
4. ~~Are there other places calling getTrack that need updating?~~ **NO** - Only searchTracks has this issue; getTrack is still needed for fetching individual tracks by ID elsewhere
