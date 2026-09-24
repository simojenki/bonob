---
name: opensubsonic-audit
description: Audit bonob Subsonic types against the OpenSubsonic API spec. Use when comparing src/subsonic.ts types to the official OpenSubsonic schemas, fixing type mismatches, or renaming types to match schema names.
---

# OpenSubsonic API Type Audit

Audit bonob Subsonic types against the official OpenSubsonic API specification.

## Setup

Clone the OpenSubsonic documentation and API schemas into `.opensubsonic`:

```bash
if [ ! -d ".opensubsonic" ]; then
  git clone --depth 1 https://github.com/opensubsonic/open-subsonic-api.git .opensubsonic
fi
```

Ensure `.opensubsonic` is in `.gitignore` so it is never committed to the bonob repo.

## Key reference files

| OpenSubsonic concept | Local file(s) |
|---|---|
| JSON schemas | `.opensubsonic/openapi/schemas/*.json` |
| Endpoint docs / examples | `.opensubsonic/content/en/docs/Endpoints/<endpoint>.md` |
| Response object docs | `.opensubsonic/content/en/docs/Responses/<response>.md` |
| bonob Subsonic types | `src/subsonic.ts` |
| Music-library domain types | `src/music_library.ts` |
| Subsonic music library | `src/subsonic_music_library.ts` |

## Common discrepancies to look for

1. **Numeric fields typed as strings.** OpenSubsonic declares many "year", "duration", "track" etc. fields as `integer`; bonob sometimes used `string`. Fix at the Subsonic type and convert to the domain type at mapping boundaries (e.g. `asAlbumSummary`, `asTrackSummary`).
2. **Subset-of-response types.** bonob types intentionally omit many optional OpenSubsonic fields. Only add missing fields if the code actually consumes them.
3. **Wrong type names.** bonob names like `OpenSubsonicArtist` should usually match OpenSubsonic schema names, e.g.:
   - `OpenSubsonicArtist` → `ArtistID3`
   - `OpenSubsonicAlbum` → `AlbumID3`
   - `OpenSubsonicSong` → `Child`
4. **Wrong endpoint variant.** For example `getArtistInfo` should usually be `getArtistInfo2` for ID3-tagged responses.

## Procedure

1. Identify the bonob type or endpoint to audit.
2. Read the corresponding OpenSubsonic schema JSON and endpoint markdown.
3. List required fields and any optional fields the code accesses.
4. Compare with the bonob type in `src/subsonic.ts`.
5. Report:
   - fields that are correct;
   - missing optional fields (usually harmless);
   - fields with the wrong type or name;
   - endpoint/path mismatches.
6. When fixing, keep domain types in `src/music_library.ts` stable by converting at the boundary (e.g. numeric year from Subsonic → string year in `AlbumSummary`).
7. Run `npm run build && npm test` after changes.
