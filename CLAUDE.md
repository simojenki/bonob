# Bonob Project Guide
Bonob is a one-way adapter API between SMAPI (Sonos) and Subsonic. SMAPI clients (e.g. Sonos app) send SMAPI SOAP messages to Bonob which adapts and forwards messages onto a backend Subsonic server, returning the result after converting Subsonic responses to SMAPI responses.

    Sonos app -> Bonob -> Subsonic

In our case, the Subsonic server is Astiga.

## Language and Version

- **Language**: TypeScript 5.3.3
- **Runtime**: Node.js 20
- **Target**: ES2019 (ECMAScript 2019)
- **Module System**: CommonJS
- **Output Directory**: `./build`

**TypeScript Configuration:**
- Configuration: `tsconfig.json`

## Frameworks Used

### Core Framework
- **Express.js** (^4.18.2) - HTTP server framework

### SOAP/Sonos Integration
- **soap** (^1.0.0) - Provides Sonos SMAPI (Sonos Music API) implementation
- **@svrooij/sonos** (^2.6.0-beta.7) - Sonos device discovery and control

### Functional Programming
- **fp-ts** (^2.16.2) - Functional programming utilities (Either, Option, TaskEither patterns)

### Utilities
- **axios** (^1.6.5) - HTTP client
- **dayjs** (^1.11.10) - Date/time manipulation
- **underscore** (^1.13.6) - Utility functions
- **winston** (^3.11.0) - Structured logging

### Image & Data Processing
- **sharp** (^0.33.2) - Image manipulation and transcoding
- **libxmljs2** (^0.33.0) - XML parsing
- **node-html-parser** (^6.1.12) - HTML parsing

### Authentication & Security
- **jsonwebtoken** (^9.0.2) - JWT token generation/validation
- **jws** (^4.0.0) - JSON Web Signatures
- **ts-md5** (^1.3.1) - MD5 hashing

### Storage
- **fs-extra** (^11.2.0) - Enhanced file system operations
- **minio** (^8.0.1) - S3-compatible object storage client

### Templating
- **eta** (^2.2.0) - Embedded JavaScript templating for web views

### Testing
- **jest** (^29.7.0) - Test runner
- **ts-jest** (^29.1.2) - TypeScript preprocessor for Jest
- **supertest** (^6.3.4) - HTTP assertion library
- **chai** (^5.0.0) - Assertion library
- **ts-mockito** (^2.6.1) - Mocking framework

### Development Tools
- **nodemon** (^3.1.10) - Auto-restart during development
- **ts-node** (^10.9.2) - TypeScript execution for Node.js

## Top-Level Folder Description

### `src/` - TypeScript Source (Flat Structure)

All source files are in a single directory without subdirectories:

**Core Application:**
- `app.ts` - Main application entry point, initializes services and starts server
- `server.ts` - Express server setup and route configuration (18KB)
- `config.ts` - Configuration management from environment variables

**Sonos Integration:**
- `smapi.ts` - Sonos Music API implementation (43KB - core SMAPI protocol logic)
- `sonos.ts` - Sonos device discovery and registration
- `registrar.ts` - Service registration logic
- `Sonoswsdl-1.19.4-20190411.142401-3.wsdl` - Sonos SOAP WSDL definition

**Music Service:**
- `music_service.ts` - Music service interfaces and type definitions
- `subsonic.ts` - Subsonic API integration (31KB - music service backend)

**Authentication & Security:**
- `api_tokens.ts` - Token management and storage
- `smapi_auth.ts` - SMAPI authentication handling
- `link_codes.ts` - OAuth-style link code generation
- `encryption.ts` - Encryption utilities

**Utilities:**
- `icon.ts` - Dynamic icon generation for Sonos app
- `i8n.ts` - Internationalization support
- `logger.ts` - Winston logger configuration
- `url_builder.ts` - URL construction utilities
- `clock.ts` - Time/clock abstraction for testing
- `burn.ts` - URN utilities (Bonob URNs)
- `b64.ts` - Base64 utilities
- `utils.ts` - General utilities
- `register.ts` - Registration command entry point

### Other Top-Level Directories

- **`tests/`** - Comprehensive test suite with `.test.ts` files, test builders, and mock implementations
- **`web/`** - Web UI templates (Eta) in `views/` and static assets in `public/`
- **`typings/`** - Custom TypeScript type definitions
- **`docs/`** - Documentation and images
- **`build/`** - TypeScript compilation output (generated, not in version control)
- **`.github/`** - GitHub Actions CI/CD workflows

## Build

*We haven't worked out how to run builds in parallel with VS Code Dev Containers just yet.*

## Patterns and Idioms

### Functional Programming with fp-ts
- **Either Type**: `E.Either<ErrorType, SuccessType>` for operations that can fail
- **Option Type**: `O.Option<T>` for nullable values with `O.fromNullable()`
- **TaskEither**: `TE.TaskEither<Error, Result>` for async operations with error handling
- **Pipe Function**: `pipe(value, O.fromNullable, O.map(...), O.getOrElseW(...))` for composition

### Architectural Patterns
- **Interface-Based Design**: Core interfaces (`MusicService`, `MusicLibrary`, `APITokens`, `PersistentTokenStore`) with multiple implementations
- **Dependency Injection**: Constructor-based DI throughout, factory functions for swappable implementations
- **Adapter Pattern**: Subsonic class adapts external API to internal `MusicService` interface
- **Strategy Pattern**: Multiple implementations (e.g., token storage strategies, custom players)
- **Builder Pattern**: URLBuilder for URLs, test builders in `tests/builders.ts`

### Error Handling
- **Typed Error Classes**: Custom error classes (`AuthFailure`, `MissingLoginTokenError`, `InvalidTokenError`, `ExpiredTokenError`)
- **Either for Errors**: Explicit error handling with `E.left()` and `E.right()`
- **TaskEither for Async**: Async operations chain with `TE.chain()`, `TE.map()`, `TE.tap()`
- **Error Propagation**: Try-catch with context, logging before throwing

### TypeScript Practices
- **Strict Type Safety**: All strict compiler options enabled
- **Type Guards**: Runtime type checking (e.g., `isError()`, `isAuth()`)
- **Union Types**: For state representation
- **Type Transformations**: Dedicated functions like `asTrack()`, `asAlbum()`, `asGenre()`

### Naming Conventions
- **camelCase**: Variables and functions
- **PascalCase**: Classes and types
- **UPPER_CASE**: Constants
- **Prefixes**: `as*` for conversions, `is*` for type guards

### Configuration
- Environment variables via `config.ts`
- Helper function `bnbEnvVar()` for consistent reading with defaults
- Type-safe parsers (asBoolean, asInt)

### Domain-Specific Patterns
- **Token Management**: Multiple token types (serviceToken, apiToken, smapiToken) with encoding/decoding
- **URN System**: Custom URN scheme for resource identification with encryption support
- **Paging**: Consistent interface with `_index` and `_count`

### Testing Patterns
- **Builder Pattern**: Test data builders in `tests/builders.ts` (e.g., `aService()`, `anArtist()`, `aTrack()`)
- **In-Memory Implementations**: Test doubles (InMemoryMusicService, InMemoryAPITokens)
- **Jest Structure**: Describe/it organization with comprehensive coverage

## Running the Server

*We haven't worked out how to run this in parallel with VS Code Dev Containers just yet.*

## Tests

**Note: Do not run the tests yet, as they currently fail.**

### Run All Tests
```bash
nvm exec 20 npm test
```

### Run Tests in Watch Mode
```bash
nvm exec 20 npm run testw
```

### Test Framework
- **Jest** with ts-jest for TypeScript support
- Configuration: `jest.config.js`
- Setup file: `tests/setup.js`
- Default timeout: 5000ms (configurable via `JEST_TIMEOUT`)

### Test Coverage
Comprehensive test suite includes:
- **Unit Tests**: All major components (API tokens, authentication, config, encryption, icons, i18n, link codes, music service, registrar, Sonos integration)
- **Integration Tests**: Server endpoints (`server.test.ts` - 54KB)
- **Protocol Tests**: SMAPI protocol (`smapi.test.ts` - 124KB), Subsonic API (`subsonic.test.ts` - 162KB)
- **End-to-End Tests**: Scenario tests (`scenarios.test.ts`)

### Test Utilities
- **supertest**: HTTP endpoint testing
- **chai**: Assertions
- **ts-mockito**: Mocking
- **Custom builders**: Test data generation in `tests/builders.ts`
- **In-memory services**: Mock implementations for testing without external dependencies

### CI/CD
- GitHub Actions runs tests via `.github/workflows/ci.yml`
- CodeQL security analysis in `.github/workflows/codeql-analysis.yml`
