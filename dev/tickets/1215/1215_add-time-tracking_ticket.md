We are observing a number of "Something went wrong" responses using the Sonos controller with Astiga. It appears some of these calls are taking a long time.

The best way to diagnose will be to make it clear in the logs which calls are taking a long time.

We want to time:

- Every SMAPI call that routes via `smapi.ts` (not /stream )
- Every Subsonic call

The duration of the request should be printed next (after) the request so the request can be easily recreated.

Provide a grep command, script or similar that will parse the logs afterwards and show the time for each request made. Make the searching defensive - maybe inject well known ascii only markers in the logs.