import { useCallback, useEffect, useRef, useState } from 'react';

import type { GymApi } from '../lib/api';
import type { SessionSummary } from '../lib/types';

export interface HistoryState {
    /** What has been read so far, by mesocycle id. A missing key is unread. */
    sessions: Record<string, SessionSummary[]>;

    /** The block being read, if one is. At most one is ever in flight. */
    loading: string | null;

    error: string | null;

    /** Reads one block's sessions, unless they are already held. */
    load: (mesoId: string) => void;

    /** Reads them again — after a session is deleted out of one. */
    reload: (mesoId: string) => void;
}

/**
 * The sessions of blocks other than the one being trained.
 *
 * History used to end at the current block, because `/mesocycles/current` is
 * the one call that carries sessions and it carries only that block's. Past
 * blocks are a second call each — `GET /gym/workouts?mesoId=` — and the shape
 * here follows from what that costs: a block is read when it is opened, once,
 * and then held for as long as the sign-in lasts.
 *
 * Not `useResource`: that reads one thing on mount, and this reads an unknown
 * number of things on demand. The current block is deliberately not among them
 * — `useBlock` already holds it, and reading it again here would be the same
 * query twice on the one block guaranteed to be looked at.
 */
export function useHistory(api: GymApi | null): HistoryState {
    const [sessions, setSessions] = useState<Record<string, SessionSummary[]>>({});
    const [loading, setLoading] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    // What is held, readable from a callback that was created before the last
    // render. `sessions` is the copy the screen renders; this is the one the
    // "already read it" check has to consult, and they are set together.
    const held = useRef<Record<string, SessionSummary[]>>({});

    // A different client is a different sign-in, and what was read belonged to
    // whoever was signed in when it was read.
    useEffect(() => {
        held.current = {};
        setSessions({});
        setError(null);
    }, [api]);

    const read = useCallback(async (mesoId: string, again: boolean): Promise<void> => {
        if (!api) return;
        if (!again && held.current[mesoId]) return;

        setLoading(mesoId);

        try {
            const loaded = await api.sessions(mesoId);

            held.current = { ...held.current, [mesoId]: loaded };
            setSessions(held.current);
            setError(null);
        } catch (cause) {
            // The API writes its message to be shown as-is.
            setError(cause instanceof Error ? cause.message : String(cause));
        } finally {
            setLoading((current) => (current === mesoId ? null : current));
        }
    }, [api]);

    const load = useCallback((mesoId: string) => { void read(mesoId, false); }, [read]);
    const reload = useCallback((mesoId: string) => { void read(mesoId, true); }, [read]);

    return { sessions, loading, error, load, reload };
}
