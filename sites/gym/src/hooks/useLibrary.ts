import { useEffect, useState } from 'react';

import { loadLibrary } from '../lib/library';
import type { ExerciseLibrary } from '../lib/types';

/**
 * The shipped exercise library, fetched once per page load.
 *
 * There is no loading state on purpose: the picker renders whatever it has,
 * and `loadLibrary` answers with the bundled list rather than a failure when
 * the CDN is unreachable, so `null` here only ever means "the first frame".
 */
export function useLibrary(): ExerciseLibrary | null {
    const [library, setLibrary] = useState<ExerciseLibrary | null>(null);

    useEffect(() => {
        let cancelled = false;

        void loadLibrary().then((loaded) => {
            if (!cancelled) setLibrary(loaded);
        });

        return () => { cancelled = true; };
    }, []);

    return library;
}
