import { broadcastResponseToMainFrame } from '@azure/msal-browser/redirect-bridge';

// Since v5 MSAL returns every authorization response through the redirect URI
// page rather than through the app, and this call is the whole contract. In
// the hidden renewal iframe it posts the response to the app frame over a
// BroadcastChannel; skip it and the app waits out its ten-second budget and
// fails with `timed_out`, naming nothing. Top-level, after loginRedirect, the
// same call stashes the response and navigates back to where sign-in started.
//
// Its own entry rather than an import from the logger's copy: this is a build
// entry point, and what matters about it is that nothing else ends up on the
// page. A shared module would be one edit away from pulling the app in behind
// it.
void broadcastResponseToMainFrame().catch(() => {
    // Throws when the URL carries no authorization response, which means
    // somebody opened /auth.html directly. Inside the iframe there is nobody
    // to tell — the app frame reports its own failure. Top-level, the app is
    // what they were looking for.
    if (window.top === window.self) window.location.replace('/');
});
