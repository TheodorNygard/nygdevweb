const timeFormat = new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'medium',
});

// Says "in 42 minutes" in the reader's locale rather than in English.
const relativeFormat = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31536000],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
    ['second', 1],
];

export function relativeSeconds(seconds: number): string {
    const abs = Math.abs(seconds);

    for (const [unit, size] of RELATIVE_UNITS) {
        if (abs >= size || unit === 'second') {
            return relativeFormat.format(Math.round(seconds / size), unit);
        }
    }

    return '';
}

export interface Moment {
    absolute: string;
    relative: string;
}

// A JWT time claim is seconds since the epoch; Date wants milliseconds. Getting
// that wrong puts every timestamp in 1970, which is why the raw number stays on
// screen next to the formatted date rather than being replaced by it.
export function formatEpoch(value: unknown, now: number = Date.now()): Moment | null {
    const seconds = Number(value);

    if (!Number.isFinite(seconds)) return null;

    const date = new Date(seconds * 1000);

    if (Number.isNaN(date.getTime())) return null;

    return {
        absolute: timeFormat.format(date),
        relative: relativeSeconds(seconds - now / 1000),
    };
}

export function formatClaimValue(value: unknown): string {
    if (Array.isArray(value)) return value.join(' ');
    if (value === null) return 'null';
    if (typeof value === 'object') return JSON.stringify(value);

    return String(value);
}

export function formatJson(value: unknown): string {
    return JSON.stringify(value, null, 2);
}
