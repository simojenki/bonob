# `albumId` on folder children — requirements

> **Status.** Adopted as the way forward after Sonos confirmed SMAPI cannot make
> a folder both browsable and one-click playable (see
> [`1348_bonob-storage-browser_ticket.md`](./1348_bonob-storage-browser_ticket.md)).
> The **bonob adapter side (requirements 5–8) is complete**: `getMusicDirectory`
> parses `albumId` onto `FolderContents.folders`, and the folder `getMetadata`
> listing emits album-tagged folders as playable `trackList`s over the
> `album:<id>` path (`folderAlbum` in `src/smapi.ts`). The **Astiga backend side (requirements 1–4, library-backed
> leaf albums) is tracked in Astiga ticket #1365** — until it ships `albumId`,
> bonob falls back to plain containers (requirement 7). The non-library
> "folder albums" case (open question 9) is called out in #1365 as separate
> follow-up investigation.

## Context

Sonos (SMAPI) can't render a folder that is both browsable (shows sub-folders on
drill-in) **and** playable: `container` is browsable but shows no play affordance,
while `trackList`/`album` is playable but hides sub-folder children. To decide a
child folder's type at parent-listing time we must know whether it is an album
(leaf, playable) or a branch (navigation only). Astiga's `getMusicDirectory`
currently returns only `id / parent / title / isDir / coverArt` on directory
children — nothing to distinguish them — and a per-child lookup is ~1.5s each, so
it can't be done cheaply. Stamping `albumId` onto album-level directory children
resolves this deterministically in the single call Sonos already makes.

## Astiga / Subsonic backend (`getMusicDirectory`)

1. A directory `Child` (`isDir="true"`) that **is** an album MUST carry an
   `albumId` attribute referencing that album.
2. A directory `Child` that is **not** an album (artist / branch / intermediate
   navigation folder) MUST NOT carry `albumId`.
3. `albumId` MUST resolve via the existing album endpoints (`getAlbum` /
   `album:<id>`) — i.e. a real, playable album id.
4. Additive change only; `albumId` is absent by default and no other response
   shape changes.

## Bonob adapter

5. Parse `albumId` from directory children in `getMusicDirectory` and carry it on
   each `folders[]` entry (optional `albumId` on `Folder` /
   `FolderContents.folders`).
6. In the folder `getMetadata` listing, for each child folder:
   - **has `albumId`** → emit a playable `trackList` item (`itemType: "trackList"`,
     `id: "album:<albumId>"`, `canPlay: true`, art from `coverArt`); `trackList`
     is the item type SMAPI renders a play affordance for (a `container` gets
     none), and the `album:<id>` id makes drill-in and playback reuse the
     existing album path.
   - **no `albumId`** → emit a plain `container` (current behaviour).
7. Fallback MUST be safe: if `albumId` is absent everywhere (Astiga change not yet
   shipped), behaviour is identical to today — so bonob can merge independently.

## Accepted trade-off

8. An `albumId`-tagged folder is presented **as the album** (its ID3 tracks). Any
   sub-folders or stray non-album files under that folder are **not** shown for
   that node.

## Open questions
9. How to treat mixed folders with no single album, or no album tags at all (common for untagged case which is the key use case for the storage browser)? Would it be possible, if there's no direct existing "album" mapping in the `library/pr_library` to represent an ephemeral folder-album that will be remembered and returned from other Subsonic endpoints - getAlbum?

## Out of scope

10. No per-child lookups, no classification cache, no `getExtendedMetadata`-based
    playability.
