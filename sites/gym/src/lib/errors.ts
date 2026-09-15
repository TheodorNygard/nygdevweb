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
    timed_out: 'Silent renewal ran out of time. MSAL renews in a hidden iframe, and the iframe never reported back — usually third-party cookies blocked for login.microsoftonline.com, or a Content-Security-Policy whose frame-src does not admit both Entra and this origin, since the response lands back here on /auth.html. The app answers this by renewing top-level instead, where the cookie is first-party; seeing the message means that was tried and did not produce a token either.',
    monitor_window_timeout: 'The renewal iframe was navigated but never came back with a response. Same causes as timed_out — blocked third-party cookies, or a CSP that will not let the response land — and the same answer: renew top-level rather than in the frame.',
};

/**
 * Failures of the renewal *mechanism* rather than refusals of the renewal.
 *
 * Each one is MSAL's hidden iframe not reporting back: it timed out, or it was
 * torn down before it could. Entra was never asked anything it declined — the
 * question never arrived — so the session is very likely still good, and the
 * same round trip taken top-level, where `login.microsoftonline.com` gets its
 * own cookie, usually returns a token without showing the user anything.
 *
 * `monitor_window_timeout` is MSAL v4's name for the same thing and is kept
 * here because a cached bundle can still be the one raising it.
 */
const IFRAME_MECHANISM_CODES: ReadonlySet<string> = new Set([
    'timed_out',
    'monitor_window_timeout',
    'iframe_closed_prematurely',
]);

/**
 * Whether this failure is the renewal iframe failing to report, which is the
 * one class of error worth answering with a top-level redirect that MSAL does
 * not raise as an `InteractionRequiredAuthError`.
 */
export function isIframeRenewalFailure(error: unknown): boolean {
    const code = typeof error === 'object' && error !== null
        ? (error as Record<string, unknown>)['errorCode']
        : undefined;

    return typeof code === 'string' && IFRAME_MECHANISM_CODES.has(code);
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
