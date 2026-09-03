// Identity and endpoints. Everything here is public by design: a SPA client id
// travels in the browser on every sign-in, and what protects the flow is PKCE
// plus the registered redirect URI rather than secrecy.

/**
 * The GymLog registration. The app signs in *as* this — which is what puts its
 * id in `appid`/`azp`, the claim Easy Auth on func-nygdev-api checks against
 * `allowed_applications` (`terraform/consumption.tf`). A front end with a
 * registration of its own is turned away with a 403 until that id is added
 * there, so this value is not a preference.
 */
export const CLIENT_ID = 'f6922f08-71f3-492d-953d-a294fb5acf16';

/**
 * Not a tenant GUID, because the GUID is not public and this file is. It
 * resolves to the signing-in account's work/school tenant, which for a
 * single-tenant registration can only be the app's own.
 */
export const AUTHORITY = 'https://login.microsoftonline.com/organizations';

/**
 * The scope the access token is minted for. Its audience has to be in
 * `allowed_audiences` on the function app, which as applied today is the
 * GymLog registration itself — both the bare client id and the `api://` form —
 * so this asks GymLog for a scope on GymLog.
 *
 * **The scope name is the one value here that has to be created by hand**, on
 * the registration's *Expose an API* blade, and it has to match this string
 * exactly. `VITE_GYM_API_SCOPE` overrides it at build time so a different name
 * (or a separate API registration later, once `allowed_audiences` names it) is
 * an environment change rather than a code change. Getting it wrong surfaces as
 * `AADSTS650053` on the sign-in screen, with the fix spelled out.
 */
export const API_SCOPE = import.meta.env['VITE_GYM_API_SCOPE']
    ?? `api://${CLIENT_ID}/user_impersonation`;

/**
 * Sign-in scopes. `offline_access` is what makes Entra issue a refresh token,
 * which is what lets a silent renew happen without an iframe — and the iframe
 * path needs third-party cookies and fails quietly without them. On a phone
 * left in a locker between sets, that difference is the whole session.
 */
export const LOGIN_SCOPES = ['openid', 'profile', 'offline_access'];

/**
 * Exactly what MSAL sends as redirect_uri, so it is the string to register.
 * Pinned to the origin root rather than built from `location.pathname`: Entra
 * matches it as a string, so a page reached at /index.html would send a
 * different one and fail with AADSTS50011 depending on how you navigated.
 */
export const REDIRECT_URI = `${window.location.origin}/`;

/**
 * The API. `api_function_app_hostname` in the NygDevAzure terraform is the
 * authority on the host; this origin is also what `connect-src` in
 * `public/staticwebapp.config.json` admits, so changing one means changing
 * both.
 */
export const API_BASE = import.meta.env['VITE_GYM_API_BASE']
    ?? 'https://func-nygdev-api.azurewebsites.net/api';

/**
 * The built-in exercise library — a static blob, not a route. It is identical
 * for every user and changes when the app ships, so it costs no function
 * invocation, no token and no RU. `gym_exercise_library_url` is the authority.
 */
export const EXERCISE_LIBRARY_URL = import.meta.env['VITE_GYM_LIBRARY_URL']
    ?? 'https://nygdevcdn.blob.core.windows.net/data/gym-exercises.json';
