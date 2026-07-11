# Fork comparison report — Astiga/bonob vs simojenki/bonob

This report compares the Astiga fork of bonob (`.ignore/astiga`, `https://github.com/Astiga/bonob.git`) against the local upstream project (`/workspaces/bonob`, `master` at `70cdcfc`).

## Scope

- **Local project:** `/workspaces/bonob`, `master` at `70cdcfc`
- **Fork:** `/workspaces/bonob/.ignore/astiga` (`https://github.com/Astiga/bonob.git`)
- **Fork point / common ancestor:** `0488f39 Add years menu (#202)`
- **Fork branches examined:**
  - `master` — no divergence from the local project; the fork point is also the current `HEAD`.
  - `bonob-astiga` — the active development branch; all 40 commits below are unique to the fork.
  - `1109_dont-getalbum-no-album` and `1133_add-soap-error-handling` — only planning commits (`e6f4544`, `595cab6`) that are not on `bonob-astiga`; documentation only.

The bulk of the fork’s work is on the `bonob-astiga` branch and splits into four buckets:
1. **Astiga-specific branding/infrastructure** — not suitable for upstream.
2. **Persistent SMAPI token store** (in-memory → S3/Wasabi/file); main uses `JWTSmapiLoginTokens`/`InMemoryAPITokens`, so these commits do not apply directly.
3. **SMAPI/Subsonic correctness and performance fixes** — strong candidates for selective cherry-picking.
4. **Observability/reliability hardening** — generally applicable.

## Per-commit status

| # | Commit | Message | Scope | In local `master`? | Should apply? | Notes |
|---|--------|---------|-------|------------------|---------------|-------|
| 1 | `26c88e8` | Handle null decodes | `src/encryption.ts` | **Yes** | **No** | Main already uses `O.fromNullable`/`Either` to handle null `jws.decode` results. |
| 2 | `16b029a` | Ignore gitinfo | `.gitignore` | No | **Yes** | Adds `.gitinfo` to gitignore; safe dev-hygiene fix. |
| 3 | `09d0c67` | Store auth token against credentials and use for SMAPI requests | `src/server.ts`, `src/smapi.ts` | Partial | **No** | Main already extracts the bearer token via `findLoginToken` and verifies it through `JWTSmapiLoginTokens`; fork’s token→credentials map is tied to its different auth model. |
| 4 | `a49d293` | Handle refreshing tokens | `src/smapi.ts`, `src/subsonic.ts` | Partial | **Maybe** | Token-refresh wiring is fork-specific, but the `getAlbumList2` optimization (use `totalCount`, request only `_count`) is a real performance improvement. Needs a fallback for older Subsonic servers that omit `totalCount`. |
| 5 | `d137f8a` | implement reportAccountAction | `src/smapi.ts` | **Yes** | **No** | Main already has `reportAccountAction = ({ type }) => ({})`. |
| 6 | `879e224` | Use getArtistList instead so we can use pagination | `Dockerfile`, `src/subsonic.ts` | No | **Maybe** | Switches artist listing from standard `/rest/getArtists` to `/rest/getArtistList`, which is not guaranteed on all Subsonic servers. Worthwhile only with a fallback to the standard endpoint. Also comments out `npm test` in the Dockerfile (should be reverted if applied). |
| 7 | `a3b79a0` | use Astiga branding and web styles for login pages | `package.json`, `src/i8n.ts`, `src/server.ts`, `web/...` | No | **No** | Astiga-branded CSS/copy; not appropriate for upstream bonob. |
| 8 | `ec3fbf2` | Store tokens in Wasabi and fall back to that if we restart or they aren’t in memory | `src/app.ts`, `src/config.ts`, `src/server.ts`, `src/smapi.ts`, `package.json` | No | **No** | Depends on Minio/S3 with a hard-coded Astiga bucket. Main has no persistent SMAPI token store. |
| 9 | `8c59479` | Remove superfluous link code in failure output | `web/views/failure.eta` | N/A | **No** | Main’s failure view does not contain the offending block; change is not needed. |
| 10 | `df42d0d` | Abstracted token store, fixed some getExtendedMetadata and related SMAPI operations | `src/app.ts`, `src/config.ts`, `src/server.ts`, `src/smapi.ts`, `tests/...` | Partial | **Maybe** | Token-store abstraction is fork-specific. Some SMAPI hardening (e.g., safer default for unknown extended-metadata types) could be cherry-picked. |
| 11 | `34262b4` | Always return an empty mediacollection to getExtendedMetadata if the type isn’t recognised | `src/smapi.ts` | **Yes** | **No** | Main’s default path already returns `getExtendedMetadataResult: {}` and logs instead of throwing. |
| 12 | `c1f437f` | Log the call made to the Subsonic server with the username | `src/subsonic.ts` | No | **No** | Adds a debug log of `username path query` before Subsonic calls. Subsonic request logging is already surfaced adequately elsewhere; adding per-call logging would generate excessive noise. |
| 13 | `ace3b7b` | Move token classes to allow testing to run better. Also support partial credentials (token only) in the SOAP header | `src/api_tokens.ts`, `src/app.ts`, `src/server.ts`, `src/smapi.ts`, `tests/...` | No | **No** | Coupled to the fork’s persistent token store and partial-credential flows. |
| 14 | `047b868` | Return 'container' as the itemType for playlists in the root, and handle getMetadata calls for tracks | `src/smapi.ts` | Partial | **Deferred** | The root `playlists` `itemType` fix and the `track` `getMetadata` handler are relevant, but the commit also changes `artist` extended metadata to return a single artist object rather than a list of albums, which may not match Sonos expectations. |
| 15 | `cf5c289` | Remove Internet Radio from the root menu | `src/smapi.ts` | No | **No** | Main intentionally exposes Internet Radio; Astiga removed it because their backend lacks radio support. |
| 16 | `adf7704` | Remove "Favourites" because there's no concept of this in Astiga/Subsonic. Retain "Starred" | `src/smapi.ts` | No | **No** | Main intentionally exposes both Favourites and Starred as separate menus. |
| 17 | `468d728` | Rename favourites as "starred" and make sure starred is called in subsonic lookup | `src/i8n.ts`, `src/smapi.ts` | No | **No** | Conflates two distinct concepts for Astiga’s UI. |
| 18 | `ff774c3` | Don't return tracks for extended metadata on playlist container | `src/smapi.ts` | **Yes** | **No** | Main never had a `playlists` case in `getExtendedMetadata`; behaviour is already equivalent. |
| 19 | `d124f37` | subagent for logs | `.claude/agents/error-detective.md`, `.claude/settings.local.json` | No | **No** | AI-assistant configuration; not application code. |
| 20 | `f7cdc02` | Don't crash server if token not found | `package.json`, `src/app.ts` | No | **No** | Only relevant to the fork’s Minio/S3 token store (`NoSuchKey` handling). |
| 21 | `7e0b755` | Don't return albumId:undefined if there's no album returned from the Subsonic call | `src/smapi.ts` | No | **Deferred** | Useful only in combination with `f703fe9`’s optional `Track.album` work; in main `album.id` is currently required, so the guard has no effect on its own. |
| 22 | `788b0c5` | Write application/xml content type | `src/smapi.ts` | No | **No** | Mainline already returns `application/xml` via `node-soap@1.9.0`; the fork only adds an explicit `charset=utf-8` parameter, which is redundant because the XML declaration already specifies UTF-8. |
| 23 | `ebdd48e` | Implement a file based token store | `.gitignore`, `package.json`, `src/api_tokens.ts`, `src/app.ts`, `src/config.ts` | No | **No** | Part of the fork’s persistent token-store architecture; main uses in-memory tokens. |
| 24 | `579fa49` | Return a track, not an album for track search | `src/smapi.ts` | No | **Deferred** | Main still returns `album(...)` for track search results; this is a clear bug fix, but it may require test updates and should be bundled with the related search-result fixes (`34f45ed`, `f703fe9`). |
| 25 | `56e442b` | Created .gitlab-ci.yml file for CI/CD pipeline | `.gitlab-ci.yml` | No | **No** | Fork-specific CI; main uses GitHub Actions. |
| 26 | `5972fc2` | Use short commit SHA for version | `package.json` | No | **No** | Changes `git describe --tags` to short SHA in the `gitinfo` script. Cosmetic versioning change; not necessary for upstream. |
| 27 | `2e129d3` | Log the raw error | `src/subsonic.ts` | No | **No** | Adds `console.error` logging around Subsonic failures. Existing logging is sufficient; adding raw response dumps would be noisy and the implementation uses `console.error` rather than the project logger. |
| 28 | `34f45ed` | Don't make calls to getAlbum and getSong for search results | `src/subsonic.ts`, `tests/...` | No | **Deferred** | Main’s `searchTracks` still calls `getTrack` for every search result. This is a general performance/correctness improvement (introduces `asTrackFromSearchResult`), but it depends on `f703fe9`’s optional album/artist work and should be ported together with it. |
| 29 | `f703fe9` | Don't return album data when no album for a track | `src/music_service.ts`, `src/smapi.ts`, `src/subsonic.ts`, `tests/...` | No | **Deferred** | Makes `Track.album`/`Track.artist` optional and avoids `getAlbum`/`getSong`/non-null assertions when metadata is missing. Fixes real crashes for tracks without album metadata, but it is a large change best done together with `34f45ed` and `579fa49`. |
| 30 | `94baef5` | Catch-all block to avoid crashes | `src/smapi.ts`, `tests/smapi.test.ts` | No | **Deferred** | Wraps all SOAP methods to catch rejections and convert them to SOAP faults. Main has no top-level wrapper; unhandled promise rejections inside SOAP handlers can crash the process. Large change that affects every SOAP method. |
| 31 | `723edef` | Historical ticket work docs | `dev/tickets/...` | No | **No** | Documentation/planning only. |
| 32 | `b7b4192` | Convert error messages better | `src/smapi.ts` | No | **Deferred** | Improves the `wrapSoapMethod` added in `94baef5` so existing faults pass through and plain objects are JSON-stringified rather than rendered as `[object Object]`. Depends on #30, so deferred with it. |
| 33 | `378c14e` | Fix tests. Split tests to separate files to reduce token usage | `tests/subsonic.*.test.ts`, `tests/subsonic.test.ts` | No | **No** | The giant `subsonic.test.ts` split is useful but large. The mock/test updates are mostly only relevant if the deferred production changes from `34f45ed`/`f703fe9` are ported. Not applying now. |
| 34 | `5fd4a8f` | Retry S3 calls and handle them without crashing the server | `src/api_tokens.ts`, `src/app.ts`, `src/smapi.ts` | No | **No** | Builds on the fork’s Minio/S3 persistent token store, which does not exist in main. |
| 35 | `b0873c5` | Global catch for promise rejections; more detailed logging | `src/app.ts`, `src/server.ts`, `src/subsonic.ts` | No | **Deferred** | Adds `process.on("unhandledRejection")` and a `.catch` on `/stream/track`; useful hardening, but touches several runtime paths. |
| 36 | `1fd3751` | Added timing to logs | `src/smapi.ts`, `src/subsonic.ts` | No | **No** | Adds `[TIMING]` log markers around SMAPI/Subsonic calls. Opinionated logging format; not necessary upstream. |
| 37 | `a6b66a3` | Record a unique ID for each request | `src/server.ts`, `src/smapi.ts`, `typings/express/index.d.ts` | No | **No** | Adds per-request `req.id` and propagates it through logs. Main already has a per-stream `trace` UUID; global request IDs would be nice but are not essential. |
| 38 | `2e801c2` | Added logging for monitoring authentication flows and capturing more errors | `src/logger.ts`, `src/music_service.ts`, `src/server.ts`, `src/smapi.ts`, `src/smapi_auth.ts`, `src/subsonic.ts` | No | **Deferred** | The error-extraction/`ServiceUnavailable` fault logic is generally useful; the branded-token/JWT-cleanup parts are tied to the fork’s token store. Needs careful cherry-picking. |
| 39 | `0e15410` | Store key in persistent store if it's not in the cache; support refreshing the token if no key is provided | `src/smapi.ts`, `src/smapi_auth.ts`, `tests/...` | No | **No** | Assumes the fork’s persistent JWT/key store. |
| 40 | `b0de579` | Fixed tests | `tests/server.test.ts`, `tests/smapi.test.ts` | No | **No** | Expectations are fork-specific (Astiga labels, removed menu items). |

### Topic-branch planning commits (not on `bonob-astiga`)

| Commit | Branch | Summary | Should apply? |
|--------|--------|---------|---------------|
| `e6f4544` | `1109_dont-getalbum-no-album` | Planning notes for #1109 | No — docs only |
| `595cab6` | `1133_add-soap-error-handling` | Planning notes for #1133 | No — docs only |

## Recommendation summary

### Apply with adaptation / only if needed
- `a49d293` — `getAlbumList2` server-side pagination if a fallback for missing `totalCount` is added.
- `879e224` — `/rest/getArtistList` pagination only if a fallback to standard `/rest/getArtists` is implemented.
- `047b868` — cherry-pick the root `playlists` `itemType` fix and the `track` `getMetadata` case; review the `artist` extended-metadata change carefully.
- `7e0b755` — only meaningful if `f703fe9` (optional album) is also applied.
- `2e801c2` — cherry-pick the general error-extraction / `ServiceUnavailable` fault logic; skip the token-store-specific parts.
- `5972fc2`, `2e129d3`, `1fd3751`, `a6b66a3` — small observability/versioning changes; apply only if the specific behaviour is wanted.

### Not applying
- `c1f437f` — log Subsonic calls with username.  Subsonic request logging is already surfaced adequately elsewhere (ping/auth flows) and adding per-call logging would generate excessive noise in the default log stream.

### Do not apply
- Astiga-specific UI/branding: `a3b79a0`, `cf5c289`, `adf7704`, `468d728`, `b0de579`
- Persistent token-store infrastructure: `09d0c67`, `ec3fbf2`, `df42d0d`, `ace3b7b`, `ebdd48e`, `f7cdc02`, `5fd4a8f`, `0e15410`
- Fork-specific CI/tooling/docs: `56e442b`, `d124f37`, `723edef`, `e6f4544`, `595cab6`
- Already present in main: `26c88e8`, `d137f8a`, `34262b4`, `ff774c3`

### Biggest risks if ported blindly
1. **Token-store divergence.** Roughly a third of the fork commits assume SMAPI tokens are persisted to S3/Wasabi/filesystem. Main keeps tokens in memory and re-authenticates through the Subsonic backend; porting those commits would require introducing a new persistence layer.
2. **Non-standard Subsonic endpoints.** `879e224` relies on `/rest/getArtistList`; `a49d293` relies on `totalCount` in `getAlbumList2`. Both can break against plain Subsonic servers without fallbacks.
3. **Test suite expectations.** The fork removed menu items and renamed labels that main’s tests still assert; applying UI/menu commits would require large test updates.

### Suggested porting order
If you want to bring the useful changes across, the safest sequence is:

1. Apply small, safe patches: `16b029a` (done).
2. Port optional-album/search-result fixes: `f703fe9`, `34f45ed`, `579fa49` as a group (currently all deferred).
3. Port SOAP reliability: `94baef5`, `b7b4192` (currently deferred; #32 depends on #30).
4. Port global hardening: `b0873c5` (currently deferred).
4. Add global/stream hardening: `b0873c5`.
5. Evaluate pagination and observability commits separately with deliberate fallbacks/adaptations.

---

## Action log

This section records which fork items have been acted on and which are deferred.

| # | Commit | Decision | What was done |
|---|--------|----------|---------------|
| 2 | `16b029a` | Applied | Added `.gitinfo` to `.gitignore` |
| 4 | `a49d293` | Recorded | Added TODO in `src/subsonic.ts` `getAlbumList2` documenting the proposed server-side pagination fix and the `totalCount` fallback consideration |
| 6 | `879e224` | Recorded | Added TODO in `src/subsonic.ts` `getArtists` documenting the proposed `/rest/getArtistList` pagination fix and the fallback consideration |
| 10 | `df42d0d` | Deferred | SMAPI hardening parts identified but not yet applied; see details above. The token-store abstraction remains not applicable. |
| 12 | `c1f437f` | Not applying | Per-call Subsonic request logging rejected as too noisy; existing logging is adequate. |
| 14 | `047b868` | Deferred | Mixed SMAPI changes: root `playlists` itemType fix and `track` getMetadata are relevant, but the `artist` extended-metadata change is questionable. Decision postponed. |
| 21 | `7e0b755` | Deferred | Guard against `albumId:undefined` only meaningful if `f703fe9` (optional `Track.album`) is also applied. Postponed pending that decision. |
| 22 | `788b0c5` | Not applying | Mainline already returns `application/xml` via `node-soap@1.9.0`; explicit `charset=utf-8` parameter is redundant. |
| 24 | `579fa49` | Deferred | Track search returns `album(...)` today; the fix to return `track(...)` is correct but interdependent with `34f45ed`/`f703fe9`, so postponed. |
| 26 | `5972fc2` | Not applying | Short-SHA versioning in `gitinfo` is cosmetic and not needed upstream. |
| 27 | `2e129d3` | Not applying | Raw Subsonic failure logging is too noisy and uses `console.error` instead of the project logger. |
| 28 | `34f45ed` | Deferred | Avoids redundant `getTrack`/`getAlbum` calls for search results; depends on `f703fe9`’s optional album/artist work, so postponed. |
| 29 | `f703fe9` | Deferred | Large change to make `Track.album`/`Track.artist` optional; best ported together with `34f45ed` and `579fa49`. |
| 30 | `94baef5` | Deferred | SOAP method wrapper to catch rejections and convert them to SOAP faults. Large, affects every SOAP method. |
| 32 | `b7b4192` | Deferred | Improves SOAP fault serialization; depends on #30 being applied first. |
| 33 | `378c14e` | Not applying | Test-file split is large and mostly valuable only if the deferred `34f45ed`/`f703fe9` production changes are ported. |
| 35 | `b0873c5` | Deferred | Global `unhandledRejection` handler and `/stream/track` error handling; useful but touches several runtime paths. |
| 36 | `1fd3751` | Not applying | `[TIMING]` log markers are opinionated and not essential. |
| 37 | `a6b66a3` | Not applying | Per-request unique IDs would be nice, but main already has per-stream `trace` UUIDs. |
| 38 | `2e801c2` | Deferred | Error-extraction/`ServiceUnavailable` fault logic is useful, but needs careful cherry-picking to avoid token-store-specific parts. |

All other items remain pending review.
