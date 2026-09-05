import { useEffect, useRef, useState } from 'react';

import { type GymApi, type Workout } from '../lib/gym';

/**
 * How many session reads are in flight at once.
 *
 * A block is up to forty-eight cells and each one is a call, so this is the
 * difference between a browser queueing them six at a time on its own terms
 * and the app deciding. Six is what a browser would do to one origin anyway;
 * naming it here is what makes the progress count move steadily rather than in
 * one jump at the end.
 */
const CONCURRENCY = 6;

export interface WorkoutsState {
    /** Every session read so far, in no particular order. */
    workouts: Workout[];

    /** How many of `ids` have landed, and how many were asked for. */
    done: number;
    total: number;

    loading: boolean;
    error: string | null;
}

/**
 * The full sessions behind a list of ids — sets and all.
 *
 * The expensive read on this site, and the only one that is. Nothing on
 * `GET /gym/workouts` carries which exercise a session's volume came from, so
 * a chart of one lift over a block needs every session in it opened
 * individually. That is why Analytics is a view you navigate to rather than a
 * panel on the Dashboard: the cost is paid when the question is asked.
 *
 * Read once per session id and then held, so switching lifts, or leaving the
 * view and coming back, costs nothing. Sessions are immutable once submitted,
 * which is what makes holding them safe — a reload of the block's summaries
 * brings new ids, and only those are fetched.
 */
export function useWorkouts(api: GymApi | null, ids: readonly string[]): WorkoutsState {
    const [workouts, setWorkouts] = useState<Workout[]>([]);
    const [done, setDone] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Held across renders and read from inside the effect, so an id already
    // fetched is not fetched again when the list it arrived in changes.
    const held = useRef(new Map<string, Workout>());

    useEffect(() => {
        held.current = new Map();
        setWorkouts([]);
    }, [api]);

    // `ids` is rebuilt by the caller on every render, so the effect keys off
    // its content rather than its identity — and reads the content back out of
    // that key, so the dependency list is the whole of what the effect uses.
    // Session ids are `session_YYYY-MM-DD[_n]`, which carries no comma.
    const key = ids.join(',');

    useEffect(() => {
        if (!api) return;

        const all = key === '' ? [] : key.split(',');
        const wanted = all.filter((id) => !held.current.has(id));

        setDone(all.length - wanted.length);

        if (wanted.length === 0) {
            setWorkouts([...held.current.values()]);
            setLoading(false);

            return;
        }

        let cancelled = false;

        setLoading(true);
        setError(null);

        void (async () => {
            let next = 0;

            // A fixed pool of workers pulling from one cursor, rather than
            // chunks: a slow session in one chunk would otherwise hold up the
            // five beside it.
            const worker = async (): Promise<void> => {
                for (;;) {
                    const index = next;

                    next += 1;

                    const id = wanted[index];

                    if (id === undefined || cancelled) return;

                    try {
                        const workout = await api.workout(id);

                        held.current.set(id, workout);
                    } catch (cause) {
                        // One unreadable session should not cost the chart the
                        // other twenty-three. The message is kept and the
                        // series is drawn from what did arrive, which the view
                        // says out loud.
                        if (!cancelled) {
                            setError(cause instanceof Error ? cause.message : String(cause));
                        }
                    }

                    if (cancelled) return;

                    setDone((count) => count + 1);
                    setWorkouts([...held.current.values()]);
                }
            };

            await Promise.all(
                Array.from({ length: Math.min(CONCURRENCY, wanted.length) }, worker),
            );

            if (!cancelled) setLoading(false);
        })();

        return () => { cancelled = true; };
    }, [api, key]);

    return { workouts, done, total: ids.length, loading, error };
}
