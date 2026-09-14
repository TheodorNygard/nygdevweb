import type { CurrentBlock } from './types';

/**
 * The block this account was last shown, held between visits.
 *
 * One thing is cached and it is deliberately the one: `GET
 * /gym/mesocycles/current` is the first call every sign-in makes, so it is the
 * call that pays for the function app's cold start, and what it fetches is a
 * training block — something that changes when somebody trains rather than by
 * the minute. Holding the last copy is what lets Today draw immediately and
 * correct itself a moment later, instead of showing a spinner for as long as a
 * worker takes to start.
 *
 * Nothing else is cached. A session's sets are written through guarded calls
 * whose whole safety argument is the count the server holds, and a second copy
 * of those on the client would be a second thing to reconcile — see
 * `hooks/useSession`, which already answers a stale count by re-reading rather
 * than by merging.
 */

/**
 * One key rather than one per account. Only one account is signed in at a time,
 * and a single key is a single thing to remove on the way out — a per-account
 * scheme would leave everyone who has ever signed in on this browser holding a
 * block that nothing clears.
 */
const KEY = 'gymlog.block';

/**
 * Bumped when the stored shape stops matching {@link CurrentBlock}.
 *
 * `lib/types` is written as a transcription of the API, so a route that changes
 * shape shows up there as a type error — but an entry written by an older
 * deploy is the one copy of that shape no type check can reach. Discarding on a
 * mismatch is what keeps a wire change from being read as the shape this build
 * expects.
 */
const VERSION = 1;

interface Entry {
    version: number;
    accountId: string;
    block: CurrentBlock;
}

/**
 * The held block, or null when there is none for this account.
 *
 * The account check is the tenancy boundary on this side of the wire. The real
 * one is the object id off the validated token and is the server's — it cannot
 * be reached from here — so what this does is narrower and still worth doing: a
 * second person signing in on the same phone is not shown the first one's
 * training in the moment before the server answers.
 */
export function readBlock(accountId: string | null): CurrentBlock | null {
    if (accountId === null) return null;

    let raw: string | null;

    try {
        raw = window.localStorage.getItem(KEY);
    } catch {
        // Storage can be unavailable outright — a private window, a browser
        // configured to refuse it. A cache that cannot be read is a cache miss,
        // which every caller already handles.
        return null;
    }

    if (raw === null) return null;

    try {
        const entry = JSON.parse(raw) as Partial<Entry>;

        if (entry.version !== VERSION
            || entry.accountId !== accountId
            || !entry.block) {
            return null;
        }

        return entry.block;
    } catch {
        // Not JSON, so not something this wrote. Treated as absent rather than
        // cleared: whatever put it there owns it.
        return null;
    }
}

/** Holds the block just read from the API. Failing to is not worth reporting. */
export function writeBlock(accountId: string | null, block: CurrentBlock): void {
    if (accountId === null) return;

    const entry: Entry = { version: VERSION, accountId, block };

    try {
        window.localStorage.setItem(KEY, JSON.stringify(entry));
    } catch {
        // Over quota, or storage refused. Nothing to do and nothing to say —
        // the next load reads the server exactly as it did before this existed.
    }
}

/**
 * Drops the held block. Called on the way out of a sign-out, which is the last
 * chance: signing out navigates to Entra and this page is gone by the time the
 * browser comes back.
 */
export function clearBlock(): void {
    try {
        window.localStorage.removeItem(KEY);
    } catch {
        // As above.
    }
}
