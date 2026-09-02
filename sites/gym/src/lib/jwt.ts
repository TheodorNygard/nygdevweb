export interface DecodedJwt {
    parts: [string, string, string];
    header: Record<string, unknown>;
    payload: Record<string, unknown>;
}

// base64url, and the padding matters: atob rejects a string whose length is
// not a multiple of four, and base64url strips the '=' that would have made it
// one. Decoding through TextDecoder rather than reading atob's output directly
// is what keeps non-ASCII names (æ, ø, å) from arriving as mojibake — atob
// yields bytes, and those bytes are UTF-8.
export function base64UrlDecode(segment: string): string {
    const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));

    return new TextDecoder('utf-8').decode(bytes);
}

function asObject(value: unknown): Record<string, unknown> | null {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;
}

// Returns null for anything that is not a decodable JWS. That is a real case
// rather than an error: a Microsoft Graph access token is deliberately opaque
// to clients, and a token for a resource that has not opted into the v2 format
// can be too. The caller shows the raw string and says so.
export function decodeJwt(token: string | null | undefined): DecodedJwt | null {
    if (typeof token !== 'string') return null;

    const parts = token.split('.');

    if (parts.length !== 3) return null;

    const [rawHeader, rawPayload, signature] = parts as [string, string, string];

    try {
        const header = asObject(JSON.parse(base64UrlDecode(rawHeader)));
        const payload = asObject(JSON.parse(base64UrlDecode(rawPayload)));

        // A JWS whose segments decode to a bare string or an array is not a
        // JWT. Rejecting it here means the claims table only ever iterates
        // something with claims in it.
        if (!header || !payload) return null;

        return { parts: [rawHeader, rawPayload, signature], header, payload };
    } catch {
        return null;
    }
}

// A JWT time claim is seconds since the epoch. Reading one as milliseconds is
// the single most common way to misread these tokens, so the conversion lives
// in one place and the raw number stays on screen next to the formatted date.
export function expirySeconds(payload: Record<string, unknown>): number {
    return Number(payload['exp']);
}
