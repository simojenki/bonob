# Bonob Project Memory

## Test Baseline
- Tests currently have 32 pre-existing failures (format mismatches in smapi.test.ts and server.test.ts login page tests)
- Do NOT run all tests to "verify nothing broke" — use targeted test runs and compare against baseline
- After ticket 1229 changes: 32 failed, 849 passed, 881 total (baseline was 32 failed, 841 passed, 873 total)

## Key Architecture Insights

### Token Types (added in ticket 1229)
- `JwtTokenString` = branded string for JWT tokens (keys in `SonosSoap.tokens` dict)
- `ServiceTokenString` = branded string for base64-encoded Subsonic credentials
- `SmapiKeyString` = branded UUID used as JWT signing secret component
- These are compile-time only — no runtime behavior difference

### Critical Bug Fixed (ticket 1229)
- `isAuth()` was checking only `thing.serviceToken` — but `ExpiredTokenError` now also has `serviceToken` field
- Fixed to check `thing.serviceToken && thing.credentials && thing.apiKey` (all three unique to Auth)
- Old `ExpiredTokenError` had `expiredToken: string` field; new version has `serviceToken: ServiceTokenString` + `expiredJwt: JwtTokenString`

### Space Leak Fix
- `swapToken` now passes `expiredJwt` (the JWT from credentials) to `associateCredentialsForToken`
- Previously passed `serviceToken` which never matched JWT keys → delete was always a no-op

### Service Unavailability
- `ServiceUnavailableError` in `music_service.ts` — returned when upstream returns 5xx/ECONNREFUSED/etc
- `SMAPI_FAULT_SERVICE_UNAVAILABLE` in `smapi_auth.ts` — `Server.ServiceUnavailable` fault code
- Prevents Sonos from treating upstream outages as credential failures

## Project Notes
- TypeScript strict mode — branded types require casts at system boundaries
- fp-ts v2.16.2 — `TE.tap` available and works as expected
- `parseToken` from `subsonic.ts` extracts username from base64-encoded serviceToken
- `unimplS3Client` = `NoopPersistentTokenStore` (used in tests, all operations no-op)
