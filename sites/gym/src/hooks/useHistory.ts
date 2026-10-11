import { useCallback, useEffect, useRef, useState } from 'react';

import { messageOf, type GymApi } from '../lib/api';
import type { SessionSummary } from '../lib/types';

export interface HistoryState {
    /** What has been read so far, by mesocycle id. A missing key is unread. */
    sessions: Record<string, SessionSummary[]>;

    /** The block being read, if one is. At most one is ever in flight. */
    loading: string | null;

    error: string | null;

    /** Reads one block's sessions, unless they are already held. */
    load: (mesoId: string) => void;

    /** Reads them again — after something wrote to that block. */
    reload: (mesoId: string) => void;
}

/**
 * The sessions of a block, read when the block is opened.
 *
 * History used to end at the current block, because `/mesocycles/current` is
 * the one call that carries sessions and it carries only that block's. Other
 * blocks are a second call each — `GET /gym/workouts?mesoId=` — and the shape
 * here follows from what that costs: a block is read when it is opened, once,
 * and then held for as long as the sign-in lasts.
 *
 * Not `useResource`: that reads one thing on mount, and this reads an unknown
 * number of things on demand. Here the current block is deliberately not among
 * them — `useBlock` already holds it, and reading it again would be the same
 * query twice on the one block guaranteed to be looked at. gymbro, which has no
 * `useBlock`, reads every block through this, current included.
 */
export function useHistory(api: GymApi | null): HistoryState {
    const [sessions, setSessions] = useState<Record<string, SessionSummary[]>>({});
    const [loading, setLoading] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    // What is held, readable from a callback that was created before the last
    // render. `sessions` is the copy the screen renders; this is the one the
    // "already read it" check has to consult, and they are set together.
    const held = useRef<Record<string, SessionSummary[]>>({});

    // The newest read asked for, per block. A reload sent while an earlier
    // read of the same block is still out can be answered first, and the
    // older answer landing after it must not put the stale list back.
    const latest = useRef(new Map<string, number>());
    const tickets = useRef(0);

    // A different client is a different sign-in, and what was read belonged to
    // whoever was signed in when it was read — including a read still on its
    // way, which forgetting its ticket turns away when it lands.
    useEffect(() => {
        held.current = {};
        latest.current = new Map();
        setSessions({});
        setLoading(null);
        setError(null);
    }, [api]);

    const read = useCallback(async (mesoId: string, again: boolean): Promise<void> => {
        if (!api) return;
        if (!again && held.current[mesoId]) return;

        tickets.current += 1;

        const ticket = tickets.current;
        const isLatest = () => latest.current.get(mesoId) === ticket;

        latest.current.set(mesoId, ticket);
        setLoading(mesoId);

        try {
            const loaded = await api.sessions(mesoId);

            if (!isLatest()) return;

            held.current = { ...held.current, [mesoId]: loaded };
            setSessions(held.current);
            setError(null);
        } catch (cause) {
            if (isLatest()) setError(messageOf(cause));
        } finally {
            if (isLatest()) setLoading((current) => (current === mesoId ? null : current));
        }
    }, [api]);

    const load = useCallback((mesoId: string) => { void read(mesoId, false); }, [read]);
    const reload = useCallback((mesoId: string) => { void read(mesoId, true); }, [read]);

    return { sessions, loading, error, load, reload };
}
