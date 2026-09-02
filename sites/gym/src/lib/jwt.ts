export interface DecodedJwt {
    parts: [string, string, string];
    header: Record<string, unknown>;
    payload: Record<string, unknown>;
}

// The padding matters: atob rejects a length that is not a multiple of four,
// and base64url strips the '=' that would have made it one. Decoding through
// TextDecoder keeps non-ASCII names (æ, ø, å) from arriving as mojibake —
// atob yields bytes, and those bytes are UTF-8.
function base64UrlDecode(segment: string): string {
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

// null for anything that is not a decodable JWS. That is a real case, not an
// error: a Microsoft Graph access token is deliberately opaque to clients, and
// so is one for any resource that has not opted into the v2 format.
export function decodeJwt(token: string | null | undefined): DecodedJwt | null {
    if (typeof token !== 'string') return null;

    const parts = token.split('.');

    if (parts.length !== 3) return null;

    const [rawHeader, rawPayload, signature] = parts as [string, string, string];

    try {
        const header = asObject(JSON.parse(base64UrlDecode(rawHeader)));
        const payload = asObject(JSON.parse(base64UrlDecode(rawPayload)));

        // A JWS whose segments decode to a bare string or an array is not a
        // JWT; rejecting it here keeps the claims table iterating claims.
        if (!header || !payload) return null;

        return { parts: [rawHeader, rawPayload, signature], header, payload };
    } catch {
        return null;
    }
}
