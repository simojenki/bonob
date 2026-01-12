# Fix HTTP 500 on Missing Album Metadata - Implementation Plan

## Overview

Bonob crashes with HTTP 500 errors when processing tracks without album metadata. The bug occurs when `getExtendedMetadata` is called for tracks with no album, causing `getAlbum()` to be called with `undefined` as the album ID. The root cause is that the code assumes all tracks have albums, using non-null assertions and creating Album objects even when no album data exists.

## Current State Analysis

### The Bug

When Sonos requests extended metadata for a track without album metadata:

1. SMAPI `getExtendedMetadata` handler calls `musicLibrary.track(trackId)` - src/smapi.ts:742
2. Delegates to `subsonic.getTrack()` - src/subsonic.ts:726-735
3. `getTrack()` calls `/rest/getSong` which returns a song with **no `albumId`**
4. **Bug:** Code calls `this.getAlbum(credentials, song.albumId!)` with non-null assertion
5. When `song.albumId` is `undefined`, this becomes `getAlbum(credentials, undefined)`
6. Causes `/rest/getAlbum` to be called with `{id: undefined}`, resulting in HTTP 500

### Type System Mismatch

**Current types:**
- `song.albumId: string | undefined` - correctly typed as optional (src/subsonic.ts:149-170)
- `Track.album: AlbumSummary` - incorrectly typed as required (src/music_service.ts:63-74)

This mismatch forces the code to use non-null assertions (`!`) or create fake Album objects with empty strings.

### All Locations Using Non-Null Assertions

1. **src/subsonic.ts:732** - `getTrack()`: `song.albumId!` passed to `getAlbum()`
2. **src/subsonic.ts:970** - `playlist()`: `entry.albumId!` in inline Album construction
3. **src/subsonic.ts:971** - `playlist()`: `entry.album!` in inline Album construction
4. **src/subsonic.ts:1029** - `similarSongs()`: `song.albumId!` passed to `getAlbum()`
5. **src/subsonic.ts:1046** - `topSongs()`: `song.albumId!` passed to `getAlbum()`

### Incorrect Default Pattern

**src/subsonic.ts:328-329** - `asTrackFromSearchResult()`:
```typescript
id: song.albumId || '',
name: song.album || '',
```

This creates an Album object with empty strings when no album exists, which is incorrect. If there's no `albumId`, we should not create an Album object at all.

## Desired End State

### Type System
- `Track.album: AlbumSummary | undefined` - tracks may not have albums
- `Track.artist: ArtistSummary | undefined` - tracks may not have artists
- If an album/artist exists, it must have a valid ID (no empty strings)

### Behavior
- Tracks without `albumId` have `track.album = undefined`
- No Album object created when no album data exists
- No HTTP 500 errors when processing tracks without albums
- No `getAlbum()` calls when `albumId` is undefined
- SMAPI responses **omit** album-related fields when album is undefined

### SMAPI Response Handling
When `track.album` is undefined, the SMAPI `<trackMetadata>` must **omit**:
- `albumId`
- `album`
- `albumArtist`
- `albumArtistId`

But **keep**:
- `albumArtURI` (if we have a cover art value from `track.coverArt`)

### Code Quality
- No non-null assertions on optional fields
- No fake objects with empty string IDs
- Consistent handling across all 5 locations

### Verification
- Tests pass that verify tracks without albums work correctly
- Playlist with entries lacking album metadata can be browsed without errors
- No regressions in existing functionality

## What We're NOT Doing

- Not filtering out tracks with missing metadata
- Not changing the Subsonic API response format
- Not creating "Unknown Album" placeholder objects
- Not using empty strings as album IDs
- Not handling other optional fields (duration, genre, etc.) - only album/artist

## Implementation Approach

**Test-Driven Development:**
1. Write failing tests first that expect `track.album = undefined` when no `albumId`
2. Update type definitions to make `Track.album` optional
3. Fix all code locations guided by TypeScript compilation errors
4. Verify all tests pass

This approach ensures:
- We know exactly what behavior we're implementing
- TypeScript compiler finds all locations that need updates
- We don't miss any edge cases
- We prevent future regressions

---

## Phase 1: Write Failing Tests

### Overview
Create tests that expect `track.album` and `track.artist` to be `undefined` when the corresponding IDs don't exist in the source data. These tests will fail initially because the current type system doesn't allow undefined albums.

### Changes Required

#### 1. Test getTrack with Missing Album
**File**: `tests/subsonic.test.ts`
**Location**: After existing getTrack tests (search for "describe.*getTrack")
**Changes**: Add new test case

```typescript
describe("getTrack with missing album metadata", () => {
  it("should return track with undefined album when albumId is missing", async () => {
    // Mock getSong response without albumId
    const songWithoutAlbum = {
      id: "123",
      title: "Track Without Album",
      duration: 200,
      contentType: "audio/mpeg",
      suffix: "mp3",
      // No albumId, album, artist, or artistId
    };

    axiosMock.onGet(/\/rest\/getSong/).reply(200, {
      'subsonic-response': {
        status: 'ok',
        version: '1.16.0',
        song: songWithoutAlbum
      }
    });

    const credentials = { token: "test-token", salt: "test-salt" };
    const subsonic = new Subsonic(/* ... */);
    const track = await subsonic.getTrack(credentials, "123");

    // Assertions
    expect(track.id).toBe("123");
    expect(track.name).toBe("Track Without Album");
    expect(track.album).toBeUndefined(); // Key assertion
    expect(track.artist).toBeUndefined(); // Also check artist

    // Verify getAlbum was NOT called
    const albumCalls = axiosMock.history.get.filter(r => r.url?.includes('/rest/getAlbum'));
    expect(albumCalls.length).toBe(0);
  });
});
```

#### 2. Test Playlist with Missing Album Metadata
**File**: `tests/subsonic.test.ts`
**Location**: After existing playlist tests (search for "describe.*playlist")
**Changes**: Add new test case

```typescript
describe("playlist with entries missing album metadata", () => {
  it("should handle playlist entries without albumId or album", async () => {
    const playlistWithIncompleteMetadata = {
      id: "1",
      name: "Arun O'Connor's new tunes",
      songCount: "2",
      entry: [
        {
          id: "3",
          title: "Do They",
          duration: 232,
          contentType: "audio/mpeg",
          suffix: "mp3",
          path: "A.I Imagined Unreleased Songs/Do They.mp3",
          // No albumId, album, artist, or artistId - matches bug report data
        },
        {
          id: "4",
          title: "Looking Back",
          duration: 219,
          contentType: "audio/mpeg",
          suffix: "mp3",
          path: "A.I Imagined Unreleased Songs/Looking Back.mp3",
          albumId: "789",
          album: "Test Album",
          artist: "Test Artist",
          artistId: "456",
          // This entry HAS album data for comparison
        }
      ]
    };

    axiosMock.onGet(/\/rest\/getPlaylist/).reply(200, {
      'subsonic-response': {
        status: 'ok',
        version: '1.16.0',
        playlist: playlistWithIncompleteMetadata
      }
    });

    const credentials = { token: "test-token", salt: "test-salt" };
    const subsonic = new Subsonic(/* ... */);
    const musicLibrary = subsonic.createMusicLibrary(credentials);
    const playlist = await musicLibrary.playlist("1");

    // Assertions
    expect(playlist.entries).toHaveLength(2);

    // First entry: no album metadata
    expect(playlist.entries[0].id).toBe("3");
    expect(playlist.entries[0].album).toBeUndefined();
    expect(playlist.entries[0].artist).toBeUndefined();

    // Second entry: has album metadata
    expect(playlist.entries[1].id).toBe("4");
    expect(playlist.entries[1].album).toBeDefined();
    expect(playlist.entries[1].album?.id).toBe("789");
    expect(playlist.entries[1].album?.name).toBe("Test Album");
    expect(playlist.entries[1].artist).toBeDefined();
    expect(playlist.entries[1].artist?.name).toBe("Test Artist");
  });
});
```

#### 3. Test similarSongs with Missing Albums
**File**: `tests/subsonic.test.ts`
**Location**: After existing similarSongs tests
**Changes**: Add new test case

```typescript
describe("similarSongs with missing album metadata", () => {
  it("should handle songs without albumId", async () => {
    const songsWithoutAlbums = [
      {
        id: "101",
        title: "Similar Song 1",
        duration: 180,
        contentType: "audio/mpeg",
        // No albumId
      },
      {
        id: "102",
        title: "Similar Song 2",
        duration: 190,
        contentType: "audio/mpeg",
        albumId: "999",
        album: "Some Album",
        // This one has album
      }
    ];

    axiosMock.onGet(/\/rest\/getSimilarSongs2/).reply(200, {
      'subsonic-response': {
        status: 'ok',
        version: '1.16.0',
        similarSongs2: {
          song: songsWithoutAlbums
        }
      }
    });

    const credentials = { token: "test-token", salt: "test-salt" };
    const subsonic = new Subsonic(/* ... */);
    const musicLibrary = subsonic.createMusicLibrary(credentials);
    const tracks = await musicLibrary.similarSongs("123");

    expect(tracks).toHaveLength(2);
    expect(tracks[0].album).toBeUndefined();
    expect(tracks[1].album).toBeDefined();
    expect(tracks[1].album?.id).toBe("999");

    // Verify getAlbum was NOT called
    const albumCalls = axiosMock.history.get.filter(r => r.url?.includes('/rest/getAlbum'));
    expect(albumCalls.length).toBe(0);
  });
});
```

#### 4. Test topSongs with Missing Albums
**File**: `tests/subsonic.test.ts`
**Location**: After existing topSongs tests
**Changes**: Add new test case

```typescript
describe("topSongs with missing album metadata", () => {
  it("should handle songs without albumId", async () => {
    const artistData = {
      id: "artist-1",
      name: "Test Artist"
    };

    const topSongsWithoutAlbums = [
      {
        id: "201",
        title: "Top Song 1",
        duration: 200,
        contentType: "audio/mpeg",
        // No albumId
      }
    ];

    axiosMock.onGet(/\/rest\/getArtist/).reply(200, {
      'subsonic-response': {
        status: 'ok',
        version: '1.16.0',
        artist: artistData
      }
    });

    axiosMock.onGet(/\/rest\/getTopSongs/).reply(200, {
      'subsonic-response': {
        status: 'ok',
        version: '1.16.0',
        topSongs: {
          song: topSongsWithoutAlbums
        }
      }
    });

    const credentials = { token: "test-token", salt: "test-salt" };
    const subsonic = new Subsonic(/* ... */);
    const musicLibrary = subsonic.createMusicLibrary(credentials);
    const tracks = await musicLibrary.topSongs("artist-1");

    expect(tracks).toHaveLength(1);
    expect(tracks[0].album).toBeUndefined();

    // Verify getAlbum was NOT called
    const albumCalls = axiosMock.history.get.filter(r => r.url?.includes('/rest/getAlbum'));
    expect(albumCalls.length).toBe(0);
  });
});
```

#### 5. Test Search Results with Missing Albums
**File**: `tests/subsonic.test.ts`
**Location**: After existing search tests
**Changes**: Add new test case

```typescript
describe("searchTracks with missing album metadata", () => {
  it("should handle search results without albumId", async () => {
    const searchResults = {
      artist: [],
      album: [],
      song: [
        {
          id: "301",
          title: "Search Result 1",
          duration: 150,
          contentType: "audio/mpeg",
          // No albumId or album
        },
        {
          id: "302",
          title: "Search Result 2",
          duration: 160,
          contentType: "audio/mpeg",
          albumId: "album-1",
          album: "Search Album",
          // Has album
        }
      ]
    };

    axiosMock.onGet(/\/rest\/search3/).reply(200, {
      'subsonic-response': {
        status: 'ok',
        version: '1.16.0',
        searchResult3: searchResults
      }
    });

    const credentials = { token: "test-token", salt: "test-salt" };
    const subsonic = new Subsonic(/* ... */);
    const musicLibrary = subsonic.createMusicLibrary(credentials);
    const tracks = await musicLibrary.searchTracks("test query");

    expect(tracks).toHaveLength(2);
    expect(tracks[0].album).toBeUndefined();
    expect(tracks[1].album).toBeDefined();
    expect(tracks[1].album?.id).toBe("album-1");
  });
});
```

#### 6. Test SMAPI Track Conversion with Undefined Album
**File**: `tests/smapi.test.ts`
**Location**: After existing track metadata tests
**Changes**: Add new test case

```typescript
describe("track conversion with undefined album/artist", () => {
  it("should omit album fields when album is undefined", () => {
    const trackWithoutAlbum: Track = {
      id: "123",
      name: "Test Track",
      duration: 200,
      number: undefined,
      genre: undefined,
      coverArt: undefined,
      album: undefined, // No album
      artist: undefined, // No artist
      encoding: {
        player: "Sonos",
        mimeType: "audio/mpeg"
      },
      rating: {
        love: false,
        stars: 0
      }
    };

    const bonobUrl = new URLBuilder("http://localhost:4534");
    const smapiTrack = track(bonobUrl, trackWithoutAlbum);

    // Should NOT have album-related attributes
    expect(smapiTrack.trackMetadata.album).toBeUndefined();
    expect(smapiTrack.trackMetadata.albumId).toBeUndefined();
    expect(smapiTrack.trackMetadata.albumArtist).toBeUndefined();
    expect(smapiTrack.trackMetadata.albumArtistId).toBeUndefined();

    // Should still have basic track info
    expect(smapiTrack.id).toBe("track:123");
    expect(smapiTrack.title).toBe("Test Track");

    // albumArtURI should be present if we have coverArt value
    expect(smapiTrack.trackMetadata.albumArtURI).toBeDefined();
  });

  it("should include album fields when album exists", () => {
    const trackWithAlbum: Track = {
      id: "123",
      name: "Test Track",
      duration: 200,
      number: 1,
      genre: { id: "rock", name: "Rock" },
      coverArt: undefined,
      album: {
        id: "album-1",
        name: "Test Album",
        year: "2020",
        genre: { id: "rock", name: "Rock" },
        artistId: "artist-1",
        artistName: "Test Artist",
        coverArt: undefined
      },
      artist: {
        id: "artist-1",
        name: "Test Artist",
        image: undefined
      },
      encoding: {
        player: "Sonos",
        mimeType: "audio/mpeg"
      },
      rating: {
        love: false,
        stars: 0
      }
    };

    const bonobUrl = new URLBuilder("http://localhost:4534");
    const smapiTrack = track(bonobUrl, trackWithAlbum);

    // Should have album-related attributes
    expect(smapiTrack.trackMetadata.album).toBe("Test Album");
    expect(smapiTrack.trackMetadata.albumId).toBe("album:album-1");
    expect(smapiTrack.trackMetadata.artist).toBe("Test Artist");
    expect(smapiTrack.trackMetadata.artistId).toBe("artist:artist-1");
  });
});
```

### Success Criteria

#### Automated Verification
- [ ] All new tests compile (may need `// @ts-expect-error` comments initially)
- [ ] All new tests FAIL with current implementation
- [ ] Test execution: `source ~/.nvm/nvm.sh && nvm exec 20 npm test -- tests/subsonic.test.ts -t "missing"`
- [ ] Test execution: `source ~/.nvm/nvm.sh && nvm exec 20 npm test -- tests/smapi.test.ts -t "undefined"`

#### Manual Verification
- [ ] Review test failures to confirm they fail for the right reasons (type errors or wrong behavior)
- [ ] Verify tests cover all 5 problematic code locations
- [ ] Check that tests verify getAlbum is NOT called when albumId is missing

---

## Phase 2: Update Type Definitions

### Overview
Make `album` and `artist` optional on the Track type. This will cause TypeScript compilation errors at all locations that assume these fields exist, guiding us to fix them.

### Changes Required

#### 1. Update Track Type
**File**: `src/music_service.ts:63-74`
**Changes**: Make album and artist optional

**Current code:**
```typescript
export type Track = {
  id: string;
  name: string;
  encoding: Encoding,
  duration: number;
  number: number | undefined;
  genre: Genre | undefined;
  coverArt: BUrn | undefined;
  album: AlbumSummary;      // Currently required
  artist: ArtistSummary;    // Currently required
  rating: Rating;
};
```

**New code:**
```typescript
export type Track = {
  id: string;
  name: string;
  encoding: Encoding,
  duration: number;
  number: number | undefined;
  genre: Genre | undefined;
  coverArt: BUrn | undefined;
  album: AlbumSummary | undefined;    // Now optional
  artist: ArtistSummary | undefined;  // Now optional
  rating: Rating;
};
```

#### 2. Update ArtistSummary Type
**File**: `src/music_service.ts:18-22`
**Changes**: Make id required (if artist exists, it must have an ID)

**Current code:**
```typescript
export type ArtistSummary = {
  id: string | undefined;    // Currently optional
  name: string;
  image: BUrn | undefined;
};
```

**New code:**
```typescript
export type ArtistSummary = {
  id: string;                // Now required - if artist exists, it must have an ID
  name: string;
  image: BUrn | undefined;
};
```

**Reasoning**: If an artist object exists, it must have a valid ID. If there's no ID, don't create an artist object - use `undefined` instead.

### Success Criteria

#### Automated Verification
- [x] TypeScript compilation FAILS with errors: `source ~/.nvm/nvm.sh && nvm exec 20 npx tsc --noEmit`
- [x] Count compilation errors (expect 20-50 errors)
- [x] Errors should be at expected locations (subsonic.ts, smapi.ts, test files)

#### Manual Verification
- [x] Review all TypeScript errors
- [x] Create list of files and line numbers that need fixes
- [x] Verify errors are about accessing potentially undefined album/artist
- [x] No unexpected errors in unrelated code

---

## Phase 3: Update asTrack Function

### Overview
Modify `asTrack()` to accept optional Album and create optional Artist, only when IDs exist.

### Changes Required

#### 1. Update asTrack Signature and Implementation
**File**: `src/subsonic.ts:286-315`
**Changes**: Accept optional album, create optional artist

**Current code:**
```typescript
export const asTrack = (album: Album, song: song, customPlayers: CustomPlayers): Track => ({
  id: song.id,
  name: song.title,
  encoding: pipe(
    customPlayers.encodingFor({ mimeType: song.contentType }),
    O.getOrElse(() => ({
      player: DEFAULT_CLIENT_APPLICATION,
      mimeType: song.transcodedContentType ? song.transcodedContentType : song.contentType
    }))
  ),
  duration: song.duration || 0,
  number: song.track || 0,
  genre: maybeAsGenre(song.genre),
  coverArt: coverArtURN(song.coverArt),
  album,
  artist: {
    id: song.artistId,
    name: song.artist ? song.artist : "?",
    image: song.artistId
      ? artistImageURN({ artistId: song.artistId })
      : undefined,
  },
  rating: {
    love: song.starred != undefined,
    stars:
      song.userRating && song.userRating <= 5 && song.userRating >= 0
        ? song.userRating
        : 0,
  },
});
```

**New code:**
```typescript
export const asTrack = (album: Album | undefined, song: song, customPlayers: CustomPlayers): Track => {
  // Only create artist if artistId exists
  const artist: ArtistSummary | undefined = song.artistId
    ? {
        id: song.artistId,
        name: song.artist || "?",
        image: artistImageURN({ artistId: song.artistId }),
      }
    : undefined;

  return {
    id: song.id,
    name: song.title,
    encoding: pipe(
      customPlayers.encodingFor({ mimeType: song.contentType }),
      O.getOrElse(() => ({
        player: DEFAULT_CLIENT_APPLICATION,
        mimeType: song.transcodedContentType || song.contentType
      }))
    ),
    duration: song.duration || 0,
    number: song.track || 0,
    genre: album?.genre || maybeAsGenre(song.genre), // Use album genre if available, else song genre
    coverArt: coverArtURN(song.coverArt),
    album,      // Can be undefined
    artist,     // Can be undefined
    rating: {
      love: song.starred !== undefined,
      stars:
        song.userRating && song.userRating <= 5 && song.userRating >= 0
          ? song.userRating
          : 0,
    },
  };
};
```

**Key changes:**
- Accept `Album | undefined` parameter
- Create `artist` only when `song.artistId` exists
- Use optional chaining for `album?.genre`
- Return Track with potentially undefined album and artist

### Success Criteria

#### Automated Verification
- [ ] TypeScript compilation errors reduced (fixed this one location)
- [ ] asTrack function compiles successfully
- [ ] Function signature allows undefined album

#### Manual Verification
- [ ] Artist only created when artistId exists
- [ ] Optional chaining used correctly for album fields
- [ ] No non-null assertions remain

---

## Phase 4: Fix getTrack Method

### Overview
Update `getTrack()` to conditionally create Album only when `albumId` exists, avoiding the `getAlbum()` call entirely.

### Changes Required

#### 1. Update getTrack Implementation
**File**: `src/subsonic.ts:726-735`
**Changes**: Build Album from song data or use undefined

**Current code:**
```typescript
getTrack = (credentials: Credentials, id: string) =>
  this.getJSON<GetSongResponse>(credentials, "/rest/getSong", {
    id,
  })
    .then((it) => it.song)
    .then((song) =>
      this.getAlbum(credentials, song.albumId!).then((album) =>
        asTrack(album, song, this.customPlayers)
      )
    );
```

**New code:**
```typescript
getTrack = (credentials: Credentials, id: string) =>
  this.getJSON<GetSongResponse>(credentials, "/rest/getSong", {
    id,
  })
    .then((it) => it.song)
    .then((song) => {
      // Only create album if albumId exists
      const album: Album | undefined = song.albumId
        ? {
            id: song.albumId,
            name: song.album || '',
            year: song.year,
            genre: maybeAsGenre(song.genre),
            artistId: song.artistId,
            artistName: song.artist,
            coverArt: coverArtURN(song.coverArt),
          }
        : undefined;

      return asTrack(album, song, this.customPlayers);
    });
```

**Key changes:**
- No `getAlbum()` call - use embedded song data
- Only create Album object when `song.albumId` exists
- No non-null assertions
- More efficient (1 API call instead of 2)

### Success Criteria

#### Automated Verification
- [ ] TypeScript compilation succeeds for this section
- [ ] getTrack test passes: `source ~/.nvm/nvm.sh && nvm exec 20 npm test -- tests/subsonic.test.ts -t "getTrack"`

#### Manual Verification
- [ ] No non-null assertions remain
- [ ] getAlbum is no longer called
- [ ] Album only created when albumId exists

---

## Phase 5: Fix playlist Method

### Overview
Update `playlist()` to conditionally create Album only when `albumId` exists.

### Changes Required

#### 1. Update Playlist Entry Processing
**File**: `src/subsonic.ts:967-982`
**Changes**: Conditional Album creation

**Current code:**
```typescript
entries: (playlist.entry || []).map((entry) => ({
  ...asTrack(
    {
      id: entry.albumId!,
      name: entry.album!,
      year: entry.year,
      genre: maybeAsGenre(entry.genre),
      artistName: entry.artist,
      artistId: entry.artistId,
      coverArt: coverArtURN(entry.coverArt),
    },
    entry,
    this.customPlayers
  ),
  number: trackNumber++,
})),
```

**New code:**
```typescript
entries: (playlist.entry || []).map((entry) => {
  // Only create album if albumId exists
  const album: Album | undefined = entry.albumId
    ? {
        id: entry.albumId,
        name: entry.album || '',
        year: entry.year,
        genre: maybeAsGenre(entry.genre),
        artistId: entry.artistId,
        artistName: entry.artist,
        coverArt: coverArtURN(entry.coverArt),
      }
    : undefined;

  return {
    ...asTrack(album, entry, this.customPlayers),
    number: trackNumber++,
  };
}),
```

**Key changes:**
- No non-null assertions on `entry.albumId!` or `entry.album!`
- Only create Album when `entry.albumId` exists
- Pattern matches `getTrack` implementation

### Success Criteria

#### Automated Verification
- [ ] TypeScript compilation succeeds
- [ ] Playlist tests pass: `source ~/.nvm/nvm.sh && nvm exec 20 npm test -- tests/subsonic.test.ts -t "playlist"`

#### Manual Verification
- [ ] No non-null assertions remain
- [ ] Album only created when albumId exists
- [ ] Code is consistent with getTrack pattern

---

## Phase 6: Fix similarSongs Method

### Overview
Update `similarSongs()` to use embedded song data instead of calling `getAlbum()`.

### Changes Required

#### 1. Update similarSongs Implementation
**File**: `src/subsonic.ts:1017-1033`
**Changes**: Use embedded data instead of getAlbum calls

**Current code:**
```typescript
similarSongs: async (id: string) =>
  subsonic
    .getJSON<GetSimilarSongsResponse>(
      credentials,
      "/rest/getSimilarSongs2",
      { id, count: 50 }
    )
    .then((it) => it.similarSongs2.song || [])
    .then((songs) =>
      Promise.all(
        songs.map((song) =>
          subsonic
            .getAlbum(credentials, song.albumId!)
            .then((album) => asTrack(album, song, this.customPlayers))
        )
      )
    ),
```

**New code:**
```typescript
similarSongs: async (id: string) =>
  subsonic
    .getJSON<GetSimilarSongsResponse>(
      credentials,
      "/rest/getSimilarSongs2",
      { id, count: 50 }
    )
    .then((it) => it.similarSongs2.song || [])
    .then((songs) =>
      songs.map((song) => {
        // Only create album if albumId exists
        const album: Album | undefined = song.albumId
          ? {
              id: song.albumId,
              name: song.album || '',
              year: song.year,
              genre: maybeAsGenre(song.genre),
              artistId: song.artistId,
              artistName: song.artist,
              coverArt: coverArtURN(song.coverArt),
            }
          : undefined;

        return asTrack(album, song, this.customPlayers);
      })
    ),
```

**Key changes:**
- No `getAlbum()` calls (saves up to 50 API calls!)
- No `Promise.all()` needed (synchronous now)
- No non-null assertions
- Significant performance improvement

### Success Criteria

#### Automated Verification
- [ ] TypeScript compilation succeeds
- [ ] similarSongs tests pass: `source ~/.nvm/nvm.sh && nvm exec 20 npm test -- tests/subsonic.test.ts -t "similarSongs"`

#### Manual Verification
- [ ] No non-null assertions
- [ ] getAlbum not called
- [ ] Promise.all removed
- [ ] Album only created when albumId exists

---

## Phase 7: Fix topSongs Method

### Overview
Update `topSongs()` to use embedded song data instead of calling `getAlbum()`.

### Changes Required

#### 1. Update topSongs Implementation
**File**: `src/subsonic.ts:1034-1051`
**Changes**: Use embedded data instead of getAlbum calls

**Current code:**
```typescript
topSongs: async (artistId: string) =>
  subsonic.getArtist(credentials, artistId).then(({ name }) =>
    subsonic
      .getJSON<GetTopSongsResponse>(credentials, "/rest/getTopSongs", {
        artist: name,
        count: 50,
      })
      .then((it) => it.topSongs.song || [])
      .then((songs) =>
        Promise.all(
          songs.map((song) =>
            subsonic
              .getAlbum(credentials, song.albumId!)
              .then((album) => asTrack(album, song, this.customPlayers))
          )
        )
      )
  ),
```

**New code:**
```typescript
topSongs: async (artistId: string) =>
  subsonic.getArtist(credentials, artistId).then(({ name }) =>
    subsonic
      .getJSON<GetTopSongsResponse>(credentials, "/rest/getTopSongs", {
        artist: name,
        count: 50,
      })
      .then((it) => it.topSongs.song || [])
      .then((songs) =>
        songs.map((song) => {
          // Only create album if albumId exists
          const album: Album | undefined = song.albumId
            ? {
                id: song.albumId,
                name: song.album || '',
                year: song.year,
                genre: maybeAsGenre(song.genre),
                artistId: song.artistId,
                artistName: song.artist,
                coverArt: coverArtURN(song.coverArt),
              }
            : undefined;

          return asTrack(album, song, this.customPlayers);
        })
      )
  ),
```

**Key changes:**
- No `getAlbum()` calls (saves up to 50 API calls!)
- No `Promise.all()` needed (synchronous now)
- No non-null assertions
- Significant performance improvement

### Success Criteria

#### Automated Verification
- [ ] TypeScript compilation succeeds
- [ ] topSongs tests pass: `source ~/.nvm/nvm.sh && nvm exec 20 npm test -- tests/subsonic.test.ts -t "topSongs"`

#### Manual Verification
- [ ] No non-null assertions
- [ ] getAlbum not called
- [ ] Promise.all removed
- [ ] Album only created when albumId exists

---

## Phase 8: Fix asTrackFromSearchResult

### Overview
Update `asTrackFromSearchResult()` to return undefined album when no `albumId`, instead of creating Album with empty string.

### Changes Required

#### 1. Update asTrackFromSearchResult
**File**: `src/subsonic.ts:325-339`
**Changes**: Conditional Album creation

**Current code:**
```typescript
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

**New code:**
```typescript
const asTrackFromSearchResult = (song: song, customPlayers: CustomPlayers): Track => {
  // Only create album if albumId exists
  const album: Album | undefined = song.albumId
    ? {
        id: song.albumId,
        name: song.album || '',
        year: song.year,
        genre: maybeAsGenre(song.genre),
        artistId: song.artistId,
        artistName: song.artist,
        coverArt: coverArtURN(song.coverArt),
      }
    : undefined;

  return asTrack(album, song, customPlayers);
};
```

**Key changes:**
- No fake Album with empty string ID
- Only create Album when `albumId` exists
- Consistent with all other locations

### Success Criteria

#### Automated Verification
- [ ] TypeScript compilation succeeds
- [ ] Search tests pass: `source ~/.nvm/nvm.sh && nvm exec 20 npm test -- tests/subsonic.test.ts -t "search"`

#### Manual Verification
- [ ] Album only created when albumId exists
- [ ] No empty string defaults for album ID

---

## Phase 9: Fix SMAPI Layer

### Overview
Update SMAPI conversion functions to handle undefined albums/artists, **omitting** album-related fields when album is undefined.

### Changes Required

#### 1. Update track Function
**File**: `src/smapi.ts:350-372`
**Changes**: Conditionally include album fields, use optional chaining

**Current code:**
```typescript
export const track = (bonobUrl: URLBuilder, track: Track) => ({
  itemType: "track",
  id: `track:${track.id}`,
  mimeType: sonosifyMimeType(track.encoding.mimeType),
  title: track.name,

  trackMetadata: {
    album: track.album.name,
    albumId: track.album.id ? `album:${track.album.id}` : undefined,
    albumArtist: track.artist.name,
    albumArtistId: track.artist.id ? `artist:${track.artist.id}` : undefined,
    albumArtURI: coverArtURI(bonobUrl, track).href(),
    artist: track.artist.name,
    artistId: track.artist.id ? `artist:${track.artist.id}` : undefined,
    duration: track.duration,
    genre: track.album.genre?.name,
    genreId: track.album.genre?.id,
    trackNumber: track.number,
  },
  // ...
});
```

**New code:**
```typescript
export const track = (bonobUrl: URLBuilder, track: Track) => ({
  itemType: "track",
  id: `track:${track.id}`,
  mimeType: sonosifyMimeType(track.encoding.mimeType),
  title: track.name,

  trackMetadata: {
    // Only include album fields if album exists
    ...(track.album && {
      album: track.album.name,
      albumId: `album:${track.album.id}`,
      albumArtist: track.artist?.name,
      albumArtistId: track.artist?.id ? `artist:${track.artist.id}` : undefined,
    }),
    // Always include albumArtURI if available
    albumArtURI: coverArtURI(bonobUrl, track).href(),
    // Artist fields (independent of album)
    artist: track.artist?.name,
    artistId: track.artist?.id ? `artist:${track.artist.id}` : undefined,
    duration: track.duration,
    genre: track.album?.genre?.name,
    genreId: track.album?.genre?.id,
    trackNumber: track.number,
  },
  // ...
});
```

**Key changes:**
- Use spread operator with conditional `...(track.album && {...})` to **omit** fields when album is undefined
- When `track.album` is undefined, these fields are NOT included:
  - `album`
  - `albumId`
  - `albumArtist`
  - `albumArtistId`
- `albumArtURI` is always included (uses coverArt from track)
- Use optional chaining for artist fields
- Use optional chaining for genre fields

#### 2. Check coverArtURI Function
**File**: `src/smapi.ts` (search for coverArtURI function)
**Action**: Verify it handles undefined album/artist gracefully

Read the function and check if it accesses `track.album` or `track.artist` without optional chaining. If so, update it.

#### 3. Search for Other Track Usage in SMAPI
**File**: `src/smapi.ts`
**Action**: Find all places that access track properties

Use grep: `grep -n "track\\.album" src/smapi.ts` and `grep -n "track\\.artist" src/smapi.ts`

Update any locations that don't use optional chaining.

### Success Criteria

#### Automated Verification
- [ ] TypeScript compilation succeeds
- [ ] SMAPI tests pass: `source ~/.nvm/nvm.sh && nvm exec 20 npm test -- tests/smapi.test.ts`

#### Manual Verification
- [ ] Album fields omitted when album is undefined (not set to undefined)
- [ ] albumArtURI always present
- [ ] Optional chaining used everywhere
- [ ] SMAPI XML responses don't include omitted fields

---

## Phase 10: Fix Test Helpers and Builders

### Overview
Update test helper functions to handle optional albums/artists.

### Changes Required

#### 1. Update getPlaylistJson Helper
**File**: `tests/subsonic.test.ts` (search for getPlaylistJson)
**Changes**: Use optional chaining

Find patterns like:
```typescript
album: it.album.name,
artist: it.artist.name,
albumId: it.album.id,
artistId: it.artist.id,
```

Replace with:
```typescript
album: it.album?.name,
artist: it.artist?.name,
albumId: it.album?.id,
artistId: it.artist?.id,
```

#### 2. Search for All Track Property Access in Tests
**Files**: `tests/subsonic.test.ts`, `tests/smapi.test.ts`
**Action**: Search for patterns and update

Search patterns:
- `.album.id`
- `.album.name`
- `.artist.id`
- `.artist.name`
- `track.album`
- `track.artist`

Update to use optional chaining where appropriate:
- `.album?.id`
- `.album?.name`
- `.artist?.id`
- `.artist?.name`

#### 3. Update Test Builders
**File**: `tests/builders.ts` (if it exists)
**Action**: Update track builders to allow undefined album/artist

Ensure test builders can create tracks with undefined albums/artists for testing.

### Success Criteria

#### Automated Verification
- [ ] TypeScript compilation succeeds for all test files
- [ ] All tests compile without type errors

#### Manual Verification
- [ ] Grep confirms no remaining non-optional access: `grep -n "\\.album\\.[a-z]" tests/`
- [ ] Grep confirms no remaining non-optional access: `grep -n "\\.artist\\.[a-z]" tests/`

---

## Phase 11: Run All Tests and Verify

### Overview
Run the complete test suite to ensure all tests pass and no regressions.

### Success Criteria

#### Automated Verification
- [ ] Full test suite passes: `source ~/.nvm/nvm.sh && nvm exec 20 npm test`
- [ ] No TypeScript compilation errors: `source ~/.nvm/nvm.sh && nvm exec 20 npx tsc --noEmit`
- [ ] All new tests from Phase 1 now pass
- [ ] No regressions in existing tests
- [ ] Linting passes (if applicable): `source ~/.nvm/nvm.sh && nvm exec 20 npm run lint`

#### Manual Verification
- [ ] Review test output for warnings
- [ ] Verify all 6 new test cases pass
- [ ] Confirm test coverage is adequate
- [ ] Check that no tests were skipped or disabled

---

## Testing Strategy

### Unit Tests (Written in Phase 1)

1. **getTrack without album** - verifies track.album is undefined, getAlbum not called
2. **Playlist with mixed entries** - some with albums, some without
3. **similarSongs without albums** - handles missing album metadata
4. **topSongs without albums** - handles missing album metadata
5. **Search results without albums** - handles missing album metadata
6. **SMAPI conversion** - omits album/artist attributes when undefined

### Integration Tests (Existing)
- End-to-end SMAPI flows should continue to work
- Tracks with albums should work as before (backward compatibility)
- SMAPI responses should be valid

### Manual Testing Steps

1. **Setup:**
   - Start bonob server: `npm start`
   - Configure with Astiga account
   - Identify test playlist with incomplete metadata (playlist ID 38886 from bug report)

2. **Test Playlist Browsing:**
   - Open Sonos app
   - Navigate to Astiga service → Playlists
   - Select playlist "Arun O'Connor's new tunes"
   - Verify: Loads without errors, tracks visible

3. **Test Track Playback:**
   - Click on track "Do They" (track without album)
   - Verify: Plays successfully, no errors

4. **Check Logs:**
   - Review bonob debug logs
   - Verify: No `/rest/getAlbum` calls with undefined ID
   - Verify: No HTTP 500 errors
   - Verify: No stack traces

5. **Test Other Features:**
   - Search for tracks
   - Browse similar songs
   - Browse top songs
   - Verify all work without errors

6. **Performance Comparison:**
   - Before fix: similarSongs makes 51 API calls
   - After fix: similarSongs makes 1 API call
   - Observe faster response times

## Performance Considerations

### Positive Impact

**Eliminated API Calls:**
- `getTrack()`: Saves 1 `getAlbum` call per track (50% reduction: 2 calls → 1 call)
- `similarSongs()`: Saves up to 50 `getAlbum` calls (98% reduction: 51 calls → 1 call)
- `topSongs()`: Saves up to 50 `getAlbum` calls (98% reduction: 51 calls → 1 call)

**Response Time Improvements:**
- Each `getAlbum` call: ~50-200ms network roundtrip
- `similarSongs` improvement: ~2.5-10 seconds faster
- `topSongs` improvement: ~2.5-10 seconds faster
- Better user experience in Sonos app

**Server Load Reduction:**
- Fewer requests to Subsonic/Astiga backend
- Less database load
- Lower bandwidth usage
- Reduced server costs

### No Performance Degradation
- Conditional object creation has negligible overhead
- Optional chaining is compile-time only (no runtime cost)
- Same memory footprint

## Migration Notes

### No Migration Required
- This is a bug fix with performance improvements
- No database changes
- No configuration changes
- No user action required
- Fully backward compatible

### Deployment
1. Deploy updated code
2. Restart bonob service
3. Monitor logs for errors
4. Verify no issues in production

### Rollback Plan
If critical issues arise:
1. Revert to previous version
2. Restart service
3. Original behavior restored (including bug)

### Backward Compatibility
- Tracks with albums work identically to before
- SMAPI responses maintain same structure (optional fields already supported)
- Subsonic API calls unchanged (just fewer of them)
- No breaking changes

## References

- **Original bug report:** `claude-plans/1109-dont-getalbum-no-album.md`
- **Previous broader plan:** `claude-plans/1109-dont-getalbum-no-album_plan.md`
- **Root cause:** src/subsonic.ts:732 - `getTrack()` with `song.albumId!`
- **All affected locations:**
  - src/subsonic.ts:732 - `getTrack()`
  - src/subsonic.ts:970-971 - `playlist()`
  - src/subsonic.ts:1029 - `similarSongs()`
  - src/subsonic.ts:1046 - `topSongs()`
  - src/subsonic.ts:328-329 - `asTrackFromSearchResult()`
- **Type definitions:**
  - src/music_service.ts:63-74 - Track type
  - src/music_service.ts:18-22 - ArtistSummary type
- **SMAPI layer:** src/smapi.ts:350-372 - track conversion
