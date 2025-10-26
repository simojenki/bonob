# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

bonob is a Sonos SMAPI (Sonos Music API) implementation that bridges Subsonic API clones (like Navidrome and Gonic) with Sonos devices. It acts as a middleware service that translates between the Subsonic API and Sonos's proprietary music service protocol, allowing users to stream their personal music libraries to Sonos speakers.

## Development Commands

### Building and Running
```bash
# Build TypeScript to JavaScript
npm run build

# Development mode with auto-reload (requires environment variables)
npm run dev
# OR with auto-registration
npm run devr

# Register bonob service with Sonos devices
npm run register-dev
```

### Testing
```bash
# Run all tests
npm test

# Run tests in watch mode
npm run testw

# Set custom test timeout (default: 5000ms)
JEST_TIMEOUT=10000 npm test
```

### Environment Variables for Development
When running locally, you need to set several environment variables:
- `BNB_DEV_HOST_IP`: Your machine's IP address (so Sonos can reach bonob)
- `BNB_DEV_SONOS_DEVICE_IP`: IP address of a Sonos device for discovery
- `BNB_DEV_SUBSONIC_URL`: URL of your Subsonic API server (e.g., Navidrome)

## Architecture

### Core Components

**`src/app.ts`** - Application entry point
- Reads configuration from environment variables
- Initializes all services (Subsonic, Sonos, authentication)
- Wires together the Express server with appropriate dependencies
- Handles SIGTERM for graceful shutdown

**`src/server.ts`** - Express HTTP server
- Serves web UI for service registration and login
- Handles music streaming (`/stream/track/:id`)
- Generates icons and cover art (`/icon/...`, `/art/...`)
- Serves Sonos-specific XML files (strings, presentation map)
- Binds SOAP service for Sonos SMAPI communication

**`src/smapi.ts`** - Sonos SMAPI SOAP implementation (1200+ lines)
- Implements the Sonos Music API Protocol via SOAP/XML
- Core operations: `getMetadata`, `getMediaURI`, `search`, `getExtendedMetadata`
- Handles authentication flow with link codes and device auth tokens
- Manages token refresh and session management
- Maps music library concepts to Sonos browse hierarchy

**`src/subsonic.ts`** - Subsonic API client
- Implements `MusicService` and `MusicLibrary` interfaces
- Handles authentication with Subsonic servers using token-based auth
- Translates between Subsonic data models and bonob's domain types
- Supports custom player configurations for transcoding
- Special handling for Navidrome (bearer token authentication)
- Implements artist image fetching with optional caching

**`src/music_service.ts`** - Core domain types and interfaces
- Defines `MusicService` interface (auth and login)
- Defines `MusicLibrary` interface (browsing, search, streaming, rating, scrobbling)
- Domain types: `Artist`, `Album`, `Track`, `Playlist`, `Genre`, `Rating`, etc.
- Uses `fp-ts` for functional programming patterns (`TaskEither`, `Option`, `Either`)

**`src/sonos.ts`** - Sonos device discovery and registration
- Discovers Sonos devices on the network using SSDP/UPnP
- Registers/unregisters bonob as a music service with Sonos systems
- Supports both auto-discovery and seed-host based discovery
- Uses `@svrooij/sonos` library for device communication

**`src/smapi_auth.ts`** - Authentication token management
- Implements JWT-based SMAPI tokens (token + key pairs)
- Handles token verification and expiry
- Token refresh flow using `fp-ts` `TaskEither`

**`src/config.ts`** - Configuration management
- Reads and validates environment variables (all prefixed with `BNB_`)
- Legacy environment variable support (BONOB_ prefix)
- Type-safe configuration with defaults

### Key Abstractions

**BUrn (Bonob URN)** - Resource identifier system (`src/burn.ts`)
- Format: `{ system: string, resource: string }`
- Systems: `subsonic` (for cover art), `external` (for URLs like Spotify images)
- Used for abstracting art/image sources across different backends

**URL Builder** (`src/url_builder.ts`)
- Wraps URL manipulation with a builder pattern
- Handles context path for reverse proxy deployments
- Used throughout for generating URLs that Sonos devices can access

**Custom Players** (`src/subsonic.ts`)
- Allows mime-type specific transcoding configurations
- Maps source mime types to transcoded types
- Creates custom "client" names in Subsonic (e.g., "bonob+audio/flac")
- Example: `BNB_SUBSONIC_CUSTOM_CLIENTS="audio/flac>audio/mp3"`

### Data Flow

1. **Sonos App Request** → SOAP endpoint (`/ws/sonos`)
2. **SOAP Service** → Verifies auth token, calls `MusicLibrary` methods
3. **MusicLibrary** → Makes Subsonic API calls, transforms data
4. **SOAP Response** → Returns XML formatted for Sonos

For streaming:
1. **Sonos Device** → `GET /stream/track/:id` with custom headers (bnbt, bnbk)
2. **Stream Handler** → Verifies token, calls `MusicLibrary.stream()`
3. **Subsonic Stream** → Proxies audio with proper mime-type handling
4. **Response** → Streams audio to Sonos, reports "now playing"

### Icon System (`src/icon.ts`)
- SVG-based icon generation with dynamic colors
- Supports foreground/background color customization via `BNB_ICON_FOREGROUND_COLOR` and `BNB_ICON_BACKGROUND_COLOR`
- Genre-specific icons
- Text overlay support (e.g., year icons like "1984")
- Holiday/festival decorations (auto-applied based on date)
- Legacy mode: renders to 80x80 PNG for older Sonos systems

### Authentication Flow
1. Sonos app requests link code via `getAppLink()`
2. User visits login URL with link code
3. User enters Subsonic credentials
4. bonob validates with Subsonic, generates service token
5. bonob associates link code with service token
6. Sonos polls `getDeviceAuthToken()` with link code
7. bonob returns SMAPI token (JWT) to Sonos
8. Subsequent requests use SMAPI token, which maps to service token

### Testing Philosophy
- Jest with ts-jest preset
- In-memory implementations for `LinkCodes`, `APITokens` for testing
- Mocking with `ts-mockito`
- Test helpers in `tests/` directory
- Console.log suppressed in tests (see `tests/setup.js`)

## Common Patterns

### Error Handling
- Use `fp-ts` `TaskEither<AuthFailure, T>` for async operations that can fail with auth errors
- SOAP faults for Sonos-specific errors (see SMAPI_FAULT_* constants)
- Promise-based error handling with `.catch()` for most async operations

### Type Safety
- Strict TypeScript (`strict: true`, `noImplicitAny: true`, `noUncheckedIndexedAccess: true`)
- Extensive use of discriminated unions
- Interface-based design for pluggable services

### Logging
- Winston-based logger (`src/logger.ts`)
- Log level controlled by `BNB_LOG_LEVEL`
- Request logging optional via `BNB_SERVER_LOG_REQUESTS`

### Functional Programming
- Heavy use of `fp-ts` for `Option`, `Either`, `TaskEither`
- Pipe-based composition (`pipe(data, fn1, fn2, ...)`)
- Immutable data transformations

## File Organization
- `src/` - TypeScript source code
- `tests/` - Jest test files (mirrors src/ structure)
- `build/` - Compiled JavaScript (gitignored)
- `web/` - HTML templates (Eta templating) and static assets
- `typings/` - Custom TypeScript definitions

## Important Constraints
- bonob must be accessible from Sonos devices at `BNB_URL`
- `BNB_URL` cannot contain "localhost" (validation error)
- Sonos requires specific XML formats (SMAPI WSDL v1.19.6)
- Streaming must handle HTTP range requests for seek functionality
- Token lifetime (`BNB_AUTH_TIMEOUT`) should be less than Subsonic session timeout
