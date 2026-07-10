# AGENTS.md — bonob

Compact repo guidance for OpenCode sessions.

## Project shape

- Single Node/TypeScript package. Not a monorepo.
- Runtime entry: `src/app.ts` → Express server on port `BNB_PORT` (default 4534).
- Build output: `./build/` via `tsc` (CommonJS, ES2019 target, strict mode).
- Architecture: Sonos device → `src/smapi.ts` (SOAP service using `soap` + WSDL) → `src/music_library.ts` domain interface → `src/subsonic_music_library.ts` → `src/subsonic.ts` (Subsonic API client). `src/server.ts` mounts the HTTP routes and proxies art/audio.

## Commands

```bash
npm install       # install deps
npm run build     # tsc — typecheck + emit to ./build
npm test          # jest full suite
npm run testw     # jest --watch
npx jest tests/smapi.test.ts
npx jest --testNamePattern="some test description"
```

- There is no separate `lint`, `format`, or `typecheck` script. `npm run build` is the typecheck.
- CI runs `npm install && npm test` on Node 22.

## Testing

- Jest uses `@swc/jest` to transform TypeScript.
- `tests/setup.js` replaces `console.log` with a mock; use `console.error/warn/info/debug` to print from tests.
- Default timeout is 5000 ms; set `JEST_TIMEOUT=60000` in the devcontainer.

## Runtime / dev gotchas

- `BNB_SECRET` is required at startup and must not be empty. `BNB_URL` must not contain `localhost` (Sonos devices cannot reach it).
- `BNB_SONOS_ENABLE_S1=true` is required for S1 support; it is off by default.
- Dev scripts (`dev-s2`, `dev-s1`, `devr`, `register-dev-s1`) expect local env vars such as `BNB_DEV_S2_URL`, `BNB_DEV_SUBSONIC_URL`, `BNB_DEV_SECRET`, and `BNB_DEV_SONOS_DEVICE_IP`.

## Code conventions

- Heavy use of `fp-ts` (`TaskEither`, `Option`, `pipe`). Do not introduce ad-hoc async error handling in the middle of `fp-ts` pipelines.
- Resource IDs are BUrn URNs (`bnb:system:resource`). External URLs embedded in URNs are encrypted; internal IDs use shorthand mappings. See `src/burn.ts`.
- Code style is not enforced by a formatter/linter; follow the existing TypeScript style.

## Build / deploy notes

- Docker builds need `libvips-dev`, `python3`, `make`, `g++`, and `git` because `sharp` compiles native code and the build reads `.git` for `npm run gitinfo`.
- `Makefile` only builds an OCI image with `podman` (`make image`).

## Existing instruction sources

- `CLAUDE.md` — detailed architecture and workflow notes; check it when changing SMAPI/Subsonic wiring.
- `README.md` — user-facing configuration reference and Docker usage.
