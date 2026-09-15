// The one thing the app remembers about renewal across a trip to Entra and
// back: that it has already taken one.
//
// Renewal itself needs no bookkeeping here, because MSAL already has it. Entra
// caps a SPA's refresh token at 24 hours and says so on the wire —
// `refresh_token_expires_in`, which MSAL stores as the entity's `expiresOn` —
// so `acquireTokenSilent` can tell a session it can renew from one it cannot
// without asking anybody. What it does *after* that is the part worth choosing:
// left to itself it falls back to a hidden iframe, which needs a third-party
// cookie for `login.microsoftonline.com` and, where the browser withholds one,
// hangs for ten seconds and fails with `timed_out`. `useAuth` therefore asks
// for a policy that stops at the refresh token, and answers the immediate
// failure by going to Entra top-level, where the cookie is first-party.
//
// That is a redirect the app takes by itself, so it needs exactly one guard.

/**
 * That an automatic renewal redirect has been spent. `sessionStorage`, because
 * the guard is about *this* navigation chain: it has to survive the trip to
 * Entra and back, and it must not still be standing a week later.
 */
const REDIRECT_SPENT_KEY = 'gym.renewal.redirect-spent';

/**
 * How long one spent redirect blocks the next.
 *
 * The failure this guards against is a token that cannot be acquired *at all*:
 * redirect, come back, fail identically, redirect again — a page bouncing to
 * Entra under a thumb halfway through logging a set. That loop closes in
 * seconds, so anything longer than the round trip catches it. Five minutes also
 * clears long before a refresh token's next expiry, so an honest second renewal
 * later in the same tab is not blocked by the first one having happened.
 */
const REDIRECT_COOLDOWN_MS = 5 * 60 * 1000;

// Storage access is wrapped. Reading `window.sessionStorage` throws outright
// where site data is blocked, `setItem` can throw under a private-mode quota,
// and none of it is worth failing a token acquisition over — a guard that
// cannot be written simply is not there, which is where this app was before it
// redirected by itself at all.
function readSpentAt(): number | null {
    try {
        const raw = window.sessionStorage.getItem(REDIRECT_SPENT_KEY);

        if (!raw) return null;

        const at = Number(raw);

        return Number.isFinite(at) ? at : null;
    } catch {
        return null;
    }
}

/**
 * Take the one automatic renewal redirect available, if it has not been taken
 * recently. Returns false when it has — the caller shows the failure and offers
 * the redirect as a button instead, which is what the app did for all of these
 * before it did any of them by itself.
 */
export function claimRenewalRedirect(): boolean {
    const spentAt = readSpentAt();

    if (spentAt !== null && Date.now() - spentAt < REDIRECT_COOLDOWN_MS) return false;

    try {
        window.sessionStorage.setItem(REDIRECT_SPENT_KEY, String(Date.now()));
    } catch {
        // See above: no guard, but also no reason to withhold the redirect.
    }

    return true;
}

/**
 * Hand the redirect back. Called when a token arrives — the chain ended in a
 * token, so it was not a loop — and when the user asks for a sign-in
 * themselves, which supersedes whatever the app tried on its own.
 */
export function releaseRenewalRedirect(): void {
    try {
        window.sessionStorage.removeItem(REDIRECT_SPENT_KEY);
    } catch {
        // As above.
    }
}
