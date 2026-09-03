import { useCallback, useEffect, useState } from 'react';

import type { GymApi } from '../lib/api';

export interface Resource<T> {
    data: T;
    loading: boolean;
    error: string | null;
    reload: () => void;
}

/**
 * One read of the API, held with its loading and error state.
 *
 * `load` has to be stable across renders — declare it at module scope, not in
 * the component — because it is an effect dependency, and a fresh closure each
 * render would refetch on every render.
 *
 * `reload` bumps a counter rather than setting state directly, so a reload
 * triggered while one is in flight cannot leave the older answer on screen.
 */
export function useResource<T>(
    api: GymApi | null,
    load: (api: GymApi) => Promise<T>,
    initial: T,
): Resource<T> {
    const [data, setData] = useState<T>(initial);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [nonce, setNonce] = useState(0);

    useEffect(() => {
        if (!api) return;

        let cancelled = false;

        setLoading(true);

        void (async () => {
            try {
                const loaded = await load(api);

                if (cancelled) return;

                setData(loaded);
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
    }, [api, load, nonce]);

    const reload = useCallback(() => setNonce((value) => value + 1), []);

    return { data, loading, error, reload };
}
