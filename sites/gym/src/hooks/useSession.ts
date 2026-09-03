import { useCallback, useRef, useState } from 'react';

import { ApiError, NetworkError, type GymApi } from '../lib/api';
import { localDate } from '../lib/format';
import { computeTotals } from '../lib/totals';
import type { SessionEntry, WorkSet, Workout } from '../lib/types';

export interface SessionState {
    workout: Workout | null;

    /** A call the user is waiting on: Start, Submit, or opening a session. */
    busy: boolean;

    /** Shown as a banner. Written by the API where the API had something to say. */
    error: string | null;

    /** Something that happened but is not a failure — a resumed draft, a resync. */
    notice: string | null;

    /**
     * When the last write landed, for the "Saved 19:42" line in the session
     * header. It is what makes "every set saves as you log it" checkable rather
     * than a claim, which matters on a phone that just lost signal.
     */
    savedAt: number | null;
}

export interface SessionActions {
    start: (week: number, dayIndex: number) => Promise<Workout | null>;
    open: (sessionId: string) => Promise<Workout | null>;
    close: () => void;
    addEntry: (exerciseName: string) => Promise<void>;
    logSet: (entryIndex: number, set: WorkSet) => Promise<void>;
    removeSet: (entryIndex: number, setIndex: number) => Promise<void>;
    submit: () => Promise<boolean>;
    dismiss: () => void;
}

const STALE = 'This session had changed elsewhere. Reloaded from the server.';

function withEntries(workout: Workout, entries: SessionEntry[]): Workout {
    return { ...workout, entries, totals: computeTotals(entries) };
}

/**
 * The open session, and the four guarded writes that change it.
 *
 * Every write applies locally first and asks the API second. That is not
 * optimism for its own sake: the button being tapped is one a user hits between
 * sets with a bar still in their hands, and a 300 ms round trip between the tap
 * and the row appearing is the difference between a logbook and a form. What
 * makes it safe is the guard the API takes on every call — the count the client
 * believes the session holds — so a retry cannot apply twice and a stale count
 * cannot apply at all.
 *
 * Three outcomes, all handled here rather than on screen:
 *
 * - `alreadyRecorded` / `alreadyRemoved` is **success**: the first attempt
 *   landed and this was the retry, so the local state already shows it.
 * - `409 count_mismatch` means the local copy is stale and nothing was written.
 *   The workout is re-read and replaced with what the API holds — the one case
 *   where a tap visibly does something else, hence the notice.
 * - Anything else rolls the optimistic change back, so the screen never claims
 *   a set is logged when it is not.
 */
export function useSession(api: GymApi | null): SessionState & SessionActions {
    const [workout, setWorkout] = useState<Workout | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [savedAt, setSavedAt] = useState<number | null>(null);

    // The writes read the current workout to build their guard counts, and they
    // are called from event handlers that would otherwise close over a stale
    // render. A ref is the copy that is always current.
    const current = useRef<Workout | null>(null);

    const put = useCallback((next: Workout | null) => {
        current.current = next;
        setWorkout(next);
    }, []);

    const describe = useCallback((cause: unknown): string => {
        if (cause instanceof ApiError || cause instanceof NetworkError) return cause.message;

        return cause instanceof Error ? cause.message : String(cause);
    }, []);

    /** Re-read from the API and adopt what it holds. Used after a stale count. */
    const resync = useCallback(async (sessionId: string): Promise<Workout | null> => {
        if (!api) return null;

        try {
            const fresh = await api.workout(sessionId);

            put(fresh);

            return fresh;
        } catch (cause) {
            setError(describe(cause));

            return null;
        }
    }, [api, put, describe]);

    const start = useCallback(async (week: number, dayIndex: number): Promise<Workout | null> => {
        if (!api) return null;

        setBusy(true);
        setError(null);
        setNotice(null);
        setSavedAt(null);

        try {
            // The phone's date, not the server's. A 21:00 session in Oslo is
            // already tomorrow in UTC for half the year.
            const started = await api.startWorkout(localDate(), week, dayIndex);

            put(started.workout);

            if (started.resumed) {
                setNotice('Picked up the draft already open on this day.');
            }

            return started.workout;
        } catch (cause) {
            setError(describe(cause));

            return null;
        } finally {
            setBusy(false);
        }
    }, [api, put, describe]);

    const open = useCallback(async (sessionId: string): Promise<Workout | null> => {
        if (!api) return null;

        setBusy(true);
        setError(null);
        setNotice(null);
        setSavedAt(null);

        try {
            const fetched = await api.workout(sessionId);

            put(fetched);

            return fetched;
        } catch (cause) {
            setError(describe(cause));

            return null;
        } finally {
            setBusy(false);
        }
    }, [api, put, describe]);

    const close = useCallback(() => {
        put(null);
        setError(null);
        setNotice(null);
        setSavedAt(null);
    }, [put]);

    /**
     * Apply an optimistic change, then send it. The rollback, the stale-count
     * resync and the saved-at stamp are the same three answers for every write,
     * so they live here once.
     */
    const write = useCallback(async (
        next: (session: Workout) => Workout,
        send: (api: GymApi, session: Workout) => Promise<unknown>,
        staleNotice: string,
    ): Promise<void> => {
        const session = current.current;

        if (!api || !session) return;

        put(next(session));

        try {
            await send(api, session);
            setSavedAt(Date.now());
        } catch (cause) {
            if (cause instanceof ApiError && cause.isCountMismatch) {
                await resync(session.id);
                setNotice(staleNotice);

                return;
            }

            put(session);
            setError(describe(cause));
        }
    }, [api, put, resync, describe]);

    const addEntry = useCallback(async (exerciseName: string): Promise<void> => {
        const expectedEntryCount = current.current?.entries.length ?? 0;

        await write(
            (session) => withEntries(session, [...session.entries, { exerciseName, sets: [] }]),
            (client, session) => client.addEntry(session.id, exerciseName, expectedEntryCount),
            'This session had changed elsewhere. Reloaded — add the exercise again.',
        );
    }, [write]);

    const logSet = useCallback(async (entryIndex: number, set: WorkSet): Promise<void> => {
        const expectedSetCount = current.current?.entries[entryIndex]?.sets.length;

        if (expectedSetCount === undefined) return;

        await write(
            (session) => withEntries(session, session.entries.map((entry, index) => (
                index === entryIndex ? { ...entry, sets: [...entry.sets, set] } : entry
            ))),
            (client, session) => client.logSet(session.id, {
                entryIndex,
                expectedSetCount,
                weightKg: set.weightKg,
                reps: set.reps,
                rpe: set.rpe,
            }),
            STALE,
        );
    }, [write]);

    const removeSet = useCallback(async (
        entryIndex: number,
        setIndex: number,
    ): Promise<void> => {
        const expectedSetCount = current.current?.entries[entryIndex]?.sets.length;

        if (expectedSetCount === undefined) return;

        await write(
            (session) => withEntries(session, session.entries.map((entry, index) => (
                index === entryIndex
                    ? { ...entry, sets: entry.sets.filter((_, at) => at !== setIndex) }
                    : entry
            ))),
            (client, session) => client.removeSet(
                session.id,
                entryIndex,
                setIndex,
                expectedSetCount,
            ),
            STALE,
        );
    }, [write]);

    const submit = useCallback(async (): Promise<boolean> => {
        const session = current.current;

        if (!api || !session) return false;

        setBusy(true);
        setError(null);

        try {
            await api.submit(session.id);
            put({ ...session, status: 'submitted' });

            return true;
        } catch (cause) {
            setError(describe(cause));

            return false;
        } finally {
            setBusy(false);
        }
    }, [api, put, describe]);

    const dismiss = useCallback(() => {
        setError(null);
        setNotice(null);
    }, []);

    return {
        workout,
        busy,
        error,
        notice,
        savedAt,
        start,
        open,
        close,
        addEntry,
        logSet,
        removeSet,
        submit,
        dismiss,
    };
}
