import { useCallback, useEffect, useState } from 'react';

import type { GymApi } from '../lib/api';
import type { MesocycleSummary } from '../lib/types';

export interface BlocksState {
    blocks: MesocycleSummary[];
    loading: boolean;
    error: string | null;
    reload: () => void;
}

/**
 * Every block the user has planned — the Plan tab's list.
 *
 * Deliberately not part of `useBlock`. That one is reloaded after every
 * submitted session and every back-out of the logging screen, and this list is
 * read by one tab that none of those touch; sharing a reload would put its cost
 * on the app's hottest path for data nothing there shows.
 *
 * An empty list is a first run rather than a failure, the same as a null
 * mesocycle on `/current`.
 */
export function useBlocks(api: GymApi | null): BlocksState {
    const [blocks, setBlocks] = useState<MesocycleSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [nonce, setNonce] = useState(0);

    useEffect(() => {
        if (!api) return;

        let cancelled = false;

        setLoading(true);

        void (async () => {
            try {
                const listed = await api.mesocycles();

                if (cancelled) return;

                setBlocks(listed);
                setError(null);
            } catch (cause) {
                if (cancelled) return;

                setError(cause instanceof Error ? cause.message : String(cause));
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => { cancelled = true; };
    }, [api, nonce]);

    const reload = useCallback(() => setNonce((value) => value + 1), []);

    return { blocks, loading, error, reload };
}
