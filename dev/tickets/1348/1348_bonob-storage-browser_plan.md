# 1348 — Bonob Storage Browser Implementation Plan

> **Update (post-implementation).** SMAPI cannot make a folder both browsable and
> one-click playable (confirmed by Sonos). Folders are therefore plain browsable
> `container`s; one-click playback is restored only for **album** folders via the
> `albumId` route. See the ticket's "Known SMAPI limitation" section and
> [`1348_albumId_requirements.md`](./1348_albumId_requirements.md). The `folder`
> builder/`getMetadata` case below still applies for non-album folders.

## Overview

Add a "Browse storage" navigation branch to the Sonos (SMAPI) integration so users can browse the raw folders and audio files in their Astiga storage accounts, in addition to the existing library views (artists, albums, genres, …). This is a straight application of bonob's existing SMAPI `getMetadata` drill-through model, backed by two new Subsonic REST calls (`getMusicFolders`, `getMusicDirectory`) exposed through two new `MusicService`/`MusicLibrary` methods.

## Current State Analysis

- **SMAPI navigation** (`src/smapi.ts`) is driven by `getMetadata`. The root menu is a `mediaCollection` array built in `case "root"` (`src/smapi.ts:1011-1089`). Every other node is reached by `splitId(id)` producing `{ type, typeId }` from a `type:typeId` string, then a `switch (type)` (`src/smapi.ts:1010-1292`). Drilling an `album:<id>` returns its tracks as `mediaMetadata` (`src/smapi.ts:1268-1280`) — the exact pattern a folder needs.
- **Item builders** in `src/smapi.ts`: `album()`, `artist()`, `track()` (`src/smapi.ts:345-401`). `track()` (`:366-393`) already tolerates a missing `album`/`artist` (spreads album fields only `if (track.album)`), so unsynced files with minimal metadata are handled. `coverArtURI()` (`:322-335`) maps a `BUrn` cover to `/art/…` and **hard-codes a `"vinyl"` icon fallback** when no cover art is present.
- **Icons**: `ICON` union + `ICONS` record (`src/icon.ts:163-311`), each loaded from `web/icons/*.svg` via `iconFrom()` (`:234-239`). Served at `/icon/:type/size/:size` (`src/server.ts:513`). The two new SVGs already exist on disk: `web/icons/folder-music-icon.svg`, `web/icons/file-music-icon.svg` (currently untracked, not registered).
- **i18n**: `KEY` union + per-language `translations` for 4 supported langs, en-US/da-DK/fr-FR/nl-NL (`src/i8n.ts:8-224`). A missing key throws.
- **Sonos localization resource**: `GET /sonos/strings.xml` (`src/server.ts:281-294`) generates a `<string stringId="KEY">value</string>` node for **every** `i8n.ts` KEY, per `SONOS_LANG` (`i8n()` falls back to en-US for langs not in `translations`). This is the resource Sonos consults for localized-error messages (`Error<N>Message`) and for `stringId`-referenced labels (e.g. `AppLinkMessage`).
- **SMAPI faults**: raised as `throw { Fault: { faultcode, faultstring, detail } }`. The existing `NOT_LINKED_RETRY` fault (`src/smapi.ts:234-244`) uses `detail: { ExceptionInfo, SonosError }` with `SonosError: "5"` — the proven shape for surfacing a localized message to the app.
- **Subsonic** (`src/subsonic.ts`): `Subsonic implements MusicService`. `getJSON<T>()` (`:559`) is the workhorse for `/rest/*` calls; it throws `Subsonic error:<msg>` on error responses. The `MusicLibrary` object is assembled in `libraryFor()` → `genericSubsonic` (`:818-1139`). `coverArtURN()` (`:250-256`) makes `{system:"subsonic", resource:"art:<id>"}` burns. `asTrack()` (`:284`) and module-private `asTrackFromSearchResult()` (`:328`) convert a Subsonic `song` (with embedded album/artist fields) to a `Track`. **Neither `getMusicFolders` nor `getMusicDirectory` exists today.**
- **Interfaces** (`src/music_service.ts`): `MusicService` (`:174`) and `MusicLibrary` (`:180`). `slice2()` (`:99`) does in-memory paging (`things.slice(_index, _index+_count)` + total).
- **Backend response shapes** (verified against Astiga `play/app/Controllers/Subsonic/BrowsingController.php`):
  - `getMusicFolders` → `{"subsonic-response":{musicFolders:{musicFolder:[{id, name}, …]}}}`. `id` is an opaque surrogate encoding `{storage, path: initialFolder}`, **directly usable as a `getMusicDirectory` id** (no `getIndexes` needed).
  - `getMusicDirectory?id=<id>` → `{"subsonic-response":{directory:{id, name, child:[…]}}}`. Each `child` has `isDir` (`true` folder / `false` file), an opaque `id`, `title`, `parent`, and optional `coverArt`. **Folders**: `{id, parent, title, isDir:true, coverArt?}`. **Files (synced)**: full `song` (id, title, album, artist, duration, track, suffix, contentType, coverArt, …). **Files (unsynced)**: minimal `{id, title, isDir:false, suffix, type, created, contentType}` — no duration/artist/album.
  - Folder/file ids are opaque DB surrogates (integer or string, **no `:`**), so they are safe inside bonob's `type:typeId` scheme.

### Key Discoveries
- `track()` already handles missing album/artist (`src/smapi.ts:373-379`) — no change needed for unsynced files beyond the cover-art fallback.
- **A folder is uniformly modeled on `case "album"`** (`src/smapi.ts:1268-1280`), which returns tracks as `mediaMetadata`. A folder listing is exactly that, plus its sub-folders emitted as a `mediaCollection` of the new `folder()` container builder. There is **no** per-level distinction — every folder (a storage-account root or any nested folder) is handled by the same code path. (Not modeled on `case "artist"`: that returns *albums* via the `album()` builder, which is a different shape; sub-folders use the `folder()` builder.)
- Streaming a folder file needs **no new code**: files are emitted with SMAPI id `track:<id>` by `track()`, and `getMediaURI`/`getMediaMetadata` already handle `type === "track"` (`src/smapi.ts:804-825`, `:846-849`).
- `wrapSoapMethod()` (`src/smapi.ts:652-709`) already converts any thrown error into a `Server.InternalError` SOAP fault — so a failed `folder()`/`musicFolders()` call surfaces as a SOAP fault automatically, satisfying "per-account backend failures raise a SOAP fault".
- The existing root-menu tests (`tests/smapi.test.ts:1265-1341` en-US and `:1353-…` nl-NL) assert the *exact* root array and **will break** once the "Browse storage" entry is appended; they must be updated in lock-step.

## Desired End State

From the Sonos app, a "Browse storage" item appears at the **end** of the bonob root menu. Selecting it:
- with **0** storage accounts → SOAP fault (`faultcode Client.ItemNotFound`, `SonosError 900`) whose localized `Error900Message` tells the user to set one up at `https://play.asti.ga/setup`;
- with **1** account → immediately lists that account's root-folder contents;
- with **>1** accounts → lists the accounts, each drilling into its root folder.

Drilling any folder lists its sub-folders (as playable containers) and audio files (as tracks), each array sorted alphabetically case-insensitive, paged in memory. Playing a folder queues the audio files directly inside it; playing a file streams it through the existing track pipeline.

## What We're NOT Doing
- Not implementing `getIndexes` (the account id from `getMusicFolders` reaches folder contents directly).
- Not changing the streaming/`getMediaURI`/`getMediaMetadata` code paths (files reuse `track:<id>`).
- Not recursively auto-queuing subfolders when a folder is played (falls out of the container model).
- Not altering the fallback icon for library tracks (albums/playlists/search keep the `"vinyl"` fallback; only storage files use the file icon).
- Not adding a new streaming id scheme, new SMAPI SOAP methods, or a "message/notice" item type (SMAPI has none — hence the fault).
- Not adding server-side paging to the Subsonic calls (backend returns all children; bonob pages in memory).

## Implementation Approach

Bottom-up: (1) icons, (2) i18n, (3) domain types + interface methods, (4) Subsonic REST calls + library wiring, (5) SMAPI builders + `getMetadata` cases + root entry. Files (`track:<id>`) and streaming need no new wiring. Tests are authored first (see "Testing Strategy") and initially fail.

---

## Phase 1: Icons

### Overview
Register the folder and file SVGs so they can be served and referenced as SMAPI `albumArtURI`s.

### Changes Required

#### `src/icon.ts`
- Add `"folder"` and `"file"` to the `ICON` union (`:163-232`).
- Add to the `ICONS` record (`:241-311`):
```ts
folder: iconFrom("folder-music-icon.svg"),
file: iconFrom("file-music-icon.svg"),
```

### Success Criteria

#### Automated Verification
- [ ] `ICONS.folder` and `ICONS.file` are defined and their `.toString()` renders valid SVG (icon test).
- [ ] Type checks pass (`ICON` includes the new keys).

#### Manual Verification
- [ ] `GET /icon/folder/size/legacy` and `GET /icon/file/size/legacy` return the expected SVGs.

---

## Phase 2: i18n

### Overview
Add the root-entry label and the no-account guidance message. Note both become Sonos `strings.xml` stringIds automatically (`src/server.ts:281-294` iterates every `KEY`), which is exactly what the `Error<N>Message` localized-error mechanism needs (see Phase 5).

### Changes Required

#### `src/i8n.ts`
- Add `"browseStorage"` and `"Error900Message"` to the `KEY` union (`:8-49`).
- Add both keys to **all four** `SUPPORTED_LANG` blocks (`:52-223`). Exact values (the `smapi.test.ts` nl-NL root assertion pins the Dutch `browseStorage`, so these must match):
  - `browseStorage` — used directly as the root menu item's `title`:
    - en-US: `"Browse storage"`
    - da-DK: `"Gennemse lager"`
    - fr-FR: `"Parcourir le stockage"`
    - nl-NL: `"Bladeren door opslag"`
  - `Error900Message` — the **localized error string** Sonos displays when the no-account fault returns `SonosError = 900`. **Must be ≤ 125 characters** (Sonos limit); keep the URL verbatim:
    - en-US: `"No storage account is connected. Set one up at https://play.asti.ga/setup"`
    - da-DK / fr-FR / nl-NL: translated equivalents (tests assert only that the `Error900Message` stringId exists per language, not its exact text).

Rationale for `Error900Message` (not a plain `noStorageAccount` key): Sonos resolves a fault's numeric `detail.SonosError` code to the localization key `Error<code>Message`. `900` is our chosen code — a high value picked deliberately to avoid Sonos's built-in low-numbered reserved codes (e.g. `NOT_LINKED_RETRY` uses `5`, which has no `Error5Message` key because Sonos supplies that message itself). Because `strings.xml` is generated from the `KEY` list, defining this one key is all that's required to publish the message in every `SONOS_LANG`.

### Success Criteria

#### Automated Verification
- [ ] `i8n(...)("browseStorage")` and `("Error900Message")` resolve for every supported language (no throw).
- [ ] `Error900Message` is ≤ 125 chars in every language.
- [ ] `keys()` includes the new keys; `GET /sonos/strings.xml` emits an `Error900Message` stringId per `SONOS_LANG` (existing i8n + server test parametrization covers all langs).

---

## Phase 3: Domain types & interface methods

### Overview
Introduce folder-browsing types and add them to `MusicService`/`MusicLibrary`.

### Changes Required

#### `src/music_service.ts`
Add types:
```ts
export type MusicFolder = {
  id: string;
  name: string;
};

export type Folder = {
  id: string;
  name: string;
  coverArt: BUrn | undefined;
};

export type FolderContents = {
  folders: Folder[];
  files: Track[];
};
```
Add to `MusicLibrary` (`:180`):
```ts
musicFolders(): Promise<MusicFolder[]>;
folder(id: string): Promise<FolderContents>;
```

#### `tests/in_memory_music_service.ts`
Add `musicFolders`/`folder` to the returned library (default empty / reject-unknown), plus backing fields + `has*` builder helpers so SMAPI navigation tests can seed storage accounts and folders. Shape:
```ts
musicFolders: async () => Promise.resolve(this.musicFolders),
folder: async (id: string) =>
  pipe(this.folders[id], O.fromNullable,
    O.map((it) => Promise.resolve(it)),
    O.getOrElse(() => Promise.reject(`No folder with id '${id}'`))),
```

### Success Criteria
#### Automated Verification
- [ ] Type checks pass; `Subsonic` and `InMemoryMusicService` both satisfy the extended `MusicLibrary` (compile-time).

---

## Phase 4: Subsonic REST calls & library wiring

### Overview
Implement `getMusicFolders` and `getMusicDirectory` and expose them via `genericSubsonic`.

### Changes Required

#### `src/subsonic.ts`
Response types:
```ts
type musicFolder = { id: string | number; name: string };
type GetMusicFoldersResponse = SubsonicResponse & {
  musicFolders: { musicFolder: musicFolder[] };
};

type directoryChild = song & { isDir?: boolean | string };
type GetMusicDirectoryResponse = SubsonicResponse & {
  directory: { id: string; name: string; child: directoryChild[] };
};
```
Methods on `Subsonic`:
```ts
getMusicFolders = (credentials: Credentials): Promise<MusicFolder[]> =>
  this.getJSON<GetMusicFoldersResponse>(credentials, "/rest/getMusicFolders")
    .then((it) => it.musicFolders?.musicFolder || [])
    .then((folders) => folders.map((f) => ({ id: `${f.id}`, name: f.name })));

getMusicDirectory = (credentials: Credentials, id: string): Promise<FolderContents> =>
  this.getJSON<GetMusicDirectoryResponse>(credentials, "/rest/getMusicDirectory", { id })
    .then((it) => it.directory)
    .then((directory) => {
      const children = directory?.child || [];
      const isDir = (c: directoryChild) => c.isDir === true || c.isDir === "true";
      return {
        folders: children.filter(isDir).map((c) => ({
          id: `${c.id}`,
          name: c.title,
          coverArt: coverArtURN(c.coverArt),
        })),
        files: children
          .filter((c) => !isDir(c))
          .map((c) => asTrackFromSearchResult(c, this.customPlayers)),
      };
    });
```
Notes:
- `asTrackFromSearchResult` (module-private, `:328`) already builds the album from embedded song fields when `albumId` is present and yields `album: undefined` for unsynced files — reuse it rather than duplicating the album-building blocks.
- `isDir` tolerated as boolean or `"true"` string (JSON booleans vs Astiga's stringy values — helpers emit `isDir:"true"`).

Wire into `genericSubsonic` (`:818`):
```ts
musicFolders: () => subsonic.getMusicFolders(credentials),
folder: (id: string) => subsonic.getMusicDirectory(credentials, id),
```

### Success Criteria
#### Automated Verification
- [ ] New `tests/subsonic.folders.test.ts` passes: `musicFolders()` maps `{id,name}` (ids stringified); `folder(id)` splits children into `folders`/`files`, maps folder `coverArt` to a subsonic art burn (or `undefined`), and builds `files` via the track pipeline including an **unsynced** file (no duration/artist/album → duration `0`, number `0`, undefined album/artist).
- [ ] Correct endpoints/params asserted (`/rest/getMusicFolders`, `/rest/getMusicDirectory` with `id`).

---

## Phase 5: SMAPI builders, root entry & getMetadata cases

### Overview
Add the folder container builder, the root "Browse storage" entry, the `musicFolders`/`folder` `getMetadata` cases (including the localized no-account fault), and give files a file-icon fallback.

### Changes Required

#### `src/smapi.ts` — SonosError constant
Add a module constant for the no-account error code, referenced by the fault below and mirrored by the `Error900Message` i18n key (Phase 2):
```ts
export const NO_STORAGE_ACCOUNT_SONOS_ERROR = "900";
```

#### `src/smapi.ts` — cover-art fallback (files use the file icon)
Give `coverArtURI` and `track` an optional fallback icon (default `"vinyl"` preserves all existing behavior):
```ts
export const coverArtURI = (bonobUrl, { coverArt }, fallbackIcon: ICON = "vinyl") =>
  pipe(coverArt, O.fromNullable,
    O.map((it) => bonobUrl.append({ pathname: `/art/${encodeURIComponent(formatForURL(it))}/size/180` })),
    O.getOrElseW(() => iconArtURI(bonobUrl, fallbackIcon)));

export const track = (bonobUrl, track, fallbackIcon: ICON = "vinyl") => ({
  ... albumArtURI: coverArtURI(bonobUrl, track, fallbackIcon).href(), ...
});
```
**Storage files fall back to the file icon, never vinyl.** The `folder` `getMetadata` case builds each file with `track(urlWithToken(apiKey), t, "file")`, so a file without cover art shows `file-music-icon.svg`. The `= "vinyl"` default on the param exists **only** so the ~8 existing `track(...)` call sites (albums, playlists, search, `getMediaMetadata`, …) keep their current behavior unchanged — it is never used for storage files.

#### `src/smapi.ts` — folder container builder
```ts
const folder = (bonobUrl: URLBuilder, folder: Folder) => ({
  itemType: "container",
  id: `folder:${folder.id}`,
  title: folder.name,
  albumArtURI: coverArtURI(bonobUrl, folder, "folder").href(),
  canPlay: true,
});
```
`Folder.coverArt` is populated from the `coverArt` on the `getMusicDirectory` `child` result (mapped to a subsonic art `BUrn` in Phase 4). When present it renders `/art/…`; when absent, `coverArtURI` falls back to the folder icon.

#### `src/smapi.ts` — root menu
Append as the **last** entry of the `case "root"` `mediaCollection` (`:1088`):
```ts
{
  id: "musicFolders",
  title: lang("browseStorage"),
  albumArtURI: iconArtURI(bonobUrl, "folder").href(),
  itemType: "container",
},
```

#### `src/smapi.ts` — `getMetadata` cases
Shared helper for a folder's contents (used by the single-account short-circuit and the `folder` case):
```ts
const ci = (a: string, b: string) => a.toLowerCase().localeCompare(b.toLowerCase());
const folderContents = (folderId: string) =>
  musicLibrary.folder(folderId).then((contents) => {
    const folders = [...contents.folders].sort((a, b) => ci(a.name, b.name));
    const files = [...contents.files].sort((a, b) => ci(a.name, b.name));
    const combined = [
      ...folders.map((f) => ({ kind: "folder" as const, f })),
      ...files.map((t) => ({ kind: "file" as const, t })),
    ];
    const [page, total] = slice2(paging)(combined);
    return getMetadataResult({
      mediaCollection: page.filter((x) => x.kind === "folder").map((x) => folder(urlWithToken(apiKey), (x as any).f)),
      mediaMetadata: page.filter((x) => x.kind === "file").map((x) => track(urlWithToken(apiKey), (x as any).t, "file")),
      index: paging._index,
      total,
    });
  });
```
Cases:
```ts
case "musicFolders":
  return musicLibrary.musicFolders().then((accounts) => {
    if (accounts.length === 0) {
      // Surface guidance via Sonos's localized-error mechanism, NOT the raw faultstring.
      // faultcode must be a defined Sonos code — "no storage account" is a not-found
      // condition, so Client.ItemNotFound (an authZ code like LoginUnauthorized is wrong).
      // detail.SonosError is a numeric key; Sonos looks up "Error<N>Message" in our
      // localization resource (strings.xml) for the caller's language and displays that.
      throw {
        Fault: {
          faultcode: "Client.ItemNotFound",
          faultstring: "No storage account connected",
          detail: {
            ExceptionInfo: "NO_STORAGE_ACCOUNT",
            SonosError: NO_STORAGE_ACCOUNT_SONOS_ERROR, // = "900"
          },
        },
      };
    }
    if (accounts.length === 1) {
      return folderContents(accounts[0]!.id);
    }
    const sorted = [...accounts].sort((a, b) => ci(a.name, b.name));
    const [page, total] = slice2(paging)(sorted);
    return getMetadataResult({
      mediaCollection: page.map((a) =>
        folder(urlWithToken(apiKey), { id: a.id, name: a.name, coverArt: undefined })
      ),
      index: paging._index,
      total,
    });
  });

case "folder":
  return folderContents(typeId!);
```

**How the no-account message reaches the user (the localized-error mechanism).** Per Sonos, the display text does **not** come from `faultstring`; it comes from a numeric `detail.SonosError` code that Sonos resolves against our Localization Resource. In bonob that resource is `strings.xml` (`src/server.ts:281-294`), which is **generated from every `i8n.ts` KEY** — each KEY becomes a `<string stringId="KEY">` node, emitted for every `SONOS_LANG` (`i8n()` falls back to en-US for languages not in `translations`, exactly as `AppLinkMessage` already does). So the wiring is:

1. Add an i18n KEY named **`Error900Message`** (Phase 2) — the `900` is our chosen `SonosError` code (any unused integer 0–999; `5` is already used by `NOT_LINKED_RETRY`). Message ≤ 125 chars.
2. Define `const NO_STORAGE_ACCOUNT_SONOS_ERROR = "900";` in `smapi.ts` and reference it in the fault `detail`.
3. `strings.xml` then automatically exposes `Error900Message` in each language; Sonos looks up `Error<SonosError>Message` and shows it.

The `detail: { ExceptionInfo, SonosError }` object shape is the same one the existing `NOT_LINKED_RETRY` fault uses (`smapi.ts:234-244`), which node-soap already serializes correctly in production — so no serializer changes are needed.

### Success Criteria
#### Automated Verification
- [ ] Root menu tests updated (en-US + nl-NL) to include the trailing "Browse storage" entry — existing assertions pass.
- [ ] New SMAPI storage-navigation tests pass: 0 accounts → SOAP fault with `faultcode "Client.ItemNotFound"` and `detail.SonosError === "900"`; 1 account → folder contents directly (no account level); >1 → account list (sorted); folder drill → sub-folders as `container/canPlay=true` + files as `track`; both arrays sorted case-insensitive; combined in-memory paging across the folder/file boundary; empty folder → empty `mediaCollection`+`mediaMetadata`; folder with real `coverArt` uses `/art/…`, without uses the folder icon; file without `coverArt` uses the file icon.
- [ ] `strings.xml` (`GET /sonos/strings.xml`) contains an `Error900Message` stringId for every `SONOS_LANG` (server test).
- [ ] Full suite + type-check + lint pass (see README).

#### Manual Verification
- [ ] In the Sonos app: "Browse storage" shows last in root; account/short-circuit behaviors match; folders drill to any depth; folders sorted then files sorted; playing a folder queues only its direct files; playing a file streams; folder/file art (real vs icon fallback) renders.
- [ ] With **no** storage account, the Sonos app displays the localized `Error900Message` guidance (pointing to `https://play.asti.ga/setup`) — confirming the `SonosError` → `strings.xml` lookup resolves on a real device.

---

## Testing Strategy

### Unit Tests (authored now, initially failing)
- **`tests/subsonic.folders.test.ts`** (new): `musicFolders()` (0 / 1 / many; id stringification; endpoint+params) and `folder(id)` (folders vs files split; folder coverArt burn; synced + **unsynced** file mapping; empty directory). Model on `tests/subsonic.playlists.test.ts` (mock `axios.get`: PING_OK then the folder JSON). Add response builders to `tests/subsonic.test.helpers.ts` (`getMusicFoldersJson`, `getMusicDirectoryJson`).
- **`tests/icon.test.ts`** (additions): assert `ICONS.folder`/`ICONS.file` render valid SVG.
- **`tests/smapi.test.ts`** (additions + fixes, authored now): add `musicFolders`/`folder` to the jest-mocked `musicLibrary`; update the two root-menu assertions (en-US + nl-NL) with the trailing "Browse storage" entry; add a `describe("browsing storage")` covering the no-account fault (`Client.ItemNotFound` + `SonosError "900"`), single-account short-circuit, multi-account sorted list, folder drill (sub-folders + files), case-insensitive sort, combined in-memory paging, empty folder, and file/folder icon fallbacks. Also add a `strings.xml` assertion that `Error900Message` is present per `SONOS_LANG` and ≤ 125 chars. These use the existing mock `musicLibrary`, so **no `InMemoryMusicService`/builder changes are needed for the tests**.
- **`tests/in_memory_music_service.ts`** (implementation phase, compile-driven): once `MusicLibrary` gains `musicFolders`/`folder` (Phase 3), `InMemoryMusicService` must implement them to keep the suite compiling — add trivial defaults there at that point.

### Manual Testing Steps
1. Register bonob against an Astiga account with 0, then 1, then ≥2 storage accounts; verify each Browse-storage behavior.
2. Drill nested folders; confirm ordering (folders then files, each A–Z case-insensitive) and paging on a large folder.
3. Play a folder (only direct files queue) and an individual file (streams).
4. Verify art: a folder/file with real cover art vs the icon fallbacks.

## Performance Considerations
`getMusicDirectory` returns all children with no server paging; bonob sorts and pages in memory. Large folders are materialized fully per `getMetadata` page request — acceptable and consistent with existing `years()`/`genres()` handling.

## References
- Original ticket: `dev/tickets/1348/1348_bonob-storage-browser_ticket.md`
- Backend shapes: `Astiga/play/app/Controllers/Subsonic/BrowsingController.php` (`getMusicFolders` L18, `getMusicDirectory` L138, directory envelope L417-424)
- SMAPI drill template: `src/smapi.ts:1268-1280` (`album` → tracks), `:1237-1250` (`artist` → albums)
- Subsonic list test template: `tests/subsonic.playlists.test.ts:99-166`
- Root menu + tests: `src/smapi.ts:1011-1089`, `tests/smapi.test.ts:1257-1343`
