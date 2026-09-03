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

    /**
     * Something that happened but is not a failure — a resumed draft, a resync
     * after a stale count.
     */
    notice: string | null;

    /**
     * When the last write landed, for the "Saved 19:42" line in the session
     * header. It is what makes "every set saves as you log it" checkable
     * rather than a claim, which matters on a phone that just lost signal.
     */
    savedAt: number | null;
}

export interface SessionActions {
    start: (week: number, dayIndex: number) => Promise<Workout | null>;
    open: (sessionId: string) => Promise<Workout | null>;
    close: () => void;
    addEntry: (exerciseName: string) => Promise<number | null>;
    logSet: (entryIndex: number, set: WorkSet) => Promise<void>;
    removeSet: (entryIndex: number, setIndex: number) => Promise<void>;
    submit: () => Promise<boolean>;
    dismiss: () => void;
}

function withEntries(workout: Workout, entries: SessionEntry[]): Workout {
    return { ...workout, entries, totals: computeTotals(entries) };
}

/**
 * The open session, and the four guarded writes that change it.
 *
 * Every write applies locally first and asks the API second. That is not
 * optimism for its own sake: the button being tapped is one a user hits
 * between sets with a bar still in their hands, and a 300 ms round trip
 * between the tap and the row appearing is the difference between a logbook
 * and a form. What makes it safe is the guard the API takes on every call —
 * the count the client believes the session holds — so a retry cannot apply
 * twice and a stale count cannot apply at all.
 *
 * Three outcomes, and all three are handled here rather than on screen:
 *
 * - `alreadyRecorded` / `alreadyRemoved` is **success**. It means the first
 *   attempt landed and this one was the retry. The local state already shows
 *   it, so there is nothing to do but keep it.
 * - `409 count_mismatch` means the local copy is stale and nothing was
 *   written. The workout is re-read and the local copy replaced with what the
 *   API holds — the one case where a tap visibly does something other than
 *   what it looked like it did, which is why it leaves a notice behind.
 * - Anything else rolls the optimistic change back, so the screen never claims
 *   a set is logged when it is not.
 */
export function useSession(api: GymApi | null): SessionState & SessionActions {
    const [workout, setWorkout] = useState<Workout | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [savedAt, setSavedAt] = useState<number | null>(null);

    // The writes read the current workout to build their guard counts, and
    // they are called from event handlers that would otherwise close over a
    // stale render. A ref is the copy that is always current.
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

    const addEntry = useCallback(async (exerciseName: string): Promise<number | null> => {
        const session = current.current;

        if (!api || !session) return null;

        const expectedEntryCount = session.entries.length;
        const optimistic: SessionEntry = { exerciseName, sets: [] };

        put(withEntries(session, [...session.entries, optimistic]));

        try {
            const result = await api.addEntry(session.id, exerciseName, expectedEntryCount);

            setSavedAt(Date.now());

            // `alreadyRecorded` included: either way the entry is in the
            // session at the index the API names, which is what sets are
            // logged against.
            return result.entryIndex;
        } catch (cause) {
            if (cause instanceof ApiError && cause.isCountMismatch) {
                const fresh = await resync(session.id);

                setNotice('This session had changed elsewhere. Reloaded — add the exercise again.');

                return fresh
                    ? fresh.entries.findIndex((entry) => entry.exerciseName === exerciseName)
                    : null;
            }

            put(session);
            setError(describe(cause));

            return null;
        }
    }, [api, put, resync, describe]);

    const logSet = useCallback(async (entryIndex: number, set: WorkSet): Promise<void> => {
        const session = current.current;
        const entry = session?.entries[entryIndex];

        if (!api || !session || !entry) return;

        const expectedSetCount = entry.sets.length;
        const entries = session.entries.map((existing, index) => (
            index === entryIndex ? { ...existing, sets: [...existing.sets, set] } : existing
        ));

        put(withEntries(session, entries));

        try {
            await api.logSet(session.id, {
                entryIndex,
                expectedSetCount,
                weightKg: set.weightKg,
                reps: set.reps,
                rpe: set.rpe,
            });

            setSavedAt(Date.now());
        } catch (cause) {
            if (cause instanceof ApiError && cause.isCountMismatch) {
                await resync(session.id);
                setNotice('This session had changed elsewhere. Reloaded from the server.');

                return;
            }

            put(session);
            setError(describe(cause));
        }
    }, [api, put, resync, describe]);

    const removeSet = useCallback(async (entryIndex: number, setIndex: number): Promise<void> => {
        const session = current.current;
        const entry = session?.entries[entryIndex];

        if (!api || !session || !entry) return;

        const expectedSetCount = entry.sets.length;
        const entries = session.entries.map((existing, index) => (
            index === entryIndex
                ? { ...existing, sets: existing.sets.filter((_, position) => position !== setIndex) }
                : existing
        ));

        put(withEntries(session, entries));

        try {
            await api.removeSet(session.id, entryIndex, setIndex, expectedSetCount);

            setSavedAt(Date.now());
        } catch (cause) {
            if (cause instanceof ApiError && cause.isCountMismatch) {
                await resync(session.id);
                setNotice('This session had changed elsewhere. Reloaded from the server.');

                return;
            }

            put(session);
            setError(describe(cause));
        }
    }, [api, put, resync, describe]);

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
