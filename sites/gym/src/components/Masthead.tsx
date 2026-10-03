import { todayLabel } from '../lib/format';
import { THEMES, type Theme } from '../lib/theme';

interface MastheadProps {
    theme: Theme;
    onTheme: (theme: Theme) => void;
}

/**
 * The strip across the top of Today: the date, and the LOGBOOK mark.
 *
 * The mark is a theme switch. It was a wordmark with nothing behind it, on
 * the one screen every visit opens on, and a palette is the kind of preference
 * that wants one tap from there. Tapping it moves to the next theme in the
 * list, and the mark is drawn in the accent, so the tap answers itself: the
 * word changes colour with everything else. The Plan tab lists the same themes
 * as chips, for anybody who never thinks to tap a wordmark.
 *
 * Nothing on the mark says what it does, deliberately. There are three themes,
 * the tap cycles back round, and a caption under the wordmark would be
 * a label on the only element of this app that is allowed to be a flourish.
 * The accessible name says it in words.
 */
export function Masthead({ theme, onTheme }: MastheadProps) {
    const at = THEMES.findIndex((option) => option.id === theme);
    const next = THEMES[(at + 1) % THEMES.length] ?? THEMES[0];
    const current = THEMES[at] ?? THEMES[0];

    return (
        <div className="masthead">
            <span className="eyebrow eyebrow--wide">{todayLabel()}</span>
            <button
                type="button"
                className="masthead__mark"
                onClick={() => onTheme(next.id)}
                aria-label={`Theme: ${current.label}. Switch to ${next.label}.`}
                title={`${current.label} — tap for ${next.label}`}
            >
                LOGBOOK
            </button>
        </div>
    );
}
