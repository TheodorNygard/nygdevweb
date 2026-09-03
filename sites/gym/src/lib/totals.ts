import type { SessionEntry, SessionTotals } from './types';

/**
 * The same sum the API does on the way out, done again locally.
 *
 * Volume and average RPE are derived rather than stored, so after a set is
 * logged optimistically there is nothing to fetch: recomputing here is what
 * makes the session header move on the tap rather than on the response. The
 * server stays the authority — a resync replaces these numbers with its own —
 * so this is a copy of the formula, not a second source of truth.
 *
 * `Math.round(…, 2)` in the C# is reproduced for the same reason it is there:
 * kilogram-reps land on halves at worst, but accumulating a few hundred of
 * them as doubles is how you end up rendering 8419.999999999998.
 */
export function computeTotals(entries: SessionEntry[]): SessionTotals {
    let setCount = 0;
    let volumeKg = 0;
    let rpeTotal = 0;
    let rpeCount = 0;

    for (const entry of entries) {
        for (const set of entry.sets) {
            setCount += 1;
            volumeKg += set.weightKg * set.reps;

            if (set.rpe !== null) {
                rpeTotal += set.rpe;
                rpeCount += 1;
            }
        }
    }

    return {
        exerciseCount: entries.length,
        setCount,
        volumeKg: Math.round(volumeKg * 100) / 100,
        avgRpe: rpeCount === 0 ? null : Math.round((rpeTotal / rpeCount) * 100) / 100,
    };
}
