import { useCallback, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'theme';

function readStoredTheme(): Theme | null {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);

        return stored === 'dark' || stored === 'light' ? stored : null;
    } catch {
        // Storage unavailable; fall through to the OS preference.
        return null;
    }
}

function initialTheme(): Theme {
    const stored = readStoredTheme();

    if (stored) return stored;

    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

// Same mechanism as sites/run: data-theme on <html> so `color-scheme` reaches
// the page canvas, both values stamped so a dark OS cannot override a reader
// who picked light.
export function useTheme(): [Theme, () => void] {
    const [theme, setTheme] = useState<Theme>(initialTheme);

    useEffect(() => {
        const dark = theme === 'dark';

        document.documentElement.setAttribute('data-theme', theme);

        // The address-bar tint follows the page canvas. The <meta> lives in
        // index.html rather than in the tree React owns, so it is set by hand.
        document.querySelector('meta[name="theme-color"]')
            ?.setAttribute('content', dark ? '#121212' : '#f8f9fa');
    }, [theme]);

    const toggle = useCallback(() => {
        setTheme((current) => {
            const next: Theme = current === 'dark' ? 'light' : 'dark';

            try {
                localStorage.setItem(STORAGE_KEY, next);
            } catch {
                // Nothing to do; the toggle still works for this page view.
            }

            return next;
        });
    }, []);

    return [theme, toggle];
}
