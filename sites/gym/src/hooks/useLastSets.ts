import { useEffect, useMemo, useState } from 'react';

import type { GymApi } from '../lib/api';
import type { SessionSummary, WorkSet, Workout } from '../lib/types';

/** The last set logged for an exercise, by name. */
export type LastSets = Record<string, WorkSet>;

/**
 * What each exercise was last done with, so the logger opens on it.
 *
 * The lookup is the previous submitted session on the *same day of the block*,
 * and that is one read rather than a search: the plan hangs off the day, so
 * last week's "Upper A" holds this week's exercises almost by definition. An
 * exercise that is not in it — one added to the plan since, or added ad-hoc on
 * a different day — is simply not found, and the logger opens on nothing for
 * it, which is the honest answer to "what did I lift last time".
 *
 * Scanning further back would find more of them and cost a session document
 * per week to do it. The sets are the expensive half of a session, and this
 * runs on Start, so it is deliberately one.
 *
 * An empty map is the ordinary first-week state, and it is also what a failed
 * read leaves behind: this fills in a default, so failing to fill it in is not
 * worth a banner over the session it would appear on.
 */
export function useLastSets(
    api: GymApi | null,
    sessions: SessionSummary[],
    workout: Workout | null,
): LastSets {
    // Newest first is how the API answers, so the first match is the most
    // recent. Sessions with nothing logged in them are skipped rather than
    // fetched to discover they are empty.
    const previousId = useMemo(() => {
        if (!workout) return null;

        const previous = sessions.find((session) => session.dayIndex === workout.dayIndex
            && session.status === 'submitted'
            && session.id !== workout.id
            && session.setCount > 0);

        return previous?.id ?? null;
    }, [sessions, workout]);

    const [lastSets, setLastSets] = useState<LastSets>({});

    useEffect(() => {
        if (!api || !previousId) {
            setLastSets({});
            return;
        }

        let cancelled = false;

        void (async () => {
            try {
                const previous = await api.workout(previousId);

                if (cancelled) return;

                const found: LastSets = {};

                for (const entry of previous.entries) {
                    const last = entry.sets[entry.sets.length - 1];

                    // The last set of that exercise rather than its heaviest:
                    // this is where to start today, not a record to beat.
                    if (last) found[entry.exerciseName] = last;
                }

                setLastSets(found);
            } catch {
                if (!cancelled) setLastSets({});
            }
        })();

        return () => { cancelled = true; };
    }, [api, previousId]);

    return lastSets;
}
