import { useCallback, useEffect, useRef, useState } from 'react';

import { type GymApi, type SessionSummary } from '../lib/gym';

export interface SessionsState {
    /** What has been read so far, by mesocycle id. A missing key is unread. */
    byBlock: Record<string, SessionSummary[]>;

    /** The block being read, if one is. At most one is ever in flight. */
    loading: string | null;

    error: string | null;

    /** Reads one block's sessions, unless they are already held. */
    load: (mesoId: string) => void;

    /** Reads them again — after something wrote to that block. */
    reload: (mesoId: string) => void;
}

/**
 * The sessions logged against a block, read when the block is looked at.
 *
 * Every view here is a view *of a block*, and switching between them in the
 * sidebar is the ordinary thing to do — so this is a cache keyed on the block
 * rather than a single resource that refetches. A block is read once and then
 * held for as long as the sign-in lasts, because sessions come from a phone
 * that is not being used while a plan is being written on a desktop.
 *
 * `reload` is the answer for when that stops being true, and the Dashboard
 * offers it as a button rather than polling: a background refetch that moved
 * the block map while somebody was reading it would be worse than a stale one
 * they chose to refresh.
 */
export function useSessions(api: GymApi | null): SessionsState {
    const [byBlock, setByBlock] = useState<Record<string, SessionSummary[]>>({});
    const [loading, setLoading] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    // What is held, readable from a callback created before the last render.
    // `byBlock` is the copy the screens render; this is the one the "already
    // read it" check has to consult, and they are set together.
    const held = useRef<Record<string, SessionSummary[]>>({});

    // A different client is a different sign-in, and what was read belonged to
    // whoever was signed in when it was read.
    useEffect(() => {
        held.current = {};
        setByBlock({});
        setError(null);
    }, [api]);

    const read = useCallback(async (mesoId: string, again: boolean): Promise<void> => {
        if (!api) return;
        if (!again && held.current[mesoId]) return;

        setLoading(mesoId);

        try {
            const loaded = await api.sessions(mesoId);

            held.current = { ...held.current, [mesoId]: loaded };
            setByBlock(held.current);
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

    return { byBlock, loading, error, load, reload };
}
