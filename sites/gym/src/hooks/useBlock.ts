import { useCallback, useEffect, useState } from 'react';

import type { GymApi } from '../lib/api';
import type { CurrentBlock } from '../lib/types';

export interface BlockState {
    block: CurrentBlock | null;
    loading: boolean;
    error: string | null;
    reload: () => void;
}

/**
 * The current mesocycle and its sessions — one call that serves Today, the
 * block map and History alike.
 *
 * `mesocycle: null` with no sessions is a first run rather than a failure, and
 * it reaches the screens as exactly that: a block of `null`, which Today turns
 * into the empty state that sends you to Plan.
 */
export function useBlock(api: GymApi | null): BlockState {
    const [block, setBlock] = useState<CurrentBlock | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Bumped to re-run the effect. A counter rather than a callback that sets
    // state directly, so a reload triggered while one is in flight cannot leave
    // the older answer on screen.
    const [nonce, setNonce] = useState(0);

    useEffect(() => {
        if (!api) return;

        let cancelled = false;

        setLoading(true);

        void (async () => {
            try {
                const current = await api.currentBlock();

                if (cancelled) return;

                setBlock(current);
                setError(null);
            } catch (cause) {
                if (cancelled) return;

                // The API writes its `message` to be shown as-is, which is why
                // it is not reworded here.
                setError(cause instanceof Error ? cause.message : String(cause));
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => { cancelled = true; };
    }, [api, nonce]);

    const reload = useCallback(() => setNonce((value) => value + 1), []);

    return { block, loading, error, reload };
}
