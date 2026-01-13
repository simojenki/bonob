# Fix: SOAP Error Object Logging (#1140)

## The Problem

When SOAP methods threw plain JavaScript objects (not Error instances), the error wrapper was converting them to `"[object Object]"` using `String(error)`, resulting in unhelpful error messages:

```json
{
  "error": "[object Object]",
  "level": "error",
  "message": "getMetadata failed",
  "params": {"count": 100, "id": "artist:18", "index": 0}
}
```

The SOAP fault response was equally unhelpful:

```xml
<faultstring>[object Object]</faultstring>
```

## The Solution

Enhanced the `wrapSoapMethod` function in `src/smapi.ts` (lines 542-602) to handle different error types properly:

1. **SOAP Fault pass-through**: If the error is already a SOAP Fault object (like those intentionally thrown in `getDeviceAuthToken`), it re-throws it as-is without wrapping it again.

2. **Smart error message conversion**:
   - **Error instances**: Extracts the message and stack trace
   - **Strings**: Uses them directly
   - **Objects**: Attempts to `JSON.stringify()` them for readable output
   - **Everything else**: Converts to string as a fallback

3. **Better error logging**: Logs the full error details (object, stack trace, etc.) instead of converting to string prematurely.

## Result

Error messages and SOAP faults now show the actual error content:
- A proper JSON representation of error objects in logs
- Readable error messages in SOAP fault's `faultstring`
- Full error context for debugging

## Files Changed

- `src/smapi.ts`: Enhanced `wrapSoapMethod` function (lines 542-602)
