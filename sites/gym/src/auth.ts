import { broadcastResponseToMainFrame } from '@azure/msal-browser/redirect-bridge';

// Since v5 MSAL returns every authorization response through the redirect URI
// page rather than through the app, and this call is the whole contract.
// Top-level, after a loginRedirect or acquireTokenRedirect, it stashes the
// response and navigates back to the app. Inside a hidden renewal iframe it
// would post the response to the app frame over a BroadcastChannel instead —
// but `useAuth` never opens one; see its cacheLookupPolicy.
//
// Nothing else belongs on this page. It loads on every return from Entra —
// each sign-in, and each renewal now that renewal is a redirect — before the
// app does, so every kilobyte it pulls stands between the gym wifi and the
// logbook.
void broadcastResponseToMainFrame().catch(() => {
    // Throws when the URL carries no authorization response, which means
    // somebody opened /auth.html directly, and the app is what they were
    // looking for. Inside a frame there would be nobody to tell — the app
    // frame reports its own failure.
    if (window.top === window.self) window.location.replace('/');
});
