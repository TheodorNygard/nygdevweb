import { useCallback, useState } from 'react';

import { readTheme, saveTheme, type Theme } from '../lib/theme';

/**
 * The theme as state, so the picker's chips can show which one is on.
 *
 * The page is already drawn in it — `main.tsx` applies the stored theme before
 * React mounts — so this reads what was stored rather than deciding anything.
 * Picking one stores it and redraws in the same call; the state here is only
 * what the picker renders from.
 */
export function useTheme(): [Theme, (theme: Theme) => void] {
    const [theme, setTheme] = useState<Theme>(readTheme);

    const pick = useCallback((next: Theme) => {
        saveTheme(next);
        setTheme(next);
    }, []);

    return [theme, pick];
}
