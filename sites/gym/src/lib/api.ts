import { API_BASE } from './config';
import type {
    CurrentBlock,
    EntryResult,
    Mesocycle,
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

    /** No validated principal reached the function. Sign in again. */
    get isSignedOut(): boolean {
        return this.code === 'not_signed_in' || this.status === 401 || this.status === 403;
    }

    /**
     * Worth one retry: a timeout is over the ten-second budget rather than a
     * refusal, and every write in this API is safe to retry by construction.
     */
    get isRetryable(): boolean {
        return this.code === 'timed_out' || this.code === 'storage_error' || this.status >= 500;
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

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

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

                // No cookies on the call, and none wanted: every request
                // carries its own bearer token, and support_credentials is off
                // in the function app's CORS block for the same reason.
                credentials: 'omit',
                ...(body === undefined ? {} : { body: JSON.stringify(body) }),
            });
        } catch (cause) {
            throw new NetworkError(cause);
        }

        // Every response this API gives is JSON, errors included. A body that
        // does not parse is the platform answering rather than the function —
        // an Easy Auth rejection, or a gateway — so it is reported as what the
        // status says rather than as a parse failure.
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
    async currentBlock(): Promise<CurrentBlock> {
        const body = await this.send<{ mesocycle: Mesocycle | null; sessions: SessionSummary[] }>({
            method: 'GET',
            path: '/gym/mesocycles/current',
        });

        return { mesocycle: body.mesocycle, sessions: body.sessions };
    }

    /** Creating is also switching — the new block is current in the same transaction. */
    async createMesocycle(name: string, weeks: number, days: string[]): Promise<Mesocycle> {
        const body = await this.send<{ mesocycle: Mesocycle }>({
            method: 'POST',
            path: '/gym/mesocycles',
            body: { name, weeks, days },
        });

        return body.mesocycle;
    }

    /** All three fields optional; an absent one is left alone. */
    async updateMesocycle(
        mesoId: string,
        patch: { name?: string; weeks?: number; days?: string[] },
    ): Promise<Mesocycle> {
        const body = await this.send<{ mesocycle: Mesocycle }>({
            method: 'PATCH',
            path: `/gym/mesocycles/${encodeURIComponent(mesoId)}`,
            body: patch,
        });

        return body.mesocycle;
    }

    /**
     * Start. `date` is the phone's local date, and has to be: the API runs in
     * UTC, so a 21:00 session in Oslo is already tomorrow there for half the
     * year and a server-derived date would file it under the wrong day.
     */
    async startWorkout(date: string, week: number, dayIndex: number): Promise<StartedWorkout> {
        const body = await this.send<{ resumed: boolean; workout: Workout }>({
            method: 'POST',
            path: '/gym/workouts',
            body: { date, week, dayIndex },
        });

        return { resumed: body.resumed, workout: body.workout };
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
     * `expectedSetCount` is required here for a sharper reason than elsewhere:
     * an unguarded remove-by-index is the one call a retry could turn into
     * deleting a set the user did do.
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

    /** draft → submitted. One patch, idempotent, safe to retry. */
    async submit(sessionId: string): Promise<void> {
        await this.send({
            method: 'POST',
            path: `/gym/workouts/${encodeURIComponent(sessionId)}/submit`,
        });
    }

    /** The answer to the duplicate a cell can now collect. */
    async deleteWorkout(sessionId: string): Promise<void> {
        await this.send({
            method: 'DELETE',
            path: `/gym/workouts/${encodeURIComponent(sessionId)}`,
        });
    }
}
