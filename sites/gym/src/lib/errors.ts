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
    AADSTS50011: 'The redirect URI this page sent is not registered on the app. Copy the value from the Configuration panel above and add it under App registrations → Authentication → Add a platform → Single-page application. It has to match as a string, trailing slash included.',
    AADSTS9002326: 'The redirect URI is registered under the "Web" platform instead of "Single-page application". A SPA uses PKCE and sends no client secret, and Entra refuses that combination on a Web redirect URI. Move the URI to the SPA platform — the same string, a different platform block.',
    AADSTS700016: 'No application with this client ID exists in the tenant being signed in to. Check the client ID in the Configuration panel, and check the tenant: a single-tenant app is invisible from any directory but its own.',
    AADSTS650053: 'The tenant does not expose the scope that was asked for. Check the resource scope string against the API registration — it is the App ID URI plus a slash plus the scope name, and both halves have to match what is on the "Expose an API" blade.',
    AADSTS65001: 'The user or an administrator has not consented to this scope. Signing in again interactively will show the consent screen; if the scope requires admin consent, an administrator has to grant it on the registration first.',
    AADSTS500011: 'No resource principal was found for the App ID URI in the scope. Either the URI is wrong, or the API registration has no service principal in this tenant yet.',
    AADSTS900971: 'No reply address was sent. This usually means the app registration has no SPA redirect URI at all, so there was nothing for Entra to match against.',
    AADSTS7000215: 'Invalid client secret. A SPA should never send one — if this appears, the registration is being treated as a confidential client, which points at the redirect URI sitting under the "Web" platform.',
    AADSTS50194: 'The app is not configured as multi-tenant, and the request went to a shared endpoint. Put the tenant GUID in the Tenant box instead of common or organizations.',
    invalid_grant: 'The cached refresh token was rejected — usually a password change, a revoked session, or a Conditional Access policy that now demands a fresh sign-in. Sign out and sign in again.',
    interaction_required: 'Entra will not issue this token without asking the user something — consent, MFA, or a Conditional Access requirement. The interactive prompt handles it; if it appeared and you dismissed it, try again.',
    popup_window_error: 'The popup could not be opened, almost always because the browser blocked it. Allow popups for this site, or switch Interaction to Redirect in the Configuration panel.',
    user_cancelled: 'The sign-in window was closed before it finished. Nothing went wrong; press Sign in again.',
};

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
