import { useCallback, useRef, useState } from 'react';

import { reordered } from './useDragReorder';
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

    /**
     * Takes an exercise out of the session. Offered only once its last set is
     * gone: the API refuses to remove an entry that still holds sets, because
     * an exercise that was lifted is a logged workout rather than a mis-tap.
     */
    removeEntry: (entryIndex: number) => Promise<void>;

    /**
     * Drags an exercise from `from` to `to` — `to` is where it lands, matching
     * `reordered()`. Order is not cosmetic here: a separate backend reads it
     * downstream, so this writes to the server the same way a set does rather
     * than only re-sorting the local array.
     */
    reorderEntry: (from: number, to: number) => Promise<void>;
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

        const optimistic = next(session);

        put(optimistic);

        try {
            await send(api, session);
            setSavedAt(Date.now());
        } catch (cause) {
            // Three codes, one meaning: the guard this write carried did
            // not hold, nothing was written, and the fix is a re-read rather
            // than a rollback. The two that are not a count are guards shaped
            // differently because they had to be — a move never changes how
            // many entries there are, and a removal has to know which exercise
            // it meant.
            if (cause instanceof ApiError
                && (cause.isCountMismatch || cause.isReorderConflict || cause.isEntryConflict)) {
                await resync(session.id);
                setNotice(staleNotice);

                return;
            }

            setError(describe(cause));

            // Roll back only if nothing has been logged since. Two quick taps
            // are two writes in flight, and restoring the first one's
            // snapshot would erase the second's row — which may well have
            // landed. When the state has moved on, the server is the only
            // copy that knows which of them did, so ask it; if that fails too
            // the error above is already on screen.
            if (current.current === optimistic) {
                put(session);
            } else {
                await resync(session.id);
            }
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

    const removeEntry = useCallback(async (entryIndex: number): Promise<void> => {
        const entry = current.current?.entries[entryIndex];
        const expectedEntryCount = current.current?.entries.length;

        if (!entry || expectedEntryCount === undefined) return;

        // The screen only offers the control on an empty exercise, and this
        // checks it again rather than trusting that. The API's own refusal is
        // a 409, which would land in the banner as a failure — and a user who
        // was never shown a button has nothing to make of one.
        if (entry.sets.length > 0) return;

        await write(
            (session) => withEntries(
                session,
                session.entries.filter((_, index) => index !== entryIndex),
            ),
            (client, session) => client.removeEntry(
                session.id,
                entryIndex,
                entry.exerciseName,
                expectedEntryCount,
            ),
            'This session had changed elsewhere. Reloaded — remove it again.',
        );
    }, [write]);

    const reorderEntry = useCallback(async (from: number, to: number): Promise<void> => {
        const exerciseName = current.current?.entries[from]?.exerciseName;
        const expectedEntryCount = current.current?.entries.length;

        if (exerciseName === undefined || expectedEntryCount === undefined || from === to) {
            return;
        }

        await write(
            (session) => withEntries(session, reordered(session.entries, from, to)),
            (client, session) => client.moveEntry(session.id, {
                from,
                to,
                exerciseName,
                expectedEntryCount,
            }),
            'This session had changed elsewhere. Reloaded — drag it again.',
        );
    }, [write]);

    const submit = useCallback(async (): Promise<boolean> => {
        const session = current.current;

        if (!api || !session) return false;

        setBusy(true);
        setError(null);

        try {
            const planned = await api.submit(session.id);

            put({ ...session, status: 'submitted' });

            if (planned) {
                // The day had nothing planned against it and now has this. Said
                // out loud because it changes what next week's Start hands
                // back, and because it is the one thing a submit does besides
                // flipping a status.
                setNotice(
                    'This day had no plan. What you just logged is now what it prescribes — '
                    + 'next week starts with these exercises already in it.',
                );
            }

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
        removeEntry,
        reorderEntry,
        submit,
        dismiss,
    };
}
