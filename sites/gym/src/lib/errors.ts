// The AADSTS code is the part worth acting on, and it arrives buried in prose
// alongside a trace ID and a timestamp. Pulled out so it can be shown on its
// own and matched against the table below.
function extractAadsts(message: string): string | null {
    const match = /AADSTS\d+/.exec(message);

    return match ? match[0] : null;
}

// Failures that mean something specific about *this* setup, with the fix
// rather than a restatement. Anything unlisted falls through to the raw
// message, which beats a wrong guess.
const ERROR_FIXES: Record<string, string> = {
    AADSTS50011: 'The redirect URI this page sent is not registered on the app. It is this origin plus /auth.html — see REDIRECT_URI in lib/config — and it goes under App registrations → Authentication → Add a platform → Single-page application. It has to match as a string, trailing slash included.',
    AADSTS9002326: 'The redirect URI is registered under the "Web" platform instead of "Single-page application". A SPA uses PKCE and sends no client secret, and Entra refuses that combination on a Web redirect URI. Move the URI to the SPA platform — the same string, a different platform block.',
    AADSTS700016: 'No application with this client ID exists in the tenant being signed in to. Check CLIENT_ID in lib/config, and check the tenant: a single-tenant app is invisible from any directory but its own.',
    AADSTS650053: 'The tenant does not expose the scope that was asked for. Check the resource scope string against the API registration — it is the App ID URI plus a slash plus the scope name, and both halves have to match what is on the "Expose an API" blade.',
    AADSTS65001: 'The user or an administrator has not consented to this scope. Signing in again interactively will show the consent screen; if the scope requires admin consent, an administrator has to grant it on the registration first.',
    AADSTS500011: 'No resource principal was found for the App ID URI in the scope. Either the URI is wrong, or the API registration has no service principal in this tenant yet.',
    AADSTS900971: 'No reply address was sent. This usually means the app registration has no SPA redirect URI at all, so there was nothing for Entra to match against.',
    AADSTS7000215: 'Invalid client secret. A SPA should never send one — if this appears, the registration is being treated as a confidential client, which points at the redirect URI sitting under the "Web" platform.',
    AADSTS50194: 'The app is not configured as multi-tenant, and the request went to a shared endpoint. AUTHORITY in lib/config ends in /organizations; a single-tenant registration needs the tenant GUID there instead.',
    invalid_grant: 'The cached refresh token was rejected — usually a password change, a revoked session, or a Conditional Access policy that now demands a fresh sign-in. Sign out and sign in again.',
    interaction_required: 'Entra will not issue this token without asking the user something — consent, MFA, or a Conditional Access requirement. The redirect to Entra handles it; if it came back here without a token, try signing in again.',
    timed_out: 'MSAL renewed in a hidden iframe and the iframe never reported back — usually third-party cookies blocked for login.microsoftonline.com, or a Content-Security-Policy whose frame-src does not admit both Entra and this origin, since the response lands back here on /auth.html. This app does not renew that way: getToken stops at the refresh token and goes to Entra top-level instead, so seeing this points at a cached bundle older than that change.',
    monitor_window_timeout: 'The renewal iframe was navigated but never came back with a response. Same causes as timed_out, and the same note: this app does not renew in a frame any more.',
};

/**
 * Whether MSAL's own `errorCode` is this one. The field is read defensively —
 * a failure can arrive as a DOMException or a plain Error, neither of which
 * has it.
 */
function hasCode(error: unknown, code: string): boolean {
    const actual = typeof error === 'object' && error !== null
        ? (error as Record<string, unknown>)['errorCode']
        : undefined;

    return actual === code;
}

/**
 * Whether Entra rejected the cached refresh token outright.
 *
 * Worth telling apart because MSAL does *not* raise it as an
 * `InteractionRequiredAuthError` — the token endpoint answered, so it is a
 * server error — and yet it is the same answer: a password change, a revoked
 * session or a new Conditional Access rule all want a trip to Entra, and that
 * trip is what sorts out which.
 */
export function isRejectedRefreshToken(error: unknown): boolean {
    return hasCode(error, 'invalid_grant');
}

export interface AuthErrorDetail {
    code: string;
    message: string;
    correlationId: string | null;
    fix: string | null;
}

// MSAL throws AuthError, but a failure can also arrive as a DOMException or a
// plain Error, so the fields are read defensively.
export function describeAuthError(error: unknown): AuthErrorDetail {
    const source = (typeof error === 'object' && error !== null
        ? (error as Record<string, unknown>)
        : {});

    const message = typeof source['errorMessage'] === 'string' && source['errorMessage']
        ? source['errorMessage']
        : typeof source['message'] === 'string' && source['message']
            ? source['message']
            : String(error);

    const code = typeof source['errorCode'] === 'string' && source['errorCode']
        ? source['errorCode']
        : null;

    const correlationId = typeof source['correlationId'] === 'string' && source['correlationId']
        ? source['correlationId']
        : null;

    const aadsts = extractAadsts(message);
    const fix = (aadsts ? ERROR_FIXES[aadsts] : undefined)
        ?? (code ? ERROR_FIXES[code] : undefined)
        ?? null;

    return {
        code: [code, aadsts].filter(Boolean).join(' · ') || 'unknown',
        message,
        correlationId,
        fix,
    };
}
