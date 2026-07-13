# 1348 — bonob: implement storage browser

As a user of the Astiga Sonos integration I want to be able to browse the folders and files in my storage accounts, not just library items like albums and artists.

Currently the integration only allows browsing of albums, artists and other library details. In addition, Astiga Web and the Subsonic API allow browsing of music folders. Subsonic exposes these via `/rest/[endpoint]` (see `../Astiga/play/routes.php`).

## Implementation
Follow existing work: expose the SMAPI interface which works against a `MusicService`, exposing a `musicLibrary` backed by the Subsonic implementation.

### SMAPI navigation
The SMAPI interface (`src/smapi.ts`) offers a set of navigational drill-throughs exposed by `getMetadata` at its top level (artists, albums, randomAlbums, …). Each selection is a drill-through which recalls `getMetadata` with the selection id, e.g. selecting "artists" then lists the artists.

**The same mechanism is used for storage folder browsing:**

1. **Root menu** — add a **"Browse storage"** entry at the **end** of the root menu.
2. **After selecting "Browse storage":**
   - If there is **more than one** storage account → list the storage accounts.
   - If there is **exactly one** storage account → skip the account level and go straight to that account's root folder contents (from its `initialFolder`).
   - If there is **no** storage account connected → raise a **SMAPI/SOAP fault** whose fault string tells the user no storage account is connected and to set one up at `https://play.asti.ga/setup`. (SMAPI has no message/notice item type, so a fault is used to surface the guidance rather than an empty list or a fake non-playable item.)
3. **After selecting a storage account** → show that account's root folder contents.
4. **After selecting a folder** → show that folder's contents (drill through folders to any depth).

#### Folder contents
Each folder listing returns:
- **Folders** in a `mediaCollection` array: `itemType=container`, `canPlay=true`, `albumArtURI` = the folder's real `coverArt` when the backend provides one, otherwise the folder icon (`web/icons/folder-music-icon.svg`).
- **Files** in a `mediaMetadata` array: `itemType=track`, built with the existing `track()` helper. Use the file's real `coverArt` when present, otherwise the folder icon as fallback.

Within each array, entries are ordered **alphabetically, case-insensitive**. (SMAPI already keeps folders and files in separate arrays — `mediaCollection` vs `mediaMetadata` — so sorting is applied within each array, not as one interleaved list.)

**Empty folders** simply return an empty `mediaCollection` (and empty `mediaMetadata`).

#### Playback / streaming
- `getMediaURI` is only ever called for **files**, never folders.
- Playing a **folder** (`canPlay=true`) queues only the audio files **directly** inside it; subfolders are navigated into, not recursively auto-included. This falls out of the existing container model: selecting a folder issues `getMetadata` on the folder id, which returns the folder's files as `mediaMetadata` (and its subfolders as `mediaCollection`) — exactly the same pattern as `getMetadata` on an `album:id` (see `smapi.ts#1268-1280`), where the album is a `mediaCollection` whose id, when drilled into, returns `mediaMetadata` for all its tracks. Sonos then requests `getMediaURI` per file.

### Subsonic
`src/subsonic.ts` defines `Subsonic`, which implements `MusicService`. Neither `getMusicFolders` nor `getMusicDirectory` is implemented today — both need adding.

- Use **`getMusicFolders`** to enumerate storage accounts. Each returned entry is `{ id, name }` where `id` is an encoded `{ storage, path: initialFolder }` — this id is **directly usable as a `getMusicDirectory` id**, so no `getIndexes` call is required to reach an account's root contents.
- Use **`getMusicDirectory?id=<id>`** to drill through folders and retrieve contents. Each `child[]` entry carries `isDir` (folder vs. file), an encoded `id`, `title`, `parent`, and — for folders with detected album art and for synced songs — `coverArt`. Unsynced files come back with minimal metadata (suffix/contentType only; no duration/artist/album), so `track()` must tolerate missing fields.

Folder/file ids are opaque DB surrogate ids (integer/string, no `:`), so they are safe inside bonob's `type:typeId` SMAPI id scheme.

### Cross-cutting concerns
- **New interface methods**: add folder-browsing methods to `MusicService`/`MusicLibrary` (e.g. `musicFolders()` and `folder(id)`) and wire them to the new Subsonic REST calls.
- **Paging**: the Subsonic folder endpoints return *all* children with no server-side paging, but SMAPI passes `_index`/`_count`. bonob must sort (alphabetical, case-insensitive) and page **in memory**.
- **Per-account backend failures**: if enumerating/reading a storage account fails, raise a **SOAP fault** (do not silently skip the account).
- **i18n**: add `src/i8n.ts` entries for the new labels ("Browse storage" and the no-account guidance message).
- **Icons**: the folder icon has been added at `web/icons/folder-music-icon.svg`, file icon at `web/icons/file-music-icon.svg`; register/reference it via `src/icon.ts`.

## Known SMAPI limitation — one-click folder playback

During implementation we found SMAPI cannot model a folder that is **both**
browsable (drills into sub-folders/files) **and** one-click playable:

- `itemType=container` is browsable but shows **no play affordance** — a folder's
  tracks only play by opening the folder and playing each file individually.
- `itemType=track`/`album` (a `trackList`) is playable but **hides sub-folder
  children**, so you can no longer drill down.

There is no `getMetadata` response shape that lists sub-folders *and* files while
also making the whole folder playable in one click. Sonos confirmed this:

> Unfortunately … SMAPI as it stands is a little inflexible with its container
> behavior and capabilities. What you're looking for would not be viable as is.

**Decision.** Plain folders stay browsable `container`s (navigate in, play files
individually). To restore one-click playback where it matters, a **leaf folder
that is an album** is emitted as a native SMAPI `album` (playable), driven by an
`albumId` the backend stamps onto album-level directory children. See
[`1348_albumId_requirements.md`](./1348_albumId_requirements.md). The change is
additive and safe: with no `albumId` present, behaviour is identical to today
(all folders are containers).

## Tasks
- Plan the implementation
- Write the tests
- Implement the plan
- Document the SMAPI container/playability limitation (above)
- Implement the `albumId` route (album-tagged folders → playable albums)
