/**
 * Which palette the page is drawn in.
 *
 * A theme is a `[data-theme]` attribute on `<html>` and a block of tokens in
 * `styles.css` keyed on it; nothing else in the app knows which one is on.
 * This module owns the attribute: it reads the choice back from storage, writes
 * it before the first render so the page never paints in the wrong colours,
 * and keeps the browser chrome's `theme-color` in step so a phone's status bar
 * matches the screen under it.
 *
 * Both sites are dark, and so is every theme here. What a theme changes is
 * the greys and the accent — Graphite's near-black and acid lime, or Orchis's
 * lifted neutrals and purple — not whether the screen is dark. A light variant
 * would be a different design, not a theme.
 */

export const THEMES = [
    {
        id: 'graphite',
        label: 'Graphite',
        note: 'Near-black, lime. The original.',
    },
    {
        id: 'orchis',
        label: 'Orchis',
        note: 'Neutral greys and purple, after the GTK theme.',
    },
] as const;

export type Theme = (typeof THEMES)[number]['id'];

/** The `:root` defaults are this theme, so it is also what an unset attribute means. */
export const DEFAULT_THEME: Theme = 'graphite';

/**
 * One key rather than one per account. A theme is a preference of the phone
 * rather than of the training log, and it should survive signing out.
 */
const KEY = 'gymlog.theme';

function isTheme(value: unknown): value is Theme {
    return THEMES.some((theme) => theme.id === value);
}

/** The stored choice, or the default. Storage that cannot be read is the default. */
export function readTheme(): Theme {
    try {
        const stored = window.localStorage.getItem(KEY);

        return isTheme(stored) ? stored : DEFAULT_THEME;
    } catch {
        return DEFAULT_THEME;
    }
}

/**
 * Draws the page in a theme, without storing the choice.
 *
 * The attribute is what the stylesheet keys on. The `theme-color` meta is the
 * other half: iOS paints the status bar and the standalone app's chrome from
 * it, and a lime-era near-black bar over an Orchis grey screen is the seam a
 * theme is supposed not to have. Read back off the stylesheet rather than
 * repeated here, so the hex lives in one place.
 */
export function applyTheme(theme: Theme): void {
    const root = document.documentElement;

    if (theme === DEFAULT_THEME) delete root.dataset['theme'];
    else root.dataset['theme'] = theme;

    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');

    if (!meta) return;

    const bg = window.getComputedStyle(root).getPropertyValue('--bg').trim();

    if (bg) meta.content = bg;
}

/** Stores a choice and draws it. Failing to store is not worth reporting. */
export function saveTheme(theme: Theme): void {
    try {
        window.localStorage.setItem(KEY, theme);
    } catch {
        // Storage refused or over quota. The page still changes; the next
        // load opens on the default, which is what it did before this existed.
    }

    applyTheme(theme);
}
