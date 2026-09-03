import { EXERCISE_LIBRARY_URL } from './config';
import type { ExerciseLibrary } from './types';

/**
 * The built-in exercise library.
 *
 * Fetched anonymously from the CDN, not from the API: it is identical for
 * every user and changes when the app ships, so it costs no function
 * invocation, no token and no RU. The blob is served with
 * `Cache-Control: public, max-age=86400`, so the browser cache does the
 * caching and this module only avoids asking for it twice in one page load.
 */
let pending: Promise<ExerciseLibrary> | null = null;

/**
 * What the app falls back to when the CDN is unreachable — the twenty names
 * the prototype shipped with.
 *
 * A gym with no signal is the normal case rather than the exceptional one, and
 * a picker with nothing in it would block logging entirely. Custom names are
 * typed inline and post with the entry, so this is a convenience list, not a
 * source of truth: nothing about a session depends on the name being in it.
 */
const FALLBACK: ExerciseLibrary = {
    version: 'bundled',
    equipment: ['Bar', 'Dumbbell', 'Cable', 'Machine', 'Bodyweight'],
    exercises: [
        { name: 'Bench Press', equipment: 'Bar' },
        { name: 'Bench Press', equipment: 'Dumbbell' },
        { name: 'Incline Bench Press', equipment: 'Bar' },
        { name: 'Overhead Press', equipment: 'Bar' },
        { name: 'Squat', equipment: 'Bar' },
        { name: 'Front Squat', equipment: 'Bar' },
        { name: 'Deadlift', equipment: 'Bar' },
        { name: 'Romanian Deadlift', equipment: 'Bar' },
        { name: 'Barbell Row', equipment: 'Bar' },
        { name: 'Pull-up', equipment: 'Bodyweight' },
        { name: 'Dip', equipment: 'Bodyweight' },
        { name: 'Lat Pulldown', equipment: 'Cable' },
        { name: 'Seated Row', equipment: 'Cable' },
        { name: 'Cable Fly', equipment: 'Cable' },
        { name: 'Triceps Pushdown', equipment: 'Cable' },
        { name: 'Leg Press', equipment: 'Machine' },
        { name: 'Leg Curl', equipment: 'Machine' },
        { name: 'Calf Raise', equipment: 'Machine' },
        { name: 'Lateral Raise', equipment: 'Dumbbell' },
        { name: 'Bicep Curl', equipment: 'Dumbbell' },
    ],
};

function isLibrary(value: unknown): value is ExerciseLibrary {
    if (typeof value !== 'object' || value === null) return false;

    const raw = value as Record<string, unknown>;

    return Array.isArray(raw['exercises']) && Array.isArray(raw['equipment']);
}

export function loadLibrary(): Promise<ExerciseLibrary> {
    pending ??= (async () => {
        try {
            // No Authorization header, deliberately: adding one would turn a
            // simple cross-origin GET into a preflight the blob endpoint has
            // no CORS rule for, and the file needs no token.
            const response = await fetch(EXERCISE_LIBRARY_URL, { credentials: 'omit' });

            if (!response.ok) return FALLBACK;

            const payload: unknown = await response.json();

            return isLibrary(payload) ? payload : FALLBACK;
        } catch {
            // Offline, or the storage account has no CORS rule for this origin
            // — which fails as a bare TypeError indistinguishable from being
            // offline. Either way the picker still works.
            return FALLBACK;
        }
    })();

    return pending;
}

/**
 * The equipment chip under an exercise name in a session.
 *
 * The API stores the name only, so this is a lookup rather than a stored
 * field. A name that is not in the library is one the user typed, which is
 * exactly what the design labels "Custom".
 */
export function equipmentFor(library: ExerciseLibrary | null, name: string): string {
    const match = library?.exercises.find((exercise) => exercise.name === name);

    return match?.equipment ?? 'Custom';
}
