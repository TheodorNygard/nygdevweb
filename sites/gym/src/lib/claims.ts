// What each claim is, in one line. Only claims Entra actually mints are here;
// anything unlisted still renders, just without the third column. Sources:
// the Microsoft identity platform token reference for v1.0 and v2.0.
export const CLAIM_ABOUT: Record<string, string> = {
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
export const CLAIM_ORDER = [
    'aud', 'iss', 'ver', 'tid', 'oid', 'sub',
    'name', 'preferred_username', 'upn', 'email',
    'scp', 'roles', 'wids',
    'appid', 'azp', 'azpacr', 'appidacr', 'idtyp',
    'iat', 'nbf', 'exp', 'auth_time',
    'amr', 'nonce',
];

export const TIME_CLAIMS = new Set(['exp', 'iat', 'nbf', 'auth_time', 'pwd_exp']);

// The order the table renders in: known claims first in CLAIM_ORDER's order,
// then everything else alphabetically.
export function orderClaims(payload: Record<string, unknown>): string[] {
    const keys = Object.keys(payload);
    const known = CLAIM_ORDER.filter((key) => keys.includes(key));
    const rest = keys.filter((key) => !CLAIM_ORDER.includes(key)).sort();

    return [...known, ...rest];
}
