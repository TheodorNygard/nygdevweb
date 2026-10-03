import { useCallback, useRef, useState } from 'react';

import { reordered } from './useDragReorder';
import { ApiError, NetworkError, messageOf, type GymApi } from '../lib/api';
import { swapped } from '../lib/block';
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

    /**
     * Writes that did not get through and are being retried, for the "2 sets
     * waiting to save" line that replaces "Saved 19:42" while they are. Null
     * whenever nothing has failed — a write merely in flight is not waiting.
     */
    waiting: Waiting | null;
}

export interface Waiting {
    count: number;

    /** Whether every one of them is a set, so the header can say "sets". */
    setsOnly: boolean;
}

export interface SessionActions {
    start: (week: number, dayIndex: number) => Promise<Workout | null>;
    open: (sessionId: string) => Promise<Workout | null>;
    close: () => void;
    addEntry: (exerciseName: string) => Promise<void>;
    logSet: (entryIndex: number, set: WorkSet) => Promise<void>;
    removeSet: (entryIndex: number, setIndex: number) => Promise<void>;

    /**
     * Corrects a logged set in place — on the session being logged, or on one
     * opened from History after it was submitted. The totals follow locally on
     * the tap and on the server whenever anything is next read, because none
     * of them is stored.
     */
    editSet: (entryIndex: number, setIndex: number, set: WorkSet) => Promise<void>;

    /**
     * Swaps an exercise for another. Replaced where it stands if nothing was
     * logged on it; otherwise its sets stay and `to` goes in after it — unless
     * `withSets`, which says they were lifted on `to` and moves them with it.
     * See `swapped()` in `lib/block`, which is the same rule the API applies.
     */
    swapEntry: (entryIndex: number, to: string, withSets?: boolean) => Promise<void>;

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

/**
 * How long to wait before each retry of a write that did not get through:
 * about a minute in all, which outlasts the dead spot by the squat rack
 * without leaving a write retrying long after anybody is looking.
 */
const RETRY_MS = [1000, 2000, 4000, 8000, 15000, 30000];

/** A write that has been applied on screen and not yet acknowledged by the API. */
interface Job {
    /** A set logged, corrected or removed — what the header counts as "sets". */
    isSet: boolean;
    send: (api: GymApi) => Promise<unknown>;
    staleNotice: string;
    sessionId: string;

    /**
     * The session before this write was applied. Writes go out in order, so it
     * is also the session before every write queued behind this one — which is
     * what makes it the right thing to roll back to when this one fails.
     */
    base: Workout;

    /** Which opening of a session it belongs to; see `generation`. */
    generation: number;
    failures: number;
    done: () => void;
}

/**
 * Whether trying again could work: the request never arrived, or the platform
 * rather than the API turned it away for now. A 4xx the API wrote is an answer,
 * and asking again gets the same one.
 */
function isTransient(cause: unknown): boolean {
    return cause instanceof NetworkError
        || (cause instanceof ApiError
            && (cause.status >= 500 || cause.status === 408 || cause.status === 429));
}

function wait(ms: number): Promise<void> {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/** "1 set", "3 sets", "2 changes". */
function unsaved(jobs: readonly Job[]): string {
    const noun = jobs.every((job) => job.isSet) ? 'set' : 'change';

    return `${jobs.length} ${noun}${jobs.length === 1 ? '' : 's'}`;
}

function withEntries(workout: Workout, entries: SessionEntry[]): Workout {
    return { ...workout, entries, totals: computeTotals(entries) };
}

/**
 * The open session, and the guarded writes that change it.
 *
 * Every write applies locally first and asks the API second. That is not
 * optimism for its own sake: the button being tapped is one a user hits between
 * sets with a bar still in their hands, and a 300 ms round trip between the tap
 * and the row appearing is the difference between a logbook and a form. What
 * makes it safe is the guard the API takes on every call — the count the client
 * believes the session holds — so a retry cannot apply twice and a stale count
 * cannot apply at all.
 *
 * The writes go out **one at a time, in the order they were tapped**. Each
 * one's guard is counted from the screen, which already shows every write
 * before it; sending them in order is what makes that count the server's by
 * the time it arrives. It also means a write that has to be retried holds the
 * ones behind it rather than being overtaken by them — overtaken, the next set
 * would meet a count one short, and the resync would take both sets off the
 * screen.
 *
 * Four outcomes, all handled here rather than on screen:
 *
 * - `alreadyRecorded` / `alreadyRemoved` is **success**: the first attempt
 *   landed and this was the retry, so the local state already shows it.
 * - `409 count_mismatch` means the local copy is stale and nothing was written.
 *   The workout is re-read and replaced with what the API holds — the one case
 *   where a tap visibly does something else, hence the notice.
 * - A failure that could pass — no signal, a 503 — keeps the write on screen
 *   and **retries it** with backoff while the session is open, and the header
 *   says how many are waiting. The guard is what makes that safe: a retry of a
 *   write that did land comes back `alreadyRecorded` rather than twice.
 * - Anything else, or retries running out, or the session closing with writes
 *   still waiting: the error goes in the banner and the screen rolls back, so
 *   it never claims a set is logged when it is not.
 */
export function useSession(api: GymApi | null): SessionState & SessionActions {
    const [workout, setWorkout] = useState<Workout | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [savedAt, setSavedAt] = useState<number | null>(null);
    const [waiting, setWaiting] = useState<Waiting | null>(null);

    // The writes read the current workout to build their guard counts, and they
    // are called from event handlers that would otherwise close over a stale
    // render. A ref is the copy that is always current.
    const current = useRef<Workout | null>(null);

    const put = useCallback((next: Workout | null) => {
        current.current = next;
        setWorkout(next);
    }, []);

    // Applied on screen, not yet acknowledged, oldest first. The head is the
    // one in flight or being retried. In memory only: a write that outlives
    // the page is one nobody is looking at to see whether it landed.
    const outbox = useRef<Job[]>([]);
    const pumping = useRef(false);

    // Bumped when a session closes, so a write that settles afterwards knows
    // the screen it would update is gone.
    const generation = useRef(0);

    // Submit, waiting for the outbox to empty or to start retrying.
    const settledWaiters = useRef<Array<() => void>>([]);

    /** Brings the header's count up to date, and wakes anything waiting on the outbox. */
    const report = useCallback(() => {
        const queue = outbox.current;
        const head = queue[0];
        const stuck = head !== undefined && head.failures > 0;

        setWaiting(stuck
            ? { count: queue.length, setsOnly: queue.every((job) => job.isSet) }
            : null);

        if (!head || stuck) {
            const waiters = settledWaiters.current;

            settledWaiters.current = [];
            waiters.forEach((wake) => wake());
        }
    }, []);

    /** Empties the outbox and returns what was in it. Nothing in flight is recalled. */
    const drop = useCallback((): Job[] => {
        const dropped = outbox.current;

        outbox.current = [];
        dropped.forEach((job) => job.done());
        report();

        return dropped;
    }, [report]);

    /** Resolves once nothing is in flight, or once something is being retried. */
    const settled = useCallback((): Promise<void> => {
        const head = outbox.current[0];

        if (!head || head.failures > 0) return Promise.resolve();

        return new Promise((resolve) => { settledWaiters.current.push(resolve); });
    }, []);

    /** Re-read from the API and adopt what it holds. Used after a stale count. */
    const resync = useCallback(async (sessionId: string): Promise<Workout | null> => {
        if (!api) return null;

        try {
            const fresh = await api.workout(sessionId);

            put(fresh);

            return fresh;
        } catch (cause) {
            setError(messageOf(cause));

            return null;
        }
    }, [api, put]);

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
            setError(messageOf(cause));

            return null;
        } finally {
            setBusy(false);
        }
    }, [api, put]);

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
            setError(messageOf(cause));

            return null;
        } finally {
            setBusy(false);
        }
    }, [api, put]);

    const close = useCallback(() => {
        generation.current += 1;

        // Leaving is the other point at which a retry is given up on: nobody is
        // on the screen that would show it landing. A write merely in flight is
        // left to finish — it was sent the moment it was tapped, as it always
        // was, and stopping it here would lose a set for no reason.
        const head = outbox.current[0];

        if (head && head.failures > 0) {
            const dropped = drop();

            setError(
                `${unsaved(dropped)} ${dropped.length === 1 ? 'was' : 'were'} not saved — the `
                + 'connection did not come back before the session was closed. Open it again '
                + 'and log what is missing.',
            );
        } else {
            setError(null);
        }

        put(null);
        setNotice(null);
        setSavedAt(null);
    }, [drop, put]);

    /**
     * Sends the outbox, oldest first, until it is empty. One runs at a time;
     * a write queued while it is running is picked up by the same loop.
     */
    const pump = useCallback(async (): Promise<void> => {
        if (pumping.current || !api) return;

        pumping.current = true;

        try {
            for (let job = outbox.current[0]; job; job = outbox.current[0]) {
                if (job.failures > 0) {
                    await wait(RETRY_MS[job.failures - 1] ?? 0);

                    // Given up on while waiting — the session was closed.
                    if (outbox.current[0] !== job) continue;
                }

                try {
                    await job.send(api);

                    if (outbox.current[0] === job) outbox.current.shift();

                    job.done();

                    if (job.generation === generation.current) setSavedAt(Date.now());

                    report();
                } catch (cause) {
                    if (outbox.current[0] !== job) continue;

                    // Whether the screen this write was made on is still open.
                    const open = job.generation === generation.current;

                    // Three codes, one meaning: the guard this write carried
                    // did not hold, nothing was written, and the fix is a
                    // re-read rather than a rollback. The two that are not a
                    // count are guards shaped differently because they had to
                    // be — a move never changes how many entries there are,
                    // and a removal has to know which exercise it meant.
                    // Everything queued behind it was counted from the same
                    // stale copy, so it goes too; the re-read is what is left.
                    if (cause instanceof ApiError
                        && (cause.isCountMismatch || cause.isReorderConflict || cause.isEntryConflict)) {
                        drop();

                        if (open) {
                            await resync(job.sessionId);

                            // On a retry the likeliest reason the guard no
                            // longer holds is that the first attempt landed
                            // and only its answer was lost. The re-read shows
                            // it either way, and "do it again" would be wrong.
                            if (job.failures === 0) setNotice(job.staleNotice);
                        }

                        continue;
                    }

                    if (open && isTransient(cause) && job.failures < RETRY_MS.length) {
                        job.failures += 1;
                        report();

                        continue;
                    }

                    // Out of retries, or a failure retrying will not fix.
                    // Writes go out in order, so this one's `base` is the
                    // session before it *and* before everything behind it:
                    // rolling back to it takes exactly the unsaved writes off
                    // the screen and leaves every acknowledged one.
                    const dropped = drop();
                    const lost = `${unsaved(dropped)} ${dropped.length === 1 ? 'was' : 'were'} `
                        + 'not saved';

                    setError(!open
                        ? `${messageOf(cause)} ${lost}.`
                        : dropped.length > 1 || job.failures > 0
                            ? `${messageOf(cause)} ${lost} and came back off the screen.`
                            : messageOf(cause));

                    if (open) put(job.base);
                }
            }
        } finally {
            pumping.current = false;
        }
    }, [api, drop, put, report, resync]);

    /**
     * Apply an optimistic change, then queue it to be sent. What happens when
     * it is answered — the stale-count resync, the retry, the rollback, the
     * saved-at stamp — is the same for every write, so it lives in `pump`.
     *
     * Resolves once the write has settled, whichever way it went.
     */
    const write = useCallback((
        next: (session: Workout) => Workout,
        send: (api: GymApi, session: Workout) => Promise<unknown>,
        staleNotice: string,
        isSet: boolean,
    ): Promise<void> => {
        const session = current.current;

        if (!api || !session) return Promise.resolve();

        put(next(session));

        return new Promise((done) => {
            outbox.current.push({
                isSet,
                send: (client) => send(client, session),
                staleNotice,
                sessionId: session.id,
                base: session,
                generation: generation.current,
                failures: 0,
                done,
            });

            // A write tapped while an earlier one is being retried joins the
            // count in the header.
            report();
            void pump();
        });
    }, [api, pump, put, report]);

    const addEntry = useCallback(async (exerciseName: string): Promise<void> => {
        const expectedEntryCount = current.current?.entries.length ?? 0;

        await write(
            (session) => withEntries(session, [...session.entries, { exerciseName, sets: [] }]),
            (client, session) => client.addEntry(session.id, exerciseName, expectedEntryCount),
            'This session had changed elsewhere. Reloaded — add the exercise again.',
            false,
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
            true,
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
            true,
        );
    }, [write]);

    const editSet = useCallback(async (
        entryIndex: number,
        setIndex: number,
        set: WorkSet,
    ): Promise<void> => {
        const entry = current.current?.entries[entryIndex];

        if (!entry || setIndex >= entry.sets.length) return;

        const expectedSetCount = entry.sets.length;

        await write(
            (session) => withEntries(session, session.entries.map((one, index) => (
                index === entryIndex
                    ? { ...one, sets: one.sets.map((logged, at) => (at === setIndex ? set : logged)) }
                    : one
            ))),
            (client, session) => client.editSet(session.id, entryIndex, setIndex, {
                exerciseName: entry.exerciseName,
                expectedSetCount,
                weightKg: set.weightKg,
                reps: set.reps,
                rpe: set.rpe,
            }),
            'This session had changed elsewhere. Reloaded — edit the set again.',
            true,
        );
    }, [write]);

    const swapEntry = useCallback(async (
        entryIndex: number,
        to: string,
        withSets = false,
    ): Promise<void> => {
        const entry = current.current?.entries[entryIndex];
        const expectedEntryCount = current.current?.entries.length;

        if (!entry || expectedEntryCount === undefined || entry.exerciseName === to) return;

        // Which of the two shapes this swap is, stated rather than left to the
        // server to discover: a set tapped a moment ago may still be in flight,
        // and the count is what makes the API refuse a swap that raced it
        // instead of replacing an exercise that has just been lifted.
        const expectedSetCount = entry.sets.length;

        await write(
            (session) => withEntries(
                session,
                swapped(session.entries, entryIndex, to, withSets).entries,
            ),
            (client, session) => client.swapEntry(session.id, {
                entryIndex,
                exerciseName: entry.exerciseName,
                expectedEntryCount,
                expectedSetCount,
                to,
                withSets,
            }),
            'This session had changed elsewhere. Reloaded — swap it again.',
            false,
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
            false,
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
            false,
        );
    }, [write]);

    const submit = useCallback(async (): Promise<boolean> => {
        const session = current.current;

        if (!api || !session) return false;

        setBusy(true);
        setError(null);

        // A submit is not guarded by a count, so one sent ahead of a set still
        // in the outbox would file the workout without it. Wait for what is in
        // flight — a moment, normally — and refuse while anything is being
        // retried rather than sit out a minute of backoff behind a spinner.
        await settled();

        const unsent = outbox.current.filter((job) => job.generation === generation.current);

        if (unsent.length > 0) {
            setBusy(false);
            setNotice(
                `${unsaved(unsent)} still waiting to save. Submit once the header says saved.`,
            );

            return false;
        }

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
            setError(messageOf(cause));

            return false;
        } finally {
            setBusy(false);
        }
    }, [api, put, settled]);

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
        waiting,
        start,
        open,
        close,
        addEntry,
        logSet,
        removeSet,
        editSet,
        swapEntry,
        removeEntry,
        reorderEntry,
        submit,
        dismiss,
    };
}
