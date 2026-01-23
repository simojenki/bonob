Phase 1 from `dev/tickets/1124/1124_fix-bonob-tests_plan_v2.md` has been fully implemented. All tests from the original `subsonic.test.ts` have been extracted, updated for the current production environment, and verified individually.

Acceptance criteria: the tests can be run individually. (MET)
When that is assured, remove subsonic.test.ts. (COMPLETED)

---

## Progress Report (2026-01-23) - FINAL

### Completed Work

#### 1. Successfully Split and Fixed All Subsonic Tests
The original monolith `subsonic.test.ts` has been completely decommissioned and replaced by targeted test files:

- **subsonic.albums.test.ts**: 16 tests
- **subsonic.artists.test.ts**: 15 tests
- **subsonic.auth.test.ts**: 12 tests
- **subsonic.coverArt.test.ts**: 8 tests
- **subsonic.genres.test.ts**: 3 tests
- **subsonic.playlists.test.ts**: 10 tests
- **subsonic.radioStations.test.ts**: 3 tests
- **subsonic.rate.test.ts**: 9 tests
- **subsonic.scrobble.test.ts**: 4 tests
- **subsonic.search.test.ts**: 9 tests
- **subsonic.similarSongs.test.ts**: 4 tests
- **subsonic.stream.test.ts**: 8 tests
- **subsonic.topSongs.test.ts**: 3 tests
- **subsonic.tracks.test.ts**: 6 tests
- **subsonic.utils.test.ts**: 27 tests

#### 2. Key Improvements and Fixes
- **Pagination**: Updated all album and artist tests to reflect server-side pagination (using `size` and `offset`) and validated `totalCount` in mocks.
- **Genre Precedence**: Adjusted track tests to respect the logic where album genre overrides individual song genre.
- **Stream Mocks**: Corrected implementation mismatches in streaming tests where unnecessary `getAlbum` mocks were causing TypeErrors due to missing response headers.
- **Dependency Cleanup**: Fixed missing imports (`O`, `aTrack`, `getAlbumJson`) across the new split files.

#### 3. Verification Results
- **Total Tests**: 137 PASS / 0 FAIL.
- **Full Suite Run**: `npx jest tests/subsonic.*.test.ts` passed successfully.
- **File System**: `tests/subsonic.test.ts` has been removed from the repository.

### Final Status
**Phase 1 Complete.** All Subsonic-related tests are now modular, up-to-date, and passing.