// The prototype's formatting rules, kept as functions so every screen renders a
// number the same way. Transcribed from `GymLog Graphite v2.dc.html`.

/** Integers plain, halves to one decimal: 100, not 100.0; 7.5, not 7.50. */
export function num(value: number): string {
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/** Volume, in tonnes past a thousand kilos so the number stays four characters. */
export function kg(value: number): string {
    return value >= 1000 ? `${(value / 1000).toFixed(1)}t` : `${Math.round(value)}kg`;
}

/** An average RPE, or the em dash the design uses when no set carried one. */
export function rpeLabel(value: number | null): string {
    return value === null ? '—' : value.toFixed(1);
}

/**
 * The plain-language half of the RPE slider. Reps in reserve is what the number
 * means to someone mid-set, and it is why the slider is not a number box.
 */
const RPE_NOTE: Record<string, string> = {
    '5': 'warm-up',
    '5.5': 'warm-up',
    '6': 'easy, 4+ left',
    '6.5': '4 left',
    '7': '3 reps left',
    '7.5': '2–3 left',
    '8': '2 reps left',
    '8.5': '1–2 left',
    '9': '1 rep left',
    '9.5': 'barely 1',
    '10': 'all out',
};

export function rpeNote(value: number): string {
    return RPE_NOTE[String(value)] ?? '';
}

/**
 * A week's intensity target in words — "2 reps in the tank", and the singular
 * at one. The same idea the RPE notes above are written in, which is the point:
 * the target and the slider under it should read as the same sentence.
 */
export function tankLabel(tank: number): string {
    return `${tank} rep${tank === 1 ? '' : 's'} in the tank`;
}

/**
 * Today as `YYYY-MM-DD` in the phone's timezone — the one field the API cannot
 * derive. Built from the local parts rather than `toISOString()`, which
 * converts to UTC and would file a 21:00 Oslo session under tomorrow.
 */
export function localDate(date: Date = new Date()): string {
    const pad = (value: number) => String(value).padStart(2, '0');

    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** `SAT 3 SEP` — the masthead date on Today. */
export function todayLabel(date: Date = new Date()): string {
    return date
        .toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })
        .toUpperCase();
}

/**
 * The date a session id carries. Ids are `session_YYYY-MM-DD` with an optional
 * `_2` for a second session that day, which is what lets History show a date
 * the API never sends as a field of its own.
 */
function sessionDate(sessionId: string): string | null {
    const match = /^session_(\d{4})-(\d{2})-(\d{2})(?:_(\d+))?$/.exec(sessionId);

    if (!match) return null;

    return `${match[1]}-${match[2]}-${match[3]}`;
}

/** `3 Sep` for a session row, or the raw id if it is not shaped like one. */
export function sessionDateLabel(sessionId: string): string {
    const date = sessionDate(sessionId);

    if (!date) return sessionId;

    return new Date(`${date}T00:00:00`)
        .toLocaleDateString([], { day: 'numeric', month: 'short' });
}

/** Which session of the day this is: 1 for `session_2026-09-03`, 2 for `…_2`. */
export function sessionOrdinal(sessionId: string): number {
    const match = /_(\d+)$/.exec(sessionId);

    return match?.[1] ? Number(match[1]) : 1;
}

/** `62:10` — the live session's elapsed time, mm:ss. */
export function elapsedLabel(seconds: number): string {
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
