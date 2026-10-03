import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { GymApi } from '../lib/api';
import type { SessionSummary, WorkSet, Workout } from '../lib/types';

/** The last set logged for an exercise, by name. */
export type LastSets = Record<string, WorkSet>;

export interface LastSetsState {
    sets: LastSets;

    /**
     * Starts the lookup for a day before its session exists — called when the
     * day sheet opens on a cell that can be started, so the read is under way
     * while the sheet is being looked at rather than after Start was tapped.
     */
    prefetch: (sessions: SessionSummary[], dayIndex: number) => void;
}

/**
 * The session to read last sets from: the most recent submitted one on the
 * same day of the block, other than the one being logged. Newest first is how
 * the API answers, so the first match is the most recent. Sessions with nothing
 * logged in them are skipped rather than fetched to discover they are empty.
 */
function previousOf(
    sessions: SessionSummary[],
    dayIndex: number,
    excludeId: string | null,
): string | null {
    const previous = sessions.find((session) => session.dayIndex === dayIndex
        && session.status === 'submitted'
        && session.id !== excludeId
        && session.setCount > 0);

    return previous?.id ?? null;
}

function lastSetsOf(previous: Workout): LastSets {
    const found: LastSets = {};

    for (const entry of previous.entries) {
        const last = entry.sets[entry.sets.length - 1];

        // The last set of that exercise rather than its heaviest: this is
        // where to start today, not a record to beat.
        if (last) found[entry.exerciseName] = last;
    }

    return found;
}

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
 * The read is started early when it can be — see `prefetch` — and what it
 * brings back is held until the session it was for closes. Read during render
 * rather than copied into state by an effect, so a session opened on a lookup
 * that has already landed shows last week's weight on its first frame instead
 * of `0 kg` and then a jump. Dropped on close because the copy is only as
 * fresh as the moment it was read, and editing a past session is done on the
 * same screen.
 *
 * An empty map is the ordinary first-week state, and it is also what a failed
 * read leaves behind: this fills in a default, so failing to fill it in is not
 * worth a banner over the session it would appear on.
 */
export function useLastSets(
    api: GymApi | null,
    sessions: SessionSummary[],
    workout: Workout | null,
): LastSetsState {
    const previousId = useMemo(
        () => (workout ? previousOf(sessions, workout.dayIndex, workout.id) : null),
        [sessions, workout],
    );

    // What has landed, and what is still on its way — the second so a Start
    // tapped before a prefetch has answered joins it rather than asking twice.
    const held = useRef(new Map<string, Workout>());
    const pending = useRef(new Map<string, Promise<Workout>>());

    // Bumped when a read lands, which is what makes the render below look in
    // `held` again. The value itself means nothing.
    const [landed, setLanded] = useState(0);

    const read = useCallback((sessionId: string): Promise<Workout> | null => {
        if (!api) return null;

        const inFlight = pending.current.get(sessionId);

        if (inFlight) return inFlight;

        const request = api.workout(sessionId)
            .then((previous) => {
                held.current.set(sessionId, previous);
                setLanded((count) => count + 1);

                return previous;
            })
            .finally(() => { pending.current.delete(sessionId); });

        pending.current.set(sessionId, request);

        return request;
    }, [api]);

    const prefetch = useCallback((all: SessionSummary[], dayIndex: number) => {
        const sessionId = previousOf(all, dayIndex, null);

        if (!sessionId || held.current.has(sessionId)) return;

        // A failure here is the session's own read failing early; the one
        // `useEffect` below makes will try again, so this has nothing to say.
        read(sessionId)?.catch(() => {});
    }, [read]);

    useEffect(() => {
        if (!previousId || held.current.has(previousId)) return;

        read(previousId)?.catch(() => {
            // Nothing to do: the map stays empty, which is the default.
        });
    }, [previousId, read]);

    // A session closing — or another opening in its place — forgets what was
    // read for it. The next Start reads again, as it always did.
    const workoutId = workout?.id ?? null;

    useEffect(() => {
        if (!workoutId) return;

        return () => {
            held.current.clear();
        };
    }, [workoutId]);

    const sets = useMemo(() => {
        const previous = previousId ? held.current.get(previousId) : undefined;

        return previous ? lastSetsOf(previous) : {};

    // `landed` is what tells this that `held` has something new.
    }, [previousId, landed]);

    return { sets, prefetch };
}
