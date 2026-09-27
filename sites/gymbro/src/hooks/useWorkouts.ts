import { useEffect, useRef, useState } from 'react';

import { messageOf, type GymApi, type SessionDetail } from '../lib/gym';

export interface WorkoutsState {
    /** Every session in the block, sets and all, newest first. */
    sessions: SessionDetail[];

    loading: boolean;
    error: string | null;
}

/**
 * Every session in a block with its sets, in one call.
 *
 * Analytics is the one view that needs the sets themselves: nothing on a
 * session's totals says which exercise the volume came from, so a chart of one
 * lift across a block cannot be drawn from the block map alone.
 *
 * It used to be drawn by opening each session in turn — up to forty-eight
 * round trips, six at a time, with the count on screen while it ran. That was
 * forty-eight point reads for sets the block map's own query had already read:
 * `GET /gym/workouts` projects `c.entries` whatever it is asked for, because
 * volume and average RPE are derived rather than stored and deriving them means
 * walking every set. `?include=entries` simply keeps them on the answer, so the
 * whole block now costs the one query that was already being run, plus the
 * bytes. There is no progress to report any more, which is why nothing here
 * counts.
 *
 * Read once per block and then held, so switching lifts, or leaving the view
 * and coming back, costs nothing. The held copy is keyed on the ids the block
 * map is showing as well as on the block: a session logged on the phone since
 * changes that key, and is read rather than missed.
 */
export function useWorkouts(
    api: GymApi | null,
    mesoId: string | null,
    ids: readonly string[],
): WorkoutsState {
    const [sessions, setSessions] = useState<SessionDetail[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // What the held copy is a copy of. Held across renders rather than in
    // state, because it is read inside the effect to decide whether to run —
    // putting it in state would make setting it re-run this.
    const held = useRef<string | null>(null);

    useEffect(() => {
        held.current = null;
        setSessions([]);
    }, [api]);

    // What this would be reading, or null when there is nothing to read: the
    // view is closed, or the block has nothing submitted in it.
    //
    // `ids` is rebuilt by the caller on every render, so the key is its content
    // rather than its identity. Session ids are `session_YYYY-MM-DD[_n]`, which
    // carries no comma.
    const key = mesoId === null || ids.length === 0
        ? null
        : `${mesoId}:${ids.join(',')}`;

    useEffect(() => {
        if (!api) return;

        // The view is closed. What was read stays in hand, so opening it again
        // on the same block draws immediately.
        if (mesoId === null) {
            setLoading(false);

            return;
        }

        // The block being looked at has nothing submitted in it, so there is
        // nothing to read and nothing to draw — and what the last block left
        // behind must not be what is drawn instead.
        if (ids.length === 0) {
            setLoading(false);
            setError(null);
            held.current = null;
            setSessions([]);

            return;
        }

        if (held.current === key) return;

        let cancelled = false;

        setLoading(true);
        setError(null);

        void (async () => {
            try {
                // `mesoId` rather than the current block: this view reads the
                // block that is selected, which is not always the one being
                // trained.
                const read = await api.sessionDetails(mesoId);

                if (cancelled) return;

                held.current = key;
                setSessions(read);
            } catch (cause) {
                if (cancelled) return;

                // The chart draws nothing rather than something partial: this
                // is one call, so a failure is the whole block rather than the
                // one session it used to be.
                setSessions([]);
                setError(messageOf(cause));
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => { cancelled = true; };
    }, [api, key, mesoId]);

    return { sessions, loading, error };
}
