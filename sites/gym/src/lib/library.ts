import { EXERCISE_LIBRARY_URL } from './config';
import type { ExerciseLibrary, LibraryExercise } from './types';

/**
 * The built-in exercise library, fetched anonymously from the CDN rather than
 * the API: it is identical for every user, so it costs no function invocation,
 * no token and no RU. The blob carries `Cache-Control: public, max-age=86400`,
 * so this only avoids asking for it twice in one page load.
 */
let pending: Promise<ExerciseLibrary> | null = null;

/**
 * What the app falls back to when the CDN is unreachable — a copy of
 * `gym/exercises.json` as it shipped. A gym with no signal is the normal case,
 * and a picker with nothing in it would block logging entirely; so would a swap
 * sheet with nothing to suggest, which is the moment the signal is least likely
 * to be there. Custom names post with the entry, so this is a convenience list
 * rather than a source of truth.
 */
const FALLBACK: ExerciseLibrary = {
    version: 'bundled',
    equipment: ['Bar', 'Dumbbell', 'Cable', 'Machine', 'Bodyweight'],
    exercises: [
        { name: 'Bench Press', equipment: 'Bar', group: 'Chest', pattern: 'horizontal-push' },
        { name: 'Dumbbell Bench Press', equipment: 'Dumbbell', group: 'Chest', pattern: 'horizontal-push', variationOf: 'Bench Press' },
        { name: 'Incline Bench Press', equipment: 'Bar', group: 'Chest', pattern: 'horizontal-push', variationOf: 'Bench Press' },
        { name: 'Incline Dumbbell Press', equipment: 'Dumbbell', group: 'Chest', pattern: 'horizontal-push', variationOf: 'Bench Press' },
        { name: 'Machine Chest Press', equipment: 'Machine', group: 'Chest', pattern: 'horizontal-push', variationOf: 'Bench Press' },
        { name: 'Push-up', equipment: 'Bodyweight', group: 'Chest', pattern: 'horizontal-push' },
        { name: 'Overhead Press', equipment: 'Bar', group: 'Shoulders', pattern: 'vertical-push' },
        { name: 'Dumbbell Shoulder Press', equipment: 'Dumbbell', group: 'Shoulders', pattern: 'vertical-push', variationOf: 'Overhead Press' },
        { name: 'Machine Shoulder Press', equipment: 'Machine', group: 'Shoulders', pattern: 'vertical-push', variationOf: 'Overhead Press' },
        { name: 'Squat', equipment: 'Bar', group: 'Quads', pattern: 'squat' },
        { name: 'Front Squat', equipment: 'Bar', group: 'Quads', pattern: 'squat', variationOf: 'Squat' },
        { name: 'Hack Squat', equipment: 'Machine', group: 'Quads', pattern: 'squat', variationOf: 'Squat' },
        { name: 'Goblet Squat', equipment: 'Dumbbell', group: 'Quads', pattern: 'squat', variationOf: 'Squat' },
        { name: 'Deadlift', equipment: 'Bar', group: 'Posterior', pattern: 'hinge' },
        { name: 'Trap Bar Deadlift', equipment: 'Bar', group: 'Posterior', pattern: 'hinge', variationOf: 'Deadlift' },
        { name: 'Sumo Deadlift', equipment: 'Bar', group: 'Posterior', pattern: 'hinge', variationOf: 'Deadlift' },
        { name: 'Romanian Deadlift', equipment: 'Bar', group: 'Posterior', pattern: 'hinge' },
        { name: 'Dumbbell Romanian Deadlift', equipment: 'Dumbbell', group: 'Posterior', pattern: 'hinge', variationOf: 'Romanian Deadlift' },
        { name: 'Barbell Row', equipment: 'Bar', group: 'Back', pattern: 'horizontal-pull' },
        { name: 'Dumbbell Row', equipment: 'Dumbbell', group: 'Back', pattern: 'horizontal-pull', variationOf: 'Barbell Row' },
        { name: 'Chest-Supported Row', equipment: 'Machine', group: 'Back', pattern: 'horizontal-pull', variationOf: 'Barbell Row' },
        { name: 'Pull-up', equipment: 'Bodyweight', group: 'Back', pattern: 'vertical-pull' },
        { name: 'Chin-up', equipment: 'Bodyweight', group: 'Back', pattern: 'vertical-pull', variationOf: 'Pull-up' },
        { name: 'Assisted Pull-up', equipment: 'Machine', group: 'Back', pattern: 'vertical-pull', variationOf: 'Pull-up' },
        { name: 'Dip', equipment: 'Bodyweight', group: 'Chest' },
        { name: 'Assisted Dip', equipment: 'Machine', group: 'Chest', variationOf: 'Dip' },
        { name: 'Lat Pulldown', equipment: 'Cable', group: 'Back', pattern: 'vertical-pull' },
        { name: 'Close-Grip Lat Pulldown', equipment: 'Cable', group: 'Back', pattern: 'vertical-pull', variationOf: 'Lat Pulldown' },
        { name: 'Seated Row', equipment: 'Cable', group: 'Back', pattern: 'horizontal-pull' },
        { name: 'Cable Fly', equipment: 'Cable', group: 'Chest', pattern: 'fly' },
        { name: 'Dumbbell Fly', equipment: 'Dumbbell', group: 'Chest', pattern: 'fly', variationOf: 'Cable Fly' },
        { name: 'Pec Deck', equipment: 'Machine', group: 'Chest', pattern: 'fly', variationOf: 'Cable Fly' },
        { name: 'Triceps Pushdown', equipment: 'Cable', group: 'Arms', pattern: 'triceps-extension' },
        { name: 'Rope Pushdown', equipment: 'Cable', group: 'Arms', pattern: 'triceps-extension', variationOf: 'Triceps Pushdown' },
        { name: 'Overhead Triceps Extension', equipment: 'Cable', group: 'Arms', pattern: 'triceps-extension' },
        { name: 'Skull Crusher', equipment: 'Bar', group: 'Arms', pattern: 'triceps-extension' },
        { name: 'Leg Press', equipment: 'Machine', group: 'Quads', pattern: 'squat' },
        { name: 'Bulgarian Split Squat', equipment: 'Dumbbell', group: 'Quads', pattern: 'squat' },
        { name: 'Leg Extension', equipment: 'Machine', group: 'Quads', pattern: 'leg-extension' },
        { name: 'Leg Curl', equipment: 'Machine', group: 'Posterior', pattern: 'leg-curl' },
        { name: 'Seated Leg Curl', equipment: 'Machine', group: 'Posterior', pattern: 'leg-curl', variationOf: 'Leg Curl' },
        { name: 'Lying Leg Curl', equipment: 'Machine', group: 'Posterior', pattern: 'leg-curl', variationOf: 'Leg Curl' },
        { name: 'Calf Raise', equipment: 'Machine', group: 'Calves', pattern: 'calf-raise' },
        { name: 'Seated Calf Raise', equipment: 'Machine', group: 'Calves', pattern: 'calf-raise', variationOf: 'Calf Raise' },
        { name: 'Single-Leg Calf Raise', equipment: 'Bodyweight', group: 'Calves', pattern: 'calf-raise', variationOf: 'Calf Raise' },
        { name: 'Lateral Raise', equipment: 'Dumbbell', group: 'Shoulders', pattern: 'lateral-raise' },
        { name: 'Cable Lateral Raise', equipment: 'Cable', group: 'Shoulders', pattern: 'lateral-raise', variationOf: 'Lateral Raise' },
        { name: 'Machine Lateral Raise', equipment: 'Machine', group: 'Shoulders', pattern: 'lateral-raise', variationOf: 'Lateral Raise' },
        { name: 'Bicep Curl', equipment: 'Dumbbell', group: 'Arms', pattern: 'curl' },
        { name: 'Preacher Curl', equipment: 'Bar', group: 'Arms', pattern: 'curl', variationOf: 'Bicep Curl' },
        { name: 'Reverse-Grip Curl', equipment: 'Bar', group: 'Arms', pattern: 'curl', variationOf: 'Bicep Curl' },
        { name: 'Hammer Curl', equipment: 'Dumbbell', group: 'Arms', pattern: 'curl', variationOf: 'Bicep Curl' },
        { name: 'Cable Curl', equipment: 'Cable', group: 'Arms', pattern: 'curl', variationOf: 'Bicep Curl' },
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
            // No Authorization header, deliberately: one would turn a simple
            // cross-origin GET into a preflight the blob endpoint has no CORS
            // rule for, and the file needs no token.
            const response = await fetch(EXERCISE_LIBRARY_URL, { credentials: 'omit' });

            if (!response.ok) return FALLBACK;

            const payload: unknown = await response.json();

            return isLibrary(payload) ? payload : FALLBACK;
        } catch {
            // Offline, or no CORS rule for this origin — indistinguishable, and
            // either way the picker still works.
            return FALLBACK;
        }
    })();

    return pending;
}

/**
 * The equipment chip under an exercise name. The API stores the name only, so
 * this is a lookup; a name that is not in the library is one the user typed,
 * which is what the design labels "Custom".
 */
export function equipmentFor(library: ExerciseLibrary | null, name: string): string {
    const match = library?.exercises.find((exercise) => exercise.name === name);

    return match?.equipment ?? 'Custom';
}

/**
 * What can stand in for an exercise, in the order worth trying when the one you
 * wanted is taken.
 *
 * Three tiers, each excluding what an earlier one already offered:
 *
 * - **Variations** — the same movement done another way, which is the family
 *   `variationOf` draws. Swapping within it changes the least about the
 *   workout.
 * - **Same movement** — different exercises doing the same job (`pattern`), so
 *   a busy squat rack offers the leg press.
 * - **Same muscle group** — the coarsest fallback, for an exercise whose
 *   movement nothing else in the library does.
 *
 * Within a tier the library's own order holds, which keeps a family's root
 * ahead of its variations and the list stable from one swap to the next.
 */
export interface Alternatives {
    variations: LibraryExercise[];
    samePattern: LibraryExercise[];
    sameGroup: LibraryExercise[];
}

const NO_ALTERNATIVES: Alternatives = { variations: [], samePattern: [], sameGroup: [] };

/**
 * The alternatives to `name`. `standsInFor` is the exercise a swapped entry
 * replaced: a custom name has nothing in the library to go on, but what it was
 * swapped in for usually does, and is itself the most likely thing to swap back
 * to.
 */
export function alternativesFor(
    library: ExerciseLibrary | null,
    name: string,
    standsInFor?: string,
): Alternatives {
    const exercises = library?.exercises ?? [];
    const find = (wanted: string) => exercises.find((exercise) => exercise.name === wanted);
    const subject = find(name) ?? (standsInFor === undefined ? undefined : find(standsInFor));

    if (!subject) return NO_ALTERNATIVES;

    const family = subject.variationOf ?? subject.name;
    const offered = new Set([name]);

    const take = (matches: (exercise: LibraryExercise) => boolean) => {
        const found: LibraryExercise[] = [];

        for (const exercise of exercises) {
            if (offered.has(exercise.name) || !matches(exercise)) continue;

            offered.add(exercise.name);
            found.push(exercise);
        }

        return found;
    };

    // Called in tier order: each one skips what the one before it took.
    const variations = take((exercise) => (exercise.variationOf ?? exercise.name) === family);
    const samePattern = subject.pattern === undefined
        ? []
        : take((exercise) => exercise.pattern === subject.pattern);
    const sameGroup = subject.group === undefined
        ? []
        : take((exercise) => exercise.group === subject.group);

    return { variations, samePattern, sameGroup };
}
