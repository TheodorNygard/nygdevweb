import { API_BASE } from './config';
import type {
    CurrentBlock,
    DayInput,
    DayTemplate,
    EntryMoveResult,
    EntryResult,
    Mesocycle,
    MesocycleSummary,
    PlannedExercise,
    RemoveEntryResult,
    RemoveSetResult,
    SessionSummary,
    SetResult,
    StartedWorkout,
    Workout,
} from './types';

/**
 * A failure the API described. `code` is the machine-readable `error` field —
 * branch on that; `message` is written by the API to be shown or logged as-is,
 * which is why it goes on screen unedited.
 */
export class ApiError extends Error {
    readonly status: number;

    readonly code: string;

    readonly detail: unknown;

    constructor(status: number, code: string, message: string, detail?: unknown) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.code = code;
        this.detail = detail;
    }

    /**
     * The client's copy of a count is stale. Nothing was written, so the fix is
     * to re-read the workout and log again from what it holds — which is what
     * the session hook does rather than surfacing this to the user.
     */
    get isCountMismatch(): boolean {
        return this.code === 'count_mismatch';
    }

    /**
     * A drag's guard did not hold — the session moved under it some other way.
     * Nothing was written, and the fix is the same shape as a stale count: the
     * session hook re-reads and resyncs rather than showing this as a failure.
     */
    get isReorderConflict(): boolean {
        return this.code === 'reorder_conflict';
    }

    /**
     * A removal's guard did not hold — the session holds a different number of
     * exercises, or a different one at that index. Nothing was written, and
     * like the two above the fix is a re-read rather than a message.
     */
    get isEntryConflict(): boolean {
        return this.code === 'entry_conflict';
    }
}

/** Reaching the network failed — offline, DNS, a blocked CORS preflight. */
export class NetworkError extends Error {
    constructor(cause: unknown) {
        super('The network request did not complete. Check the connection and try again.');
        this.name = 'NetworkError';
        this.cause = cause;
    }
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface Call {
    method: Method;
    path: string;
    body?: unknown;
}

/**
 * The gym API, bound to one token source.
 *
 * The token is fetched per call rather than held, because MSAL renews it and a
 * captured string would be the expired one an hour into a training block.
 * `getToken` is expected to serve from cache when it can — it is called on
 * every logged set.
 */
export class GymApi {
    private readonly getToken: () => Promise<string>;

    constructor(getToken: () => Promise<string>) {
        this.getToken = getToken;
    }

    private async send<T>({ method, path, body }: Call): Promise<T> {
        const token = await this.getToken();

        const headers: Record<string, string> = { Authorization: `Bearer ${token}` };

        if (body !== undefined) headers['Content-Type'] = 'application/json';

        let response: Response;

        try {
            response = await fetch(`${API_BASE}${path}`, {
                method,
                headers,

                // No cookies, and none wanted: every request carries its own
                // bearer token, and support_credentials is off in the function
                // app's CORS block for the same reason.
                credentials: 'omit',
                ...(body === undefined ? {} : { body: JSON.stringify(body) }),
            });
        } catch (cause) {
            throw new NetworkError(cause);
        }

        // Every response this API gives is JSON, errors included. A body that
        // does not parse is the platform answering rather than the function —
        // most often Easy Auth rejecting the token before any code ran.
        let payload: unknown;

        try {
            payload = await response.json();
        } catch {
            throw new ApiError(
                response.status,
                response.status === 401 ? 'not_signed_in' : 'unreadable_response',
                `The API answered ${response.status} with a body that is not JSON. `
                + 'That is the platform answering rather than the function — most often Easy '
                + 'Auth rejecting the token before the request reached any code.',
            );
        }

        const envelope = payload as Record<string, unknown>;

        if (!response.ok || envelope['ok'] === false) {
            throw new ApiError(
                response.status,
                typeof envelope['error'] === 'string' ? envelope['error'] : 'unknown_error',
                typeof envelope['message'] === 'string'
                    ? envelope['message']
                    : `The API answered ${response.status}.`,
                envelope['detail'],
            );
        }

        return payload as T;
    }

    /** Everything Today and the block map need, in one call. */
    currentBlock(): Promise<CurrentBlock> {
        return this.send<CurrentBlock>({ method: 'GET', path: '/gym/mesocycles/current' });
    }

    /**
     * Every block this user has planned, newest first.
     *
     * Separate from `currentBlock()` rather than folded into it: only the Plan
     * tab reads this, and Today reloads after every submitted session. One call
     * out of the two would put the list's cost on the hot path.
     */
    async mesocycles(): Promise<MesocycleSummary[]> {
        const body = await this.send<{ mesocycles: MesocycleSummary[] }>({
            method: 'GET',
            path: '/gym/mesocycles',
        });

        return body.mesocycles;
    }

    /**
     * Opens an existing block. Idempotent — switching to the one you are
     * already on writes what is already there.
     */
    async switchMesocycle(mesoId: string): Promise<Mesocycle> {
        const body = await this.send<{ mesocycle: Mesocycle }>({
            method: 'PUT',
            path: '/gym/mesocycles/current',
            body: { mesoId },
        });

        return body.mesocycle;
    }

    /**
     * Deletes a block **and every session logged in it**.
     *
     * The one call here that destroys training history. Everything else is
     * guarded so a retry cannot do damage; this is guarded only by the
     * confirmation in front of it, because there is no undo on the other end.
     * `BlockSheet` names the count before it offers the button.
     *
     * `currentMesoId` is where the pointer landed — null both when nothing
     * moved and when no block is left, which is why the caller reloads rather
     * than reasoning about it.
     */
    deleteMesocycle(
        mesoId: string,
    ): Promise<{ sessionsDeleted: number; currentMesoId: string | null }> {
        return this.send({
            method: 'DELETE',
            path: `/gym/mesocycles/${encodeURIComponent(mesoId)}`,
        });
    }

    /** Creating is also switching — the new block is current in the same transaction. */
    async createMesocycle(name: string, weeks: number, days: DayInput[]): Promise<Mesocycle> {
        const body = await this.send<{ mesocycle: Mesocycle }>({
            method: 'POST',
            path: '/gym/mesocycles',
            body: { name, weeks, days },
        });

        return body.mesocycle;
    }

    /**
     * All three fields optional; an absent one is left alone. `days` is
     * replaced wholesale when sent, plans included — which is why the Plan tab
     * sends back the whole array it is holding rather than a diff.
     */
    async updateMesocycle(
        mesoId: string,
        patch: { name?: string; weeks?: number; days?: DayInput[] },
    ): Promise<Mesocycle> {
        const body = await this.send<{ mesocycle: Mesocycle }>({
            method: 'PATCH',
            path: `/gym/mesocycles/${encodeURIComponent(mesoId)}`,
            body: patch,
        });

        return body.mesocycle;
    }

    /**
     * The day templates this user has saved, newest first.
     *
     * Only the saved ones. The built-in templates are a CDN blob — see
     * `lib/templates` — and the sheet shows both lists together.
     *
     * There is no call for *applying* a template and there should not be:
     * dropping one into a day is an assignment on the Plan tab's local draft,
     * which `updateMesocycle` then saves along with everything else on that
     * screen. A route for it would be a second way to write `days`.
     */
    async templates(): Promise<DayTemplate[]> {
        const body = await this.send<{ templates: DayTemplate[] }>({
            method: 'GET',
            path: '/gym/templates',
        });

        return body.templates;
    }

    /** Saves a day plan under a name. The API answers with the id it minted. */
    async saveTemplate(name: string, plan: PlannedExercise[]): Promise<DayTemplate> {
        const body = await this.send<{ template: DayTemplate }>({
            method: 'POST',
            path: '/gym/templates',
            body: { name, plan },
        });

        return body.template;
    }

    /**
     * Re-saves a template in place. Both fields are always sent — a template is
     * two of them — and `plan` replaces wholesale.
     *
     * No block changes as a result. A day filled from this template copied the
     * exercises at the time, which is what makes re-saving safe to do without
     * asking what it might disturb.
     */
    async replaceTemplate(
        templateId: string,
        name: string,
        plan: PlannedExercise[],
    ): Promise<DayTemplate> {
        const body = await this.send<{ template: DayTemplate }>({
            method: 'PUT',
            path: `/gym/templates/${encodeURIComponent(templateId)}`,
            body: { name, plan },
        });

        return body.template;
    }

    /**
     * Removes a saved template. Nothing cascades: what is destroyed is the
     * shortcut, never a planned day or a logged session.
     */
    deleteTemplate(templateId: string): Promise<{ id: string; deleted: boolean }> {
        return this.send({
            method: 'DELETE',
            path: `/gym/templates/${encodeURIComponent(templateId)}`,
        });
    }

    /**
     * Start. `date` is the phone's local date, and has to be: the API runs in
     * UTC, so a 21:00 session in Oslo is already tomorrow there for half the
     * year and a server-derived date would file it under the wrong day.
     */
    startWorkout(date: string, week: number, dayIndex: number): Promise<StartedWorkout> {
        return this.send<StartedWorkout>({
            method: 'POST',
            path: '/gym/workouts',
            body: { date, week, dayIndex },
        });
    }

    async workout(sessionId: string): Promise<Workout> {
        const body = await this.send<{ workout: Workout }>({
            method: 'GET',
            path: `/gym/workouts/${encodeURIComponent(sessionId)}`,
        });

        return body.workout;
    }

    /** History. Without a mesoId, the current block. Newest first. */
    async sessions(mesoId?: string): Promise<SessionSummary[]> {
        const query = mesoId ? `?mesoId=${encodeURIComponent(mesoId)}` : '';
        const body = await this.send<{ sessions: SessionSummary[] }>({
            method: 'GET',
            path: `/gym/workouts${query}`,
        });

        return body.sessions;
    }

    /**
     * The picker. `expectedEntryCount` is how many exercises the session held
     * before the tap, so a retried request cannot add the exercise twice.
     */
    addEntry(
        sessionId: string,
        exerciseName: string,
        expectedEntryCount: number,
    ): Promise<EntryResult> {
        return this.send<EntryResult>({
            method: 'POST',
            path: `/gym/workouts/${encodeURIComponent(sessionId)}/entries`,
            body: { exerciseName, expectedEntryCount },
        });
    }

    /**
     * The tap. `expectedSetCount` is the guard that makes "Log same again" safe
     * to hammer: a request whose response was lost comes back
     * `alreadyRecorded`, not a second set.
     */
    logSet(
        sessionId: string,
        set: {
            entryIndex: number;
            expectedSetCount: number;
            weightKg: number;
            reps: number;
            rpe: number | null;
        },
    ): Promise<SetResult> {
        return this.send<SetResult>({
            method: 'POST',
            path: `/gym/workouts/${encodeURIComponent(sessionId)}/sets`,
            body: set,
        });
    }

    /**
     * `expectedSetCount` matters more here than elsewhere: an unguarded
     * remove-by-index is the one call a retry could turn into deleting a set
     * the user did do.
     */
    removeSet(
        sessionId: string,
        entryIndex: number,
        setIndex: number,
        expectedSetCount: number,
    ): Promise<RemoveSetResult> {
        return this.send<RemoveSetResult>({
            method: 'DELETE',
            path: `/gym/workouts/${encodeURIComponent(sessionId)}/entries/${entryIndex}`
                + `/sets/${setIndex}?expectedSetCount=${expectedSetCount}`,
        });
    }

    /**
     * Takes an exercise back out of the session — the picker's undo.
     *
     * Guarded by two things rather than one. The count is the same guard every
     * write here carries; the name is what an index alone cannot say once the
     * list has been added to or dragged, and it is what lets a retry after a
     * lost response come back `alreadyRemoved` instead of removing a second
     * exercise.
     *
     * The API refuses this for an entry that still holds sets — a lifted
     * exercise is a logged workout, and nothing deletes one as a side effect —
     * so the screen only offers it once the last set is gone.
     */
    removeEntry(
        sessionId: string,
        entryIndex: number,
        exerciseName: string,
        expectedEntryCount: number,
    ): Promise<RemoveEntryResult> {
        return this.send<RemoveEntryResult>({
            method: 'DELETE',
            path: `/gym/workouts/${encodeURIComponent(sessionId)}/entries/${entryIndex}`
                + `?expectedEntryCount=${expectedEntryCount}`
                + `&exerciseName=${encodeURIComponent(exerciseName)}`,
        });
    }

    /**
     * The drag handle. `to` is where the exercise lands, not a swap partner —
     * same splice semantics as `reordered()` in `hooks/useDragReorder`, so the
     * pair a drag produces is sent through unchanged.
     *
     * `exerciseName` is what the caller believes sits at `from` right now. It
     * is the guard: unlike a set append, a move cannot be told apart from its
     * own retry by a count alone, since a move never changes how many entries
     * there are. The server checks this name against what is actually at
     * `from`, and — for the retry case — at `to`.
     */
    moveEntry(
        sessionId: string,
        move: {
            from: number;
            to: number;
            exerciseName: string;
            expectedEntryCount: number;
        },
    ): Promise<EntryMoveResult> {
        return this.send<EntryMoveResult>({
            method: 'POST',
            path: `/gym/workouts/${encodeURIComponent(sessionId)}/entries/move`,
            body: move,
        });
    }

    /**
     * draft → submitted. One patch, idempotent, safe to retry.
     *
     * Answers whether this workout became the day's plan. A day can be left
     * unplanned when a block is written, and the first session submitted
     * against one is what fills it in — the exercises that were lifted, with
     * the sets they got — so the week after opens seeded rather than empty.
     * False on every submit after that, which is nearly all of them.
     */
    async submit(sessionId: string): Promise<boolean> {
        const body = await this.send<{ planned?: boolean }>({
            method: 'POST',
            path: `/gym/workouts/${encodeURIComponent(sessionId)}/submit`,
        });

        return body.planned === true;
    }

    /** The answer to the duplicate a cell can now collect. */
    async deleteWorkout(sessionId: string): Promise<void> {
        await this.send({
            method: 'DELETE',
            path: `/gym/workouts/${encodeURIComponent(sessionId)}`,
        });
    }
}
