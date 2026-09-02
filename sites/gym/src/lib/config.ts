// The page's identity settings. Everything here is deliberately public: a SPA
// client id travels in the browser on every sign-in by design, and what
// protects the flow is PKCE plus the registered redirect URI, not secrecy.

export interface InspectorConfig {
    clientId: string;
    tenant: string;
    loginScopes: string;
    interaction: Interaction;
    apiScope: string;
}

export type Interaction = 'redirect' | 'popup';

// The GymLog registration: the *front end*, the app the page signs in as, so
// its id lands in `appid`/`azp` and never in `aud`. The API has its own
// registration, whose App ID URI goes in the resource-scope box.
export const DEFAULTS: InspectorConfig = {
    clientId: 'f6922f08-71f3-492d-953d-a294fb5acf16',

    // Not a tenant GUID, because the GUID is not public and this file is. It
    // resolves to the signing-in account's work/school tenant, which for a
    // single-tenant registration can only be the app's own — Entra rejects the
    // rest. Put the GUID in the box to pin the authority.
    tenant: 'organizations',

    // offline_access is what makes Entra issue a refresh token, which is what
    // lets acquireTokenSilent renew without an iframe — and the iframe path
    // needs third-party cookies and fails quietly without them.
    loginScopes: 'openid profile offline_access',

    interaction: 'redirect',
    apiScope: '',
};

const STORAGE_KEY = 'gym.inspector.config';

// Exactly what MSAL sends as redirect_uri, so the value shown on the page is
// the one to paste into the portal. Pinned to the origin root rather than built
// from location.pathname: Entra matches the registered URI as a string, so a
// page reached at /index.html would send a different one and fail with
// AADSTS50011 depending on how you navigated to it.
export const REDIRECT_URI = `${window.location.origin}/`;

function isInteraction(value: unknown): value is Interaction {
    return value === 'redirect' || value === 'popup';
}

// Stored config is untrusted input: an older version of the page, or a typo in
// devtools, may have left any shape at all in localStorage. Each field is taken
// only at the type the rest of the code assumes, so a bad entry degrades to the
// default instead of reaching MSAL as an object where a string belongs.
export function loadConfig(): InspectorConfig {
    let stored: unknown;

    try {
        stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    } catch {
        // Corrupt or unreadable (private mode, storage disabled). The defaults
        // are a working configuration, so this is not worth reporting.
        stored = null;
    }

    if (typeof stored !== 'object' || stored === null) return { ...DEFAULTS };

    const raw = stored as Record<string, unknown>;
    const text = (key: keyof InspectorConfig, fallback: string): string =>
        typeof raw[key] === 'string' ? raw[key] : fallback;

    return {
        clientId: text('clientId', DEFAULTS.clientId),
        tenant: text('tenant', DEFAULTS.tenant),
        loginScopes: text('loginScopes', DEFAULTS.loginScopes),
        interaction: isInteraction(raw['interaction']) ? raw['interaction'] : DEFAULTS.interaction,
        apiScope: text('apiScope', DEFAULTS.apiScope),
    };
}

export function saveConfig(config: InspectorConfig): boolean {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(config));

        return true;
    } catch {
        return false;
    }
}

export function clearConfig(): void {
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch {
        // Nothing stored to remove.
    }
}

export function scopeList(value: string): string[] {
    return value.split(/[\s,]+/).filter(Boolean);
}
