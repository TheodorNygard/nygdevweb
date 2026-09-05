import { broadcastResponseToMainFrame } from '@azure/msal-browser/redirect-bridge';

// Since v5 MSAL returns every authorization response through the redirect URI
// page rather than through the app, and this call is the whole contract. In
// the hidden renewal iframe it posts the response to the app frame over a
// BroadcastChannel; skip it and the app waits out its ten-second budget and
// fails with `timed_out`, naming nothing. Top-level, after loginRedirect, the
// same call stashes the response and navigates back to where sign-in started.
//
// Nothing else belongs on this page. It is fetched inside an iframe on that
// same ten-second clock, so every kilobyte it pulls is a kilobyte that has to
// arrive over gym wifi before the renewal gives up.
void broadcastResponseToMainFrame().catch(() => {
    // Throws when the URL carries no authorization response, which means
    // somebody opened /auth.html directly. Inside the iframe there is nobody
    // to tell — the app frame reports its own failure. Top-level, the app is
    // what they were looking for.
    if (window.top === window.self) window.location.replace('/');
});
