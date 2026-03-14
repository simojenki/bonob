# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is bonob

bonob is a Sonos SMAPI (Sonos Music API) implementation that bridges Sonos devices with Subsonic API-compatible music servers (Navidrome, Gonic, etc.). It acts as a middleware that translates SMAPI SOAP calls from Sonos into Subsonic API calls, enabling Sonos devices to browse and stream music from a self-hosted music server.

## Commands

```bash
# Install dependencies
npm install

# Build TypeScript to ./build/
npm run build

# Run all tests
npm test

# Run tests in watch mode
npm run testw

# Run a single test file
npx jest tests/smapi.test.ts

# Run tests matching a name pattern
npx jest --testNamePattern="some test description"

# Development server (with nodemon, requires env vars)
npm run dev
```

## Architecture

The request flow through bonob:

1. **Sonos device** sends a SOAP request to `/ws/sonos`
2. **[smapi.ts](src/smapi.ts)** — SMAPI SOAP service layer. Handles Sonos SMAPI protocol: browsing content, auth token validation, ratings, search, playlist management. Uses the Sonos WSDL (`Sonoswsdl-1.19.6-20231024.wsdl`) to expose a SOAP service via the `soap` library.
3. **[music_library.ts](src/music_library.ts)** — Core domain types (`MusicService`, `MusicLibrary`, `Artist`, `Album`, `Track`, `AlbumQuery`, etc.) and the `MusicService` interface that the SMAPI layer calls into.
4. **[subsonic_music_library.ts](src/subsonic_music_library.ts)** — `SubsonicMusicService` implements `MusicService`, translating music library operations into Subsonic API calls.
5. **[subsonic.ts](src/subsonic.ts)** — Low-level Subsonic API client. Handles HTTP requests to the Subsonic server, image fetching, transcoding/custom player logic.

### Other key files

- **[server.ts](src/server.ts)** — Express HTTP server setup. Mounts the SMAPI SOAP service, login page, image proxy, audio streaming, registration endpoints, and icon serving. Also handles byte-range requests for audio streaming.
- **[app.ts](src/app.ts)** — Entry point. Wires together config, Sonos discovery, Subsonic client, and feature flags (scrobbling, now-playing) before starting the server.
- **[sonos.ts](src/sonos.ts)** — Sonos device discovery and auto-registration logic using `@svrooij/sonos`.
- **[smapi_auth.ts](src/smapi_auth.ts)** — JWT-based SMAPI login token management (`JWTSmapiLoginTokens`). Handles AppLink auth flow.
- **[api_tokens.ts](src/api_tokens.ts)** — In-memory store for API tokens that map Sonos device sessions to Subsonic credentials.
- **[link_codes.ts](src/link_codes.ts)** — Short-lived codes used in the AppLink auth flow (user enters a code in the Sonos app to link their account).
- **[burn.ts](src/burn.ts)** — BUrn (bonob URN) scheme: `bnb:system:resource`. Used to identify resources (images, tracks) across system boundaries. External URLs get encrypted; internal IDs use shorthand mappings.
- **[config.ts](src/config.ts)** — Reads all `BNB_*` environment variables (with `BONOB_*` as deprecated legacy names).
- **[i8n.ts](src/i8n.ts)** — Localization strings for Sonos presentation (en-US, da-DK, nl-NL, fr-FR).
- **[icon.ts](src/icon.ts)** — SVG icon generation for genres and the bonob service icon.
- **[registrar.ts](src/registrar.ts)** / **[register.ts](src/register.ts)** — Manual registration of bonob as a Sonos music service (S1 auto-registration).

## Key patterns

- **fp-ts** is used extensively: `TaskEither` for async operations that can fail, `Option` for nullable values, `pipe` for composition. Understand these before modifying data-flow code.
- **BUrn** IDs are used everywhere to reference resources. External URLs (artist images from Spotify/etc.) are encrypted when embedded in URNs to avoid exposing them in URLs.
- **Tests** live in `tests/` and mirror the `src/` file names (e.g. `tests/smapi.test.ts` tests `src/smapi.ts`). Tests use Jest with `ts-jest`, `ts-mockito` for mocking, and `supertest` for HTTP endpoint testing.
- **TypeScript** is compiled to `./build/` with strict mode enabled (`noImplicitAny`, `noUnusedLocals`, `noUnusedParameters`, `noUncheckedIndexedAccess`).
- The SMAPI SOAP service is bound to Express via the `soap` library using the Sonos WSDL file. Changes to SOAP operations must align with the WSDL.
