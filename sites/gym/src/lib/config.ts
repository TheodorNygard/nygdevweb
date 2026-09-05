// Identity and endpoints. Public by design: a SPA client id travels in the
// browser on every sign-in, and what protects the flow is PKCE plus the
// registered redirect URI rather than secrecy.

/**
 * The GymLog registration. The app signs in *as* this, which is what puts its
 * id in `appid`/`azp` — the claim Easy Auth checks against
 * `allowed_applications` (`terraform/consumption.tf`). Not a preference: a
 * front end with its own registration is turned away with a 403.
 */
export const CLIENT_ID = 'f6922f08-71f3-492d-953d-a294fb5acf16';

/** Not the tenant GUID, because the GUID is not public and this file is. */
export const AUTHORITY = 'https://login.microsoftonline.com/organizations';

/**
 * The scope the access token is minted for. Its audience has to be in
 * `allowed_audiences` on the function app, which today is GymLog itself — so
 * this asks GymLog for a scope on GymLog.
 *
 * **The scope name is the one value here created by hand**, on the
 * registration's *Expose an API* blade, and it has to match exactly. Getting it
 * wrong surfaces as `AADSTS650053` with the fix spelled out.
 */
export const API_SCOPE = import.meta.env['VITE_GYM_API_SCOPE']
    ?? `api://${CLIENT_ID}/user_impersonation`;

/**
 * `offline_access` is what makes Entra issue a refresh token, which is what
 * lets a silent renew happen without an iframe — and the iframe path needs
 * third-party cookies and fails quietly without them.
 */
export const LOGIN_SCOPES = ['openid', 'profile', 'offline_access'];

/**
 * Exactly what MSAL sends as redirect_uri, so it is the string to register.
 * Entra matches it as a string — a mismatch of one character fails with
 * AADSTS50011.
 *
 * **Not the origin root.** Since v5 MSAL returns every response through this
 * page, including the one its hidden renewal iframe waits ten seconds for, and
 * that page has to do nothing but broadcast it back (`src/auth.ts`). Pointing
 * this at the app would load React inside that iframe on that clock, and the
 * app does not broadcast anything — which is silent renewal failing with a
 * `timed_out` that names nothing.
 */
export const REDIRECT_URI = `${window.location.origin}/auth.html`;

/**
 * Where sign-out lands, which is the app rather than the bridge page — there is
 * no response to broadcast on the way back from a logout.
 *
 * Entra validates this against the *same* registered reply-URL list, so both
 * this and {@link REDIRECT_URI} have to be on the registration's
 * Single-page application platform.
 */
export const POST_LOGOUT_REDIRECT_URI = `${window.location.origin}/`;

/**
 * The API. This origin is also what `connect-src` in
 * `public/staticwebapp.config.json` admits, so changing one means changing both.
 */
export const API_BASE = import.meta.env['VITE_GYM_API_BASE']
    ?? 'https://func-nygdev-api.azurewebsites.net/api';

/**
 * The built-in exercise library — a static blob, not a route. Identical for
 * every user, so it costs no function invocation, no token and no RU.
 */
export const EXERCISE_LIBRARY_URL = import.meta.env['VITE_GYM_LIBRARY_URL']
    ?? 'https://nygdevcdn.blob.core.windows.net/data/gym-exercises.json';

/**
 * The built-in day templates — the named plans the Plan tab drops into a day.
 * A blob beside the exercise library and for the same reason: identical for
 * every user, so it changes when the app ships rather than when anyone trains.
 *
 * The user's own saved templates are not here. They are somebody's, so they
 * come from the API — `GET /gym/templates` — and the picker shows both.
 */
export const TEMPLATE_LIBRARY_URL = import.meta.env['VITE_GYM_TEMPLATES_URL']
    ?? 'https://nygdevcdn.blob.core.windows.net/data/gym-templates.json';
