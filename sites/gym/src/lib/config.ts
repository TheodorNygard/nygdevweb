// Where the page's identity settings live, and what they mean.
//
// Everything here is deliberately public. A SPA client id travels in the
// browser on every sign-in by design; what protects the flow is PKCE plus the
// registered redirect URI, not the secrecy of the id.

export interface InspectorConfig {
    clientId: string;
    tenant: string;
    loginScopes: string;
    interaction: Interaction;
    apiScope: string;
}

export type Interaction = 'redirect' | 'popup';

// The GymLog registration. It is the *front end* here — the app the page signs
// in as — so its id lands in the token's `appid`/`azp` claim, not in `aud`.
// The API that func-nygdev-api validates gets its own registration, and its
// App ID URI is what goes in the resource-scope box on the page.
export const DEFAULTS: InspectorConfig = {
    clientId: 'f6922f08-71f3-492d-953d-a294fb5acf16',

    // `organizations` rather than a tenant GUID, because the GUID is not
    // public and this file is. It resolves to whichever work/school tenant the
    // signing-in account belongs to, which for a single-tenant registration
    // can only be the one the app lives in — Entra rejects the rest. Put the
    // GUID in the box if you want the authority pinned.
    tenant: 'organizations',

    // offline_access is what makes Entra issue a refresh token, which is what
    // lets acquireTokenSilent renew without an iframe. Worth keeping: the
    // iframe path needs third-party cookies and fails quietly without them.
    loginScopes: 'openid profile offline_access',

    interaction: 'redirect',
    apiScope: '',
};

const STORAGE_KEY = 'gym.inspector.config';

// Exactly what MSAL will send as redirect_uri, so the value shown on the page
// is the value to paste into the portal rather than an approximation of it.
//
// Pinned to the origin root rather than built from location.pathname. Entra
// matches the registered URI as a string, and a page reached at /index.html
// rather than / would otherwise send a redirect_uri that differs from the one
// registered — the same site, one registration, and AADSTS50011 depending on
// how you happened to navigate to it. There is one page here, it lives at the
// root, and there is exactly one string to register.
export const REDIRECT_URI = `${window.location.origin}/`;

function isInteraction(value: unknown): value is Interaction {
    return value === 'redirect' || value === 'popup';
}

// Stored config is untrusted input: it is whatever is in this browser's
// localStorage, which a previous version of the page — or a typo in devtools —
// may have left in any shape at all. Each field is taken only when it is the
// type the rest of the code assumes, so a bad entry degrades to the default
// instead of reaching MSAL as, say, an object where a string belongs.
export function loadConfig(): InspectorConfig {
    let stored: unknown;

    try {
        stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    } catch {
        // Corrupt or unreadable (private mode, storage disabled). Defaults are
        // a working configuration on their own, so this is not worth reporting.
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
