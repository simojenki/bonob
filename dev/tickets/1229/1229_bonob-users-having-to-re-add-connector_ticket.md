# Token Refresh Investigation

## Symptom

Users periodically lose access to their music service and must remove and re-add it to recover. Logs show repeated `oldToken` entries for the same user across many minutes, each accompanied by a different `newToken`.

Example log: `log.md`

## Speculative Cause: Client Does Not Persist Refreshed Tokens

The Sonos Android client does not persistently store new credentials received via the `Client.TokenRefreshRequired` SOAP fault. Per the SMAPI spec, when a token has expired, the server returns `TokenRefreshRequired` containing a new `authToken` and `privateKey`, and Sonos should update its stored credentials and retry the request. In practice the retry occurs in-memory, but the original (expired) token remains in the client's persistent storage.

Consequence: every subsequent request (e.g. after the app is backgrounded or restarted) presents the same original expired token. The server must perform a full token refresh on every request, indefinitely.

## Why Tokens Always Appear Expired

Sonos clients do not always include the `privateKey` in SOAP `loginToken` headers. When `key` is absent, `incompleteCredentialsProvided` is true and the server falls back to a cache lookup (`credentialsForToken`) using the JWT from the HTTP `Authorization: Bearer` header. This successfully retrieves the stored key, allowing `verify()` to run — but since the JWT is expired, `verify()` returns `ExpiredTokenError`, triggering the refresh path on every request.

## Upstream Service Unavailability Returns Wrong SOAP Fault

When the upstream Subsonic/Astiga service is unavailable (e.g. HTTP 503), the token refresh path in `login()` returns `Client.LoginUnauthorized` instead of the correct `Server.ServiceUnavailable` fault. This causes Sonos to prompt the user to re-add their service, when the correct behaviour would be to show a temporary service unavailability message and retry.

The error path is:
```
refreshToken(serviceToken) → generateToken(parseToken(serviceToken)) →
  getJSON<PingResponse>("/rest/ping.view") → axios 503 → throw "Subsonic failed with: ..." →
  TE.tryCatch catches → TE.left(new AuthFailure("Subsonic failed with: ...")) →
  back in smapi.ts login(): TE.getOrElse(() => SMAPI_FAULT_LOGIN_UNAUTHORIZED)
```

Per the [SMAPI error handling spec](https://docs.sonos.com/docs/error-handling), the correct fault code is `Server.ServiceUnavailable` with a descriptive faultstring like "Upstream Astiga service was not available".

Example log showing this in practice:
```
2026-03-08T15:49:55 debug dan@elstensoftware.com /rest/ping.view {"f":"json"}
2026-03-08T15:49:55 info  [TIMING] Subsonic /rest/ping.view 13ms FAILED
2026-03-08T15:49:55 error Subsonic request failed: /rest/ping.view - Request failed with status code 503
2026-03-08T15:49:55 info  [TIMING] SMAPI getMetadata 17ms FAILED
2026-03-08T15:49:55 debug → Client.LoginUnauthorized "Failed to authenticate, try Re-Authorising..."
```

The 503 from Astiga is an upstream service failure, not an auth failure. Returning `LoginUnauthorized` causes the Sonos app to treat it as a credentials problem, prompting the user to re-add the service.

## Space Leak in Token Store

`swapToken` is called with the Subsonic `serviceToken` (base64-encoded credentials) as the "old token" to delete. The token store is keyed by SMAPI JWTs, so `delete tokens[serviceToken]` is always a no-op. Old SMAPI JWTs accumulate in both memory and S3, never cleaned up.

## Silent Error Handling

Five error handlers in `smapi.ts` silently discard errors without logging:
- `swapToken` TE.tryCatch error handler (line 471)
- `login()` catch on `musicService.login()` (line 527)
- `login()` expired-token `TE.getOrElse` (line 547)
- `refreshAuthToken` `TE.getOrElse` (line 686)
- `credentialsForToken` has no `.catch` on the S3 lookup promise

This makes it impossible to diagnose auth failures from logs alone.

## Recommended Fixes

1. **Distinguish service unavailability from auth failure**: When `refreshToken` / `generateToken` fails due to upstream unavailability (HTTP 5xx, network errors), return `Server.ServiceUnavailable` instead of `Client.LoginUnauthorized`. This requires either extending `AuthFailure` to carry the failure reason, or introducing a separate error type.

2. **Add logging to all silent error handlers**: Log errors at WARN with `reqId` and username before returning/throwing SOAP faults.

3. **Fix the space leak**: Pass the expired JWT (not the serviceToken) to `swapToken` so `delete this.tokens[oldToken]` actually removes the old entry. Use branded types to prevent future mismatches.

4. **Fix log verbosity**: The `soapyService.log` handler double-nests messages. Token values should be truncated in debug logs.
