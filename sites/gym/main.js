// gym.nygard.dev — Entra ID token inspector.
//
// Sign in with MSAL, print what comes back. There is no backend and no API
// call: the page's whole output is the tokens themselves, decoded, the way
// jwt.ms decodes one you paste into it. The difference is that this one
// obtains them, so the request that produced a token is visible next to it.
//
// Three constraints shape the file:
//
//   1. `script-src 'self'` — MSAL is vendored at /vendor/msal-browser.min.js
//      and exposes a `msal` global. No CDN, no bundler, no import statements.
//   2. `connect-src https://login.microsoftonline.com` — the only origin the
//      page may talk to. Nothing here phones home, and the CSP is what makes
//      that checkable rather than a promise.
//   3. Token text reaches the DOM through `textContent`, never `innerHTML`.
//      A JWT is attacker-influenced input (anyone can sign in and a claim can
//      hold arbitrary text), so it is treated as data, not markup.

'use strict';

/* ------------------------------------------------------------- config -- */

// The GymLog registration. It is the *front end* here — the app the page signs
// in as — so its id lands in the token's `appid`/`azp` claim, not in `aud`.
// The API that func-nygdev-api validates gets its own registration, and its
// App ID URI is what goes in the resource-scope box further down.
//
// Not a secret. A SPA client id travels in the browser on every sign-in by
// design; what protects the flow is PKCE plus the registered redirect URI.
const DEFAULTS = {
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
// Query and hash are dropped: Entra matches the registered URI as a string and
// a stray `?` turns a correct registration into AADSTS50011.
const REDIRECT_URI = window.location.origin + window.location.pathname;

function loadConfig() {
    let stored = {};

    try {
        stored = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch {
        // Corrupt or unreadable (private mode, storage disabled). Defaults are
        // a working configuration on their own, so this is not worth reporting.
        stored = {};
    }

    return { ...DEFAULTS, ...stored };
}

function saveConfig(config) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
        return true;
    } catch {
        return false;
    }
}

const config = loadConfig();

/* ---------------------------------------------------------- elements -- */

const el = (id) => document.getElementById(id);

const themeToggle = el('themeToggle');
const themeIcon = themeToggle.querySelector('use');
const themeColorMeta = document.querySelector('meta[name="theme-color"]');

const signInButton = el('signInButton');
const signInText = el('signInText');
const signOutButton = el('signOutButton');
const statusEl = el('status');
const subtitleEl = el('subtitle');

const authErrorEl = el('authError');
const errCode = el('errCode');
const errMessage = el('errMessage');
const errCorrelation = el('errCorrelation');
const errCorrelationLabel = el('errCorrelationLabel');
const errFix = el('errFix');

const settingsEl = el('settings');
const settingsSummary = el('settingsSummary');
const clientIdInput = el('clientId');
const tenantInput = el('tenant');
const loginScopesInput = el('loginScopes');
const interactionSelect = el('interaction');
const redirectUriInput = el('redirectUri');

const accountCard = el('accountCard');
const accountGrid = el('accountGrid');
const accountEnv = el('accountEnv');

const idTokenCard = el('idTokenCard');
const idTokenRaw = el('idTokenRaw');
const idTokenExpiry = el('idTokenExpiry');
const idClaimsTable = el('idClaimsTable');
const idPayloadJson = el('idPayloadJson');
const idHeaderJson = el('idHeaderJson');

const accessCard = el('accessCard');
const apiScopeInput = el('apiScope');
const acquireButton = el('acquireButton');
const accessTokenBody = el('accessTokenBody');
const accessTokenEmpty = el('accessTokenEmpty');
const accessTokenRaw = el('accessTokenRaw');
const accessTokenExpiry = el('accessTokenExpiry');
const accessTokenOpaque = el('accessTokenOpaque');
const copyAccessToken = el('copyAccessToken');
const atClaimsTable = el('atClaimsTable');
const atPayloadJson = el('atPayloadJson');
const atHeaderJson = el('atHeaderJson');
const atResultJson = el('atResultJson');

const signedOutCard = el('signedOutCard');

el('year').textContent = new Date().getFullYear();

/* ------------------------------------------------------------- theme -- */

// Same mechanism as sites/run: data-theme on <html> so `color-scheme` reaches
// the page canvas, and both values stamped explicitly so a reader who picked
// light is not overridden by a dark OS.
function setThemeColor(dark) {
    themeColorMeta.setAttribute('content', dark ? '#121212' : '#f8f9fa');
}

function applyTheme(dark) {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    themeIcon.setAttribute('href', dark ? '#sun-icon' : '#moon-icon');
    themeToggle.setAttribute('aria-pressed', String(dark));
    setThemeColor(dark);
}

function initTheme() {
    let stored = null;

    try {
        stored = localStorage.getItem('theme');
    } catch { /* storage unavailable; fall through to the OS preference */ }

    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');

    applyTheme(stored === 'dark' || (!stored && prefersDark.matches));
}

themeToggle.addEventListener('click', () => {
    const dark = document.documentElement.getAttribute('data-theme') !== 'dark';

    applyTheme(dark);

    try {
        localStorage.setItem('theme', dark ? 'dark' : 'light');
    } catch { /* nothing to do; the toggle still works for this page view */ }
});

initTheme();

/* --------------------------------------------------------------- jwt -- */

// base64url, and the padding matters: atob rejects a string whose length is
// not a multiple of four, and base64url strips the '=' that would have made it
// one. Decoding through TextDecoder rather than reading atob's output directly
// is what keeps non-ASCII names (æ, ø, å) from arriving as mojibake — atob
// yields bytes, and those bytes are UTF-8.
function base64UrlDecode(segment) {
    const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));

    return new TextDecoder('utf-8').decode(bytes);
}

// Returns null for anything that is not a decodable JWS. That is a real case
// rather than an error: a Microsoft Graph access token is deliberately opaque
// to clients, and a token for a resource that has not opted into the v2 format
// can be too. The caller shows the raw string and says so.
function decodeJwt(token) {
    if (typeof token !== 'string') return null;

    const parts = token.split('.');

    if (parts.length !== 3) return null;

    try {
        return {
            parts,
            header: JSON.parse(base64UrlDecode(parts[0])),
            payload: JSON.parse(base64UrlDecode(parts[1])),
        };
    } catch {
        return null;
    }
}

/* ---------------------------------------------------------- claim map -- */

// What each claim is, in one line. Only claims Entra actually mints are here;
// anything unlisted still renders, just without the third column. Sources:
// the Microsoft identity platform token reference for v1.0 and v2.0.
const CLAIM_ABOUT = {
    acr: 'Authentication context class (v1.0 tokens).',
    acrs: 'Auth context IDs the token satisfies, for Conditional Access.',
    aio: 'Opaque blob Entra uses internally. Not for clients to read.',
    amr: 'How the user authenticated — pwd, mfa, rsa, otp, fido.',
    app_displayname: 'Display name of the client application.',
    appid: 'Client that requested the token (v1.0 spelling of azp).',
    appidacr: 'How the client authenticated: 0 public, 1 secret, 2 certificate.',
    at_hash: 'Hash of the access token issued alongside this ID token.',
    aud: 'Who the token is for. The resource must find itself here or reject it.',
    auth_time: 'When the user actually authenticated, as opposed to when this token was minted.',
    azp: 'Authorized party — the client that obtained the token.',
    azpacr: 'How that client authenticated: 0 public, 1 secret, 2 certificate.',
    c_hash: 'Hash of the authorization code this token was exchanged for.',
    ctry: 'Country the user signed in from.',
    email: 'Addressable email. Present only when the account has one.',
    exp: 'Not valid after. A validator that skips this check has no expiry.',
    family_name: 'Surname.',
    fwd: 'IP address of the original requester when the token was forwarded.',
    given_name: 'First name.',
    groups: 'Group object IDs the user belongs to. Omitted, or replaced by _claim_names, once it would overflow the token.',
    hasgroups: 'Set instead of `groups` when the list was too long for the token.',
    idp: 'Identity provider, when it is not the issuing tenant itself.',
    idtyp: 'app for an app-only token, absent for a user token.',
    in_corp: 'Signed in from the corporate network.',
    ipaddr: 'IP address the user signed in from.',
    iss: 'Issuer. Pin this — a v2.0 issuer ends in /v2.0 and a v1.0 one does not.',
    iat: 'Issued at.',
    login_hint: 'Opaque hint that can be passed back to skip account selection.',
    name: 'Human-readable display name. Mutable — never use it as an identifier.',
    nbf: 'Not valid before.',
    nonce: 'Value the client sent, echoed back to bind the token to that request.',
    oid: 'Immutable object ID of the user in this tenant. The identifier to key data on.',
    onprem_sid: 'On-premises Active Directory SID, for accounts synced from AD.',
    preferred_username: 'Primary way of addressing the user. Mutable and reassignable.',
    pwd_exp: 'Seconds until the password expires.',
    pwd_url: 'Where the user can go to change their password.',
    rh: 'Opaque, internal to Entra.',
    roles: 'App roles assigned to the user or app for this resource.',
    scp: 'Delegated permissions granted, space-separated. Absent on app-only tokens.',
    sid: 'Session ID, for front-channel sign-out.',
    sub: 'Subject: the user, pairwise per application. Differs across apps for the same person.',
    tenant_region_scope: 'Region the tenant is homed in.',
    tid: 'Tenant the account belongs to.',
    uti: 'Unique token identifier. Quote it in a support case.',
    upn: 'User principal name (v1.0 tokens).',
    unique_name: 'Human-readable identifier (v1.0 tokens).',
    ver: 'Token version. 2.0 or 1.0, and it decides which spellings above apply.',
    wids: 'Directory role template IDs — tenant-wide roles, not app roles.',
    xms_cc: 'Client capabilities, e.g. cp1 for Continuous Access Evaluation.',
    xms_edov: 'Whether the email domain is owned and verified by the tenant.',
    xms_pl: 'User preferred language.',
    xms_st: 'Supplementary identifiers, such as the subject in another format.',
    xms_tpl: 'Tenant preferred language.',
};

// Claims a reader looks for first, in the order they want them. Everything
// else follows alphabetically, so an unfamiliar claim is easy to spot rather
// than scattered through the familiar ones.
const CLAIM_ORDER = [
    'aud', 'iss', 'ver', 'tid', 'oid', 'sub',
    'name', 'preferred_username', 'upn', 'email',
    'scp', 'roles', 'wids',
    'appid', 'azp', 'azpacr', 'appidacr', 'idtyp',
    'iat', 'nbf', 'exp', 'auth_time',
    'amr', 'nonce',
];

const TIME_CLAIMS = new Set(['exp', 'iat', 'nbf', 'auth_time', 'pwd_exp']);

/* ------------------------------------------------------------ format -- */

const timeFormat = new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'medium',
});

// Intl.RelativeTimeFormat is what makes "in 42 minutes" say it in the reader's
// locale rather than in English with the rest of the page translated around it.
const relativeFormat = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

const RELATIVE_UNITS = [
    ['year', 31536000],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
    ['second', 1],
];

function relativeSeconds(seconds) {
    const abs = Math.abs(seconds);

    for (const [unit, size] of RELATIVE_UNITS) {
        if (abs >= size || unit === 'second') {
            return relativeFormat.format(Math.round(seconds / size), unit);
        }
    }

    return '';
}

// A JWT time claim is seconds since the epoch; Date wants milliseconds. Getting
// that wrong puts every timestamp in 1970 and is the single most common way to
// misread one of these tokens, which is why the raw number stays on screen next
// to the formatted date rather than being replaced by it.
function formatEpoch(value) {
    const seconds = Number(value);

    if (!Number.isFinite(seconds)) return null;

    const date = new Date(seconds * 1000);

    if (Number.isNaN(date.getTime())) return null;

    return {
        absolute: timeFormat.format(date),
        relative: relativeSeconds(seconds - Date.now() / 1000),
    };
}

function formatClaimValue(value) {
    if (Array.isArray(value)) return value.join(' ');
    if (value === null) return 'null';
    if (typeof value === 'object') return JSON.stringify(value);

    return String(value);
}

/* -------------------------------------------------------------- copy -- */

// The clipboard API needs a secure context and a user gesture; both hold here.
// The fallback is a selection rather than document.execCommand, which is
// deprecated and, on a token this long, was never reliable anyway.
async function copyToClipboard(text, button) {
    const original = button.textContent;

    try {
        await navigator.clipboard.writeText(text);
        button.textContent = 'Copied';
    } catch {
        button.textContent = 'Press Ctrl/Cmd+C';

        const target = button.closest('.card').querySelector('pre.jwt, input');

        if (target && target.select) target.select();
    }

    window.setTimeout(() => { button.textContent = original; }, 1800);
}

/* ------------------------------------------------------------ render -- */

function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
}

function setStatus(message, kind) {
    statusEl.textContent = message || '';
    statusEl.className = 'status' + (kind ? ' ' + kind : '');
}

// Three coloured spans and two dots. The dots are separate nodes so the
// segment boundaries are visible even to a reader who cannot tell the colours
// apart, and the legend under the block names them in the same order.
function renderRawJwt(node, token) {
    clear(node);

    const parts = token.split('.');
    const classes = ['seg-h', 'seg-p', 'seg-s'];

    parts.forEach((part, index) => {
        if (index > 0) {
            const dot = document.createElement('span');

            dot.className = 'seg-dot';
            dot.textContent = '.';
            node.appendChild(dot);
        }

        const span = document.createElement('span');

        span.className = classes[index] || 'seg-s';
        span.textContent = part;
        node.appendChild(span);
    });
}

function renderClaimsTable(table, payload) {
    clear(table);

    const head = document.createElement('thead');
    const headRow = document.createElement('tr');

    for (const label of ['Claim', 'Value', 'What it is']) {
        const th = document.createElement('th');

        th.textContent = label;
        headRow.appendChild(th);
    }

    head.appendChild(headRow);
    table.appendChild(head);

    const body = document.createElement('tbody');
    const keys = Object.keys(payload);
    const known = CLAIM_ORDER.filter((key) => keys.includes(key));
    const rest = keys.filter((key) => !CLAIM_ORDER.includes(key)).sort();

    for (const key of [...known, ...rest]) {
        const row = document.createElement('tr');

        const nameCell = document.createElement('td');

        nameCell.className = 'claim-name';
        nameCell.textContent = key;
        row.appendChild(nameCell);

        const valueCell = document.createElement('td');

        valueCell.className = 'claim-value';

        const stack = document.createElement('div');

        stack.className = 'stack';

        const raw = document.createElement('span');

        raw.textContent = formatClaimValue(payload[key]);
        stack.appendChild(raw);

        if (TIME_CLAIMS.has(key)) {
            const moment = formatEpoch(payload[key]);

            if (moment) {
                const when = document.createElement('span');

                when.className = 'claim-extra';
                when.textContent = moment.absolute + ' · ' + moment.relative;
                stack.appendChild(when);
            }
        }

        valueCell.appendChild(stack);
        row.appendChild(valueCell);

        const aboutCell = document.createElement('td');

        aboutCell.className = 'claim-about';
        aboutCell.textContent = CLAIM_ABOUT[key] || '';
        row.appendChild(aboutCell);

        body.appendChild(row);
    }

    table.appendChild(body);
}

function renderJson(node, value) {
    node.textContent = JSON.stringify(value, null, 2);
}

function renderExpiryPill(pill, expSeconds) {
    if (!Number.isFinite(expSeconds)) {
        pill.hidden = true;

        return;
    }

    const remaining = expSeconds - Date.now() / 1000;

    pill.hidden = false;
    pill.className = 'pill ' + (remaining > 0 ? 'valid' : 'expired');
    pill.textContent = remaining > 0
        ? 'Expires ' + relativeSeconds(remaining)
        : 'Expired ' + relativeSeconds(remaining);
}

// Pills carry a relative time, so they go stale just by being looked at. One
// timer redraws whichever are on screen; the registry is rebuilt on each
// render so a replaced token does not leave its predecessor's pill ticking.
const expiryPills = [];

function trackExpiry(pill, expSeconds) {
    const index = expiryPills.findIndex((entry) => entry.pill === pill);

    if (index >= 0) expiryPills.splice(index, 1);
    if (Number.isFinite(expSeconds)) expiryPills.push({ pill, exp: expSeconds });

    renderExpiryPill(pill, expSeconds);
}

window.setInterval(() => {
    for (const entry of expiryPills) renderExpiryPill(entry.pill, entry.exp);
}, 1000);

function renderAccount(account) {
    clear(accountGrid);

    const facts = [
        ['Name', account.name || '—', true],
        ['Username', account.username || '—', false],
        ['Object ID (oid)', account.localAccountId || '—', false],
        ['Tenant (tid)', account.tenantId || '—', false],
        ['Home account ID', account.homeAccountId || '—', false],
    ];

    for (const [label, value, plain] of facts) {
        const wrap = document.createElement('div');

        const labelEl = document.createElement('div');

        labelEl.className = 'fact-label';
        labelEl.textContent = label;
        wrap.appendChild(labelEl);

        const valueEl = document.createElement('div');

        valueEl.className = 'fact-value' + (plain ? ' plain' : '');
        valueEl.textContent = value;
        wrap.appendChild(valueEl);

        accountGrid.appendChild(wrap);
    }

    accountEnv.textContent = account.environment || 'login.microsoftonline.com';
}

/* -------------------------------------------------------- token views -- */

let currentIdToken = null;
let currentAccessToken = null;

function showIdToken(token) {
    currentIdToken = token || null;

    if (!token) {
        idTokenCard.hidden = true;

        return;
    }

    idTokenCard.hidden = false;
    renderRawJwt(idTokenRaw, token);

    const decoded = decodeJwt(token);

    if (!decoded) {
        // An ID token that will not decode is a bug worth seeing rather than
        // hiding: it means something upstream handed back a value that is not
        // a JWS at all.
        clear(idClaimsTable);
        idPayloadJson.textContent = 'Not a decodable JWT.';
        idHeaderJson.textContent = 'Not a decodable JWT.';
        trackExpiry(idTokenExpiry, NaN);

        return;
    }

    renderClaimsTable(idClaimsTable, decoded.payload);
    renderJson(idPayloadJson, decoded.payload);
    renderJson(idHeaderJson, decoded.header);
    trackExpiry(idTokenExpiry, Number(decoded.payload.exp));
}

function showAccessToken(result) {
    currentAccessToken = result ? result.accessToken : null;

    if (!result || !result.accessToken) {
        accessTokenBody.hidden = true;
        accessTokenEmpty.hidden = false;
        accessTokenExpiry.hidden = true;
        copyAccessToken.hidden = true;

        return;
    }

    accessTokenBody.hidden = false;
    accessTokenEmpty.hidden = true;
    copyAccessToken.hidden = false;

    renderRawJwt(accessTokenRaw, result.accessToken);

    // The AuthenticationResult, minus the tokens themselves — they are already
    // on screen in full, and repeating them here would only make the panel
    // harder to read. `fromCache` is the interesting field: a token MSAL served
    // from its own cache never touched the network on this click.
    renderJson(atResultJson, {
        scopes: result.scopes,
        tokenType: result.tokenType,
        expiresOn: result.expiresOn,
        extExpiresOn: result.extExpiresOn,
        fromCache: result.fromCache,
        correlationId: result.correlationId,
        authority: result.authority,
        uniqueId: result.uniqueId,
        tenantId: result.tenantId,
        account: result.account ? result.account.homeAccountId : null,
    });

    const decoded = decodeJwt(result.accessToken);

    if (!decoded) {
        // Expected, not broken. Microsoft Graph issues access tokens the
        // client is not meant to read, and a resource that has not opted into
        // the v2 access token format can do the same. Say which case this is
        // rather than showing an empty claims table.
        accessTokenOpaque.hidden = false;
        accessTokenOpaque.textContent =
            'This access token is opaque — it is not a readable JWS, so there are no '
            + 'claims to show. That is normal for Microsoft Graph and for any resource '
            + 'that has not opted into the readable v2 format. The token is still valid; '
            + 'only the resource it was minted for is meant to look inside it. Ask for a '
            + 'scope on your own API registration to get one you can read.';

        clear(atClaimsTable);
        atPayloadJson.textContent = 'Opaque token — no readable payload.';
        atHeaderJson.textContent = 'Opaque token — no readable header.';
        trackExpiry(accessTokenExpiry, result.expiresOn
            ? new Date(result.expiresOn).getTime() / 1000
            : NaN);

        return;
    }

    accessTokenOpaque.hidden = true;
    renderClaimsTable(atClaimsTable, decoded.payload);
    renderJson(atPayloadJson, decoded.payload);
    renderJson(atHeaderJson, decoded.header);
    trackExpiry(accessTokenExpiry, Number(decoded.payload.exp));
}

/* -------------------------------------------------------------- tabs -- */

// One delegated listener per tablist. Selecting a tab is the only state, and
// it lives in aria-selected rather than a parallel variable, so the thing
// screen readers are told and the thing the CSS styles cannot disagree.
function wireTabs(tablist) {
    const tabs = Array.from(tablist.querySelectorAll('[role="tab"]'));

    function select(tab) {
        for (const other of tabs) {
            const selected = other === tab;

            other.setAttribute('aria-selected', String(selected));
            other.tabIndex = selected ? 0 : -1;
            el(other.getAttribute('aria-controls')).hidden = !selected;
        }
    }

    tablist.addEventListener('click', (event) => {
        const tab = event.target.closest('[role="tab"]');

        if (tab) select(tab);
    });

    // Arrow keys move between tabs, which is what the tablist role promises a
    // keyboard user. Without this the role is a lie and Tab is the only way in.
    tablist.addEventListener('keydown', (event) => {
        const index = tabs.indexOf(document.activeElement);

        if (index < 0) return;

        let next = null;

        if (event.key === 'ArrowRight') next = tabs[(index + 1) % tabs.length];
        if (event.key === 'ArrowLeft') next = tabs[(index - 1 + tabs.length) % tabs.length];
        if (event.key === 'Home') next = tabs[0];
        if (event.key === 'End') next = tabs[tabs.length - 1];

        if (next) {
            event.preventDefault();
            select(next);
            next.focus();
        }
    });

    for (const tab of tabs) {
        tab.tabIndex = tab.getAttribute('aria-selected') === 'true' ? 0 : -1;
    }
}

for (const tablist of document.querySelectorAll('[role="tablist"]')) wireTabs(tablist);

/* ------------------------------------------------------------ errors -- */

// The AADSTS code is the part worth acting on, and it is buried in the middle
// of a paragraph of prose that also contains a trace ID and a timestamp. Pull
// it out so it can be shown on its own and matched against the table below.
function extractAadsts(message) {
    const match = /AADSTS\d+/.exec(message || '');

    return match ? match[0] : null;
}

// Failures that mean something specific about *this* setup, with the fix
// rather than a restatement of the error. Everything unlisted falls through to
// the raw message, which is better than a wrong guess.
const ERROR_FIXES = {
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

function showAuthError(error) {
    const message = (error && (error.errorMessage || error.message)) || String(error);
    const code = (error && error.errorCode) || null;
    const aadsts = extractAadsts(message);

    errCode.textContent = [code, aadsts].filter(Boolean).join(' · ') || 'unknown';
    errMessage.textContent = message;

    const correlationId = error && error.correlationId;

    errCorrelation.textContent = correlationId || '';
    errCorrelation.hidden = !correlationId;
    errCorrelationLabel.hidden = !correlationId;

    const fix = ERROR_FIXES[aadsts] || ERROR_FIXES[code];

    errFix.textContent = fix || '';
    errFix.hidden = !fix;

    authErrorEl.classList.add('visible');
}

function clearAuthError() {
    authErrorEl.classList.remove('visible');
}

/* -------------------------------------------------------------- msal -- */

const msalConfig = {
    auth: {
        clientId: config.clientId,
        authority: 'https://login.microsoftonline.com/' + config.tenant,
        redirectUri: REDIRECT_URI,
        postLogoutRedirectUri: REDIRECT_URI,

        // Land back on this page rather than on whatever URL started the
        // sign-in. With one page that is the same thing; setting it explicitly
        // keeps the redirect URI the page shows and the URL it returns to from
        // drifting apart if a second page is ever added.
        navigateToLoginRequestUrl: false,
    },
    cache: {
        // sessionStorage, not localStorage: tokens die with the tab. A token
        // inspector that leaves live credentials on disk after the window is
        // closed is a worse tool than one that makes you sign in again.
        cacheLocation: 'sessionStorage',
        storeAuthStateInCookie: false,
    },
    system: {
        loggerOptions: {
            // Silent by default. MSAL's verbose logging prints tokens, and
            // this page already shows them where they can be seen deliberately
            // rather than left in a console someone screen-shares.
            loggerCallback: () => {},
            piiLoggingEnabled: false,
        },
    },
};

let pca = null;
let activeAccount = null;

function scopeList(value) {
    return String(value || '').split(/[\s,]+/).filter(Boolean);
}

function setSignedInUi(account) {
    activeAccount = account || null;

    const signedIn = Boolean(account);

    signedOutCard.hidden = signedIn;
    accountCard.hidden = !signedIn;
    accessCard.hidden = !signedIn;
    signOutButton.hidden = !signedIn;
    signInText.textContent = signedIn ? 'Switch account' : 'Sign in';

    if (signedIn) {
        renderAccount(account);
        subtitleEl.textContent = 'Signed in as ' + (account.username || account.name || 'an account') + '.';
    } else {
        idTokenCard.hidden = true;
        showAccessToken(null);
        subtitleEl.textContent = 'Sign in with Entra ID and read what comes back.';
    }
}

function busy(button, on) {
    button.classList.toggle('loading', on);
    button.disabled = on;
}

async function signIn() {
    clearAuthError();
    setStatus('Redirecting to Entra ID…', 'working');
    busy(signInButton, true);

    const request = {
        scopes: scopeList(config.loginScopes),

        // Always show the account picker. On a page whose job is comparing
        // tokens, being silently reattached to the account from an hour ago is
        // the wrong default — "Switch account" has to actually switch.
        prompt: 'select_account',
    };

    try {
        if (config.interaction === 'popup') {
            const result = await pca.loginPopup(request);

            handleResult(result);
        } else {
            // Does not return: the browser navigates away. Anything after this
            // line runs only if the redirect itself failed to start.
            await pca.loginRedirect(request);
        }
    } catch (error) {
        showAuthError(error);
        setStatus('Sign-in failed.', 'error');
    } finally {
        busy(signInButton, false);
    }
}

async function signOut() {
    clearAuthError();
    setStatus('Signing out…', 'working');

    const request = { account: activeAccount };

    try {
        if (config.interaction === 'popup') {
            await pca.logoutPopup(request);
            setSignedInUi(null);
            setStatus('Signed out.', 'success');
        } else {
            await pca.logoutRedirect(request);
        }
    } catch (error) {
        showAuthError(error);
        setStatus('Sign-out failed.', 'error');
    }
}

async function acquireAccessToken() {
    const scope = apiScopeInput.value.trim();

    if (!scope) {
        setStatus('Enter a resource scope first.', 'error');
        apiScopeInput.focus();

        return;
    }

    config.apiScope = scope;
    saveConfig(config);

    clearAuthError();
    busy(acquireButton, true);
    setStatus('Requesting a token for ' + scope + '…', 'working');

    const request = { scopes: [scope], account: activeAccount };

    try {
        const result = await pca.acquireTokenSilent(request);

        showAccessToken(result);
        setStatus(result.fromCache
            ? 'Token served from the MSAL cache — no network call.'
            : 'Token acquired silently.', 'success');
    } catch (error) {
        // InteractionRequiredAuthError is the expected failure, not an
        // exceptional one: it is how Entra says "ask the user something". Any
        // other error is a real problem and is reported rather than retried,
        // because retrying interactively would just show the same failure with
        // a login screen in front of it.
        if (!(error instanceof msal.InteractionRequiredAuthError)) {
            showAuthError(error);
            setStatus('Could not get a token.', 'error');
            busy(acquireButton, false);

            return;
        }

        setStatus('Silent request needs interaction — prompting…', 'working');

        try {
            if (config.interaction === 'popup') {
                const result = await pca.acquireTokenPopup(request);

                showAccessToken(result);
                setStatus('Token acquired interactively.', 'success');
            } else {
                await pca.acquireTokenRedirect(request);
            }
        } catch (interactiveError) {
            showAuthError(interactiveError);
            setStatus('Could not get a token.', 'error');
        }
    } finally {
        busy(acquireButton, false);
    }
}

// One place that turns an AuthenticationResult into what is on screen, so a
// result arriving from a redirect and one arriving from a popup are rendered
// by the same code rather than by two that drift.
function handleResult(result) {
    if (!result) return;

    if (result.account) {
        pca.setActiveAccount(result.account);
        setSignedInUi(result.account);
    }

    if (result.idToken) showIdToken(result.idToken);

    // A login response carries an access token too, but for the sign-in scopes
    // rather than for an API. Only render it when the scopes asked for are the
    // resource scopes, or the ID token panel and the access token panel end up
    // showing two views of the same uninteresting thing.
    const scopes = result.scopes || [];
    const isResourceToken = scopes.some((scope) => scope.includes('/') || scope.startsWith('api://'));

    if (result.accessToken && isResourceToken) showAccessToken(result);
}

/* ---------------------------------------------------------- settings -- */

function fillSettingsForm() {
    clientIdInput.value = config.clientId;
    tenantInput.value = config.tenant;
    loginScopesInput.value = config.loginScopes;
    interactionSelect.value = config.interaction;
    redirectUriInput.value = REDIRECT_URI;
    apiScopeInput.value = config.apiScope;

    settingsSummary.textContent = config.clientId + ' · ' + config.tenant;
    el('signedOutClientId').textContent = config.clientId;
    el('signedOutTenant').textContent = config.tenant;
}

el('saveSettings').addEventListener('click', () => {
    const next = {
        clientId: clientIdInput.value.trim() || DEFAULTS.clientId,
        tenant: tenantInput.value.trim() || DEFAULTS.tenant,
        loginScopes: loginScopesInput.value.trim() || DEFAULTS.loginScopes,
        interaction: interactionSelect.value,
        apiScope: apiScopeInput.value.trim(),
    };

    if (!saveConfig(next)) {
        setStatus('Could not save — localStorage is unavailable in this browser context.', 'error');

        return;
    }

    // A reload rather than a live rebuild. MSAL reads clientId and authority
    // once, at construction, and a PublicClientApplication cannot be
    // reconfigured afterwards; recreating it while a cached account from the
    // previous client id is still in sessionStorage is how you get errors that
    // name neither configuration. Starting over is the honest way to apply it.
    window.location.reload();
});

el('resetSettings').addEventListener('click', () => {
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch { /* nothing stored to remove */ }

    window.location.reload();
});

el('copyRedirect').addEventListener('click', (event) => {
    copyToClipboard(REDIRECT_URI, event.currentTarget);
});

el('copyIdToken').addEventListener('click', (event) => {
    if (currentIdToken) copyToClipboard(currentIdToken, event.currentTarget);
});

copyAccessToken.addEventListener('click', (event) => {
    if (currentAccessToken) copyToClipboard(currentAccessToken, event.currentTarget);
});

signInButton.addEventListener('click', signIn);
signOutButton.addEventListener('click', signOut);
acquireButton.addEventListener('click', acquireAccessToken);

apiScopeInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
        event.preventDefault();
        acquireAccessToken();
    }
});

/* ----------------------------------------------------------- startup -- */

async function start() {
    fillSettingsForm();

    if (typeof msal === 'undefined') {
        // The vendored bundle did not load or was blocked. Say which, because
        // "nothing happens when I press sign in" is otherwise indistinguishable
        // from a configuration problem.
        setStatus('MSAL did not load. /vendor/msal-browser.min.js is missing or was blocked by the content security policy.', 'error');
        signInButton.disabled = true;

        return;
    }

    el('msalVersion').textContent = 'msal-browser ' + msal.version;

    try {
        pca = new msal.PublicClientApplication(msalConfig);

        // Required since MSAL v3: the constructor no longer does the async
        // setup, and every other call throws until this resolves.
        await pca.initialize();

        // Must run before anything reads the account list. Coming back from a
        // redirect, this is the call that consumes the response in the URL
        // fragment and turns it into an AuthenticationResult; skipping it
        // leaves the token in the address bar and the page looking signed out.
        const redirectResult = await pca.handleRedirectPromise();

        if (redirectResult) {
            handleResult(redirectResult);
            setStatus('Signed in.', 'success');
        } else {
            const accounts = pca.getAllAccounts();

            if (accounts.length > 0) {
                const account = pca.getActiveAccount() || accounts[0];

                pca.setActiveAccount(account);
                setSignedInUi(account);

                // The ID token is not on the account object, only its claims
                // are. Re-deriving the raw JWT would mean a network call, so
                // the panel stays closed until a sign-in produces one — which
                // is the honest state: this is the token from *this* session.
                setStatus('Restored a session from this tab. Sign in again to see a fresh ID token.', 'success');
            } else {
                setSignedInUi(null);
            }
        }
    } catch (error) {
        showAuthError(error);
        setStatus('Could not start MSAL.', 'error');
    }
}

start();
