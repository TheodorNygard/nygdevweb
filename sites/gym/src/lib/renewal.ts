// What the app remembers about silent renewal, across a page load and across a
// redirect to Entra and back.
//
// MSAL renews silently two ways. The refresh token is the good one: a POST to
// the token endpoint, no frames, no cookies, works everywhere. Entra caps a
// SPA's refresh token at **24 hours** and will not extend it, so a session left
// alone overnight — which is every session this app has, a logbook opened at
// the gym — comes back with nothing to redeem. MSAL then falls to its hidden
// iframe, and the iframe needs a third-party cookie for
// `login.microsoftonline.com`. Where the browser blocks that, Entra renders a
// sign-in page inside the frame instead of redirecting back, nothing ever
// reaches `/auth.html`, and the renewal dies on MSAL's ten-second clock with
// `timed_out`.
//
// No header and no code in this repository can hand that iframe a cookie the
// browser has decided not to send. What *does* work in every browser is the
// same round trip taken top-level: at `login.microsoftonline.com` the session
// cookie is first-party, so Entra answers an already-signed-in account without
// showing anything and the app comes straight back with a fresh token. That is
// what these two records are for — one to stop paying for the iframe once it
// has been shown not to work here, one to keep the top-level trip from becoming
// a loop.

/**
 * That the hidden iframe failed in *this browser*, with the time it failed.
 * `localStorage`, beside the MSAL cache and for the same reason: the fact is
 * about the browser's cookie policy, which outlives the tab.
 */
const IFRAME_FAILED_KEY = 'gym.renewal.iframe-failed';

/**
 * That an automatic renewal redirect has already been spent. `sessionStorage`,
 * because the guard is about *this* navigation chain: it has to survive the
 * trip to Entra and back, and it must not still be standing a week later.
 */
const REDIRECT_SPENT_KEY = 'gym.renewal.redirect-spent';

/**
 * How long the iframe stays written off. Third-party cookie settings change —
 * a browser update, a user toggling a setting, a site exception — and a
 * permanent verdict would mean never noticing. A week is long enough that the
 * ten seconds are paid rarely and short enough that it is not forever.
 */
const IFRAME_RETRY_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

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

// Every storage access is wrapped. Reading `window.localStorage` throws outright
// where site data is blocked, `getItem` can throw under a private-mode quota,
// and none of this is worth failing a token acquisition over — a missing record
// only means the app behaves the way it did before there was one.
function readStamp(open: () => Storage, key: string): number | null {
    try {
        const raw = open().getItem(key);

        if (!raw) return null;

        const at = Number(raw);

        return Number.isFinite(at) ? at : null;
    } catch {
        return null;
    }
}

function writeStamp(open: () => Storage, key: string): void {
    try {
        open().setItem(key, String(Date.now()));
    } catch {
        // Nothing to do and nobody to tell. Without the record the iframe is
        // retried and the redirect guard is absent, which is where this app was
        // before either existed.
    }
}

function clearStamp(open: () => Storage, key: string): void {
    try {
        open().removeItem(key);
    } catch {
        // As above.
    }
}

const local = (): Storage => window.localStorage;
const session = (): Storage => window.sessionStorage;

/**
 * Whether MSAL's hidden iframe is still worth trying in this browser.
 *
 * False turns the silent call into cache-and-refresh-token only, which fails in
 * milliseconds instead of ten seconds when there is nothing left to redeem —
 * and a fast failure is what makes the top-level redirect feel like renewal
 * rather than like an outage.
 */
export function iframeRenewalWorthTrying(): boolean {
    const failedAt = readStamp(local, IFRAME_FAILED_KEY);

    return failedAt === null || Date.now() - failedAt > IFRAME_RETRY_AFTER_MS;
}

/** Record that the iframe timed out or died without reporting back. */
export function rememberIframeRenewalFailed(): void {
    writeStamp(local, IFRAME_FAILED_KEY);
}

/**
 * Take the one automatic renewal redirect available, if it has not been taken
 * recently. Returns false when it has — the caller shows the failure and offers
 * the redirect as a button instead, which is what the app did for every one of
 * these before it did any of them by itself.
 */
export function claimRenewalRedirect(): boolean {
    const spentAt = readStamp(session, REDIRECT_SPENT_KEY);

    if (spentAt !== null && Date.now() - spentAt < REDIRECT_COOLDOWN_MS) return false;

    writeStamp(session, REDIRECT_SPENT_KEY);

    return true;
}

/**
 * Hand the redirect back. Called when a token arrives — the chain ended in a
 * token, so it was not a loop — and when the user asks for a sign-in
 * themselves, which supersedes whatever the app tried on its own.
 */
export function releaseRenewalRedirect(): void {
    clearStamp(session, REDIRECT_SPENT_KEY);
}
