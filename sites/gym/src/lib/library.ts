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
        { name: 'Bench Press', equipment: 'Bar', group: 'Chest', muscles: ['Chest', 'Triceps', 'Front Delts'], pattern: 'horizontal-push' },
        { name: 'Dumbbell Bench Press', equipment: 'Dumbbell', group: 'Chest', muscles: ['Chest', 'Triceps', 'Front Delts'], pattern: 'horizontal-push', variationOf: 'Bench Press' },
        { name: 'Incline Bench Press', equipment: 'Bar', group: 'Chest', muscles: ['Chest', 'Front Delts', 'Triceps'], pattern: 'horizontal-push', variationOf: 'Bench Press' },
        { name: 'Incline Dumbbell Press', equipment: 'Dumbbell', group: 'Chest', muscles: ['Chest', 'Front Delts', 'Triceps'], pattern: 'horizontal-push', variationOf: 'Bench Press' },
        { name: 'Machine Chest Press', equipment: 'Machine', group: 'Chest', muscles: ['Chest', 'Triceps', 'Front Delts'], pattern: 'horizontal-push', variationOf: 'Bench Press' },
        { name: 'Close-Grip Bench Press', equipment: 'Bar', group: 'Chest', muscles: ['Triceps', 'Chest', 'Front Delts'], pattern: 'horizontal-push', variationOf: 'Bench Press' },
        { name: 'Push-up', equipment: 'Bodyweight', group: 'Chest', muscles: ['Chest', 'Triceps', 'Front Delts'], pattern: 'horizontal-push' },
        { name: 'Overhead Press', equipment: 'Bar', group: 'Shoulders', muscles: ['Front Delts', 'Triceps', 'Side Delts'], pattern: 'vertical-push' },
        { name: 'Dumbbell Shoulder Press', equipment: 'Dumbbell', group: 'Shoulders', muscles: ['Front Delts', 'Side Delts', 'Triceps'], pattern: 'vertical-push', variationOf: 'Overhead Press' },
        { name: 'Machine Shoulder Press', equipment: 'Machine', group: 'Shoulders', muscles: ['Front Delts', 'Triceps', 'Side Delts'], pattern: 'vertical-push', variationOf: 'Overhead Press' },
        { name: 'Squat', equipment: 'Bar', group: 'Quads', muscles: ['Quads', 'Glutes'], pattern: 'squat' },
        { name: 'Front Squat', equipment: 'Bar', group: 'Quads', muscles: ['Quads', 'Glutes'], pattern: 'squat', variationOf: 'Squat' },
        { name: 'Hack Squat', equipment: 'Machine', group: 'Quads', muscles: ['Quads', 'Glutes'], pattern: 'squat', variationOf: 'Squat' },
        { name: 'Goblet Squat', equipment: 'Dumbbell', group: 'Quads', muscles: ['Quads', 'Glutes'], pattern: 'squat', variationOf: 'Squat' },
        { name: 'Deadlift', equipment: 'Bar', group: 'Posterior', muscles: ['Glutes', 'Hamstrings', 'Lower Back'], pattern: 'hinge' },
        { name: 'Trap Bar Deadlift', equipment: 'Bar', group: 'Posterior', muscles: ['Glutes', 'Quads', 'Hamstrings'], pattern: 'hinge', variationOf: 'Deadlift' },
        { name: 'Sumo Deadlift', equipment: 'Bar', group: 'Posterior', muscles: ['Glutes', 'Hamstrings', 'Quads'], pattern: 'hinge', variationOf: 'Deadlift' },
        { name: 'Romanian Deadlift', equipment: 'Bar', group: 'Posterior', muscles: ['Hamstrings', 'Glutes', 'Lower Back'], pattern: 'hinge' },
        { name: 'Dumbbell Romanian Deadlift', equipment: 'Dumbbell', group: 'Posterior', muscles: ['Hamstrings', 'Glutes', 'Lower Back'], pattern: 'hinge', variationOf: 'Romanian Deadlift' },
        { name: 'Barbell Row', equipment: 'Bar', group: 'Back', muscles: ['Upper Back', 'Lats', 'Rear Delts'], pattern: 'horizontal-pull' },
        { name: 'Dumbbell Row', equipment: 'Dumbbell', group: 'Back', muscles: ['Lats', 'Upper Back', 'Rear Delts'], pattern: 'horizontal-pull', variationOf: 'Barbell Row' },
        { name: 'Chest-Supported Row', equipment: 'Machine', group: 'Back', muscles: ['Upper Back', 'Lats', 'Rear Delts'], pattern: 'horizontal-pull', variationOf: 'Barbell Row' },
        { name: 'Pull-up', equipment: 'Bodyweight', group: 'Back', muscles: ['Lats', 'Upper Back', 'Biceps'], pattern: 'vertical-pull' },
        { name: 'Chin-up', equipment: 'Bodyweight', group: 'Back', muscles: ['Lats', 'Biceps', 'Upper Back'], pattern: 'vertical-pull', variationOf: 'Pull-up' },
        { name: 'Assisted Pull-up', equipment: 'Machine', group: 'Back', muscles: ['Lats', 'Upper Back', 'Biceps'], pattern: 'vertical-pull', variationOf: 'Pull-up' },
        { name: 'Dip', equipment: 'Bodyweight', group: 'Chest', muscles: ['Chest', 'Triceps', 'Front Delts'] },
        { name: 'Assisted Dip', equipment: 'Machine', group: 'Chest', muscles: ['Chest', 'Triceps', 'Front Delts'], variationOf: 'Dip' },
        { name: 'Lat Pulldown', equipment: 'Cable', group: 'Back', muscles: ['Lats', 'Upper Back', 'Biceps'], pattern: 'vertical-pull' },
        { name: 'Close-Grip Lat Pulldown', equipment: 'Cable', group: 'Back', muscles: ['Lats', 'Biceps', 'Upper Back'], pattern: 'vertical-pull', variationOf: 'Lat Pulldown' },
        { name: 'Seated Row', equipment: 'Cable', group: 'Back', muscles: ['Upper Back', 'Lats', 'Rear Delts'], pattern: 'horizontal-pull' },
        { name: 'Cable Fly', equipment: 'Cable', group: 'Chest', muscles: ['Chest', 'Front Delts'], pattern: 'fly' },
        { name: 'Dumbbell Fly', equipment: 'Dumbbell', group: 'Chest', muscles: ['Chest', 'Front Delts'], pattern: 'fly', variationOf: 'Cable Fly' },
        { name: 'Pec Deck', equipment: 'Machine', group: 'Chest', muscles: ['Chest'], pattern: 'fly', variationOf: 'Cable Fly' },
        { name: 'Triceps Pushdown', equipment: 'Cable', group: 'Arms', muscles: ['Triceps'], pattern: 'triceps-extension' },
        { name: 'Rope Pushdown', equipment: 'Cable', group: 'Arms', muscles: ['Triceps'], pattern: 'triceps-extension', variationOf: 'Triceps Pushdown' },
        { name: 'Overhead Triceps Extension', equipment: 'Cable', group: 'Arms', muscles: ['Triceps'], pattern: 'triceps-extension' },
        { name: 'Skull Crusher', equipment: 'Bar', group: 'Arms', muscles: ['Triceps'], pattern: 'triceps-extension' },
        { name: 'Leg Press', equipment: 'Machine', group: 'Quads', muscles: ['Quads', 'Glutes'], pattern: 'squat' },
        { name: 'Bulgarian Split Squat', equipment: 'Dumbbell', group: 'Quads', muscles: ['Quads', 'Glutes'], pattern: 'squat' },
        { name: 'Leg Extension', equipment: 'Machine', group: 'Quads', muscles: ['Quads'], pattern: 'leg-extension' },
        { name: 'Leg Curl', equipment: 'Machine', group: 'Posterior', muscles: ['Hamstrings'], pattern: 'leg-curl' },
        { name: 'Seated Leg Curl', equipment: 'Machine', group: 'Posterior', muscles: ['Hamstrings'], pattern: 'leg-curl', variationOf: 'Leg Curl' },
        { name: 'Lying Leg Curl', equipment: 'Machine', group: 'Posterior', muscles: ['Hamstrings'], pattern: 'leg-curl', variationOf: 'Leg Curl' },
        { name: 'Calf Raise', equipment: 'Machine', group: 'Calves', muscles: ['Calves'], pattern: 'calf-raise' },
        { name: 'Seated Calf Raise', equipment: 'Machine', group: 'Calves', muscles: ['Calves'], pattern: 'calf-raise', variationOf: 'Calf Raise' },
        { name: 'Single-Leg Calf Raise', equipment: 'Bodyweight', group: 'Calves', muscles: ['Calves'], pattern: 'calf-raise', variationOf: 'Calf Raise' },
        { name: 'Lateral Raise', equipment: 'Dumbbell', group: 'Shoulders', muscles: ['Side Delts'], pattern: 'lateral-raise' },
        { name: 'Cable Lateral Raise', equipment: 'Cable', group: 'Shoulders', muscles: ['Side Delts'], pattern: 'lateral-raise', variationOf: 'Lateral Raise' },
        { name: 'Machine Lateral Raise', equipment: 'Machine', group: 'Shoulders', muscles: ['Side Delts'], pattern: 'lateral-raise', variationOf: 'Lateral Raise' },
        { name: 'Bicep Curl', equipment: 'Dumbbell', group: 'Arms', muscles: ['Biceps', 'Forearms'], pattern: 'curl' },
        { name: 'Preacher Curl', equipment: 'Bar', group: 'Arms', muscles: ['Biceps'], pattern: 'curl', variationOf: 'Bicep Curl' },
        { name: 'Reverse-Grip Curl', equipment: 'Bar', group: 'Arms', muscles: ['Forearms', 'Biceps'], pattern: 'curl', variationOf: 'Bicep Curl' },
        { name: 'Hammer Curl', equipment: 'Dumbbell', group: 'Arms', muscles: ['Biceps', 'Forearms'], pattern: 'curl', variationOf: 'Bicep Curl' },
        { name: 'Cable Curl', equipment: 'Cable', group: 'Arms', muscles: ['Biceps'], pattern: 'curl', variationOf: 'Bicep Curl' },
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
 *   workout. Library order, which keeps a family's root first.
 * - **Same movement** — different exercises doing the same job (`pattern`), so
 *   a busy squat rack offers the leg press. Library order.
 * - **Same muscles** — anything else that trains what this one trains, ranked
 *   by how much of it: see `muscleOverlap`. Each comes with the muscles it
 *   shares, which is what makes a chin-up readable as a curl's alternative.
 *
 * `sameGroup` is the coarse version of the last tier — gymbro's seven planning
 * groups — and is only filled for an exercise the library gives no muscles,
 * which is a library cached from before it did. It is not used otherwise
 * because the groups are too coarse to call anything similar: Arms holds
 * biceps and triceps both, so a curl's "same group" was a triceps pushdown.
 */
export interface Alternatives {
    variations: LibraryExercise[];
    samePattern: LibraryExercise[];
    sameMuscles: MuscleMatch[];
    sameGroup: LibraryExercise[];
}

/** An exercise that trains some of the same muscles, and which ones. */
export interface MuscleMatch {
    exercise: LibraryExercise;

    /** The shared muscles, in the order the swapped exercise lists them. */
    shared: string[];
}

const NO_ALTERNATIVES: Alternatives = {
    variations: [],
    samePattern: [],
    sameMuscles: [],
    sameGroup: [],
};

/**
 * How much a muscle counts by where it is listed: the main one three times what
 * a third does. Both exercises' positions count, so a curl (biceps first) is
 * closer to a chin-up (biceps second) than to a pull-up (biceps third).
 */
const MUSCLE_WEIGHTS = [3, 2, 1];

/**
 * The least overlap that is worth suggesting. A muscle one exercise trains
 * third and the other second is incidental; a muscle either one trains first,
 * shared with anything, is not.
 */
const MIN_MUSCLE_OVERLAP = 3;

/** Enough to choose from with eight people waiting; more is a second list. */
const MAX_MUSCLE_MATCHES = 6;

function muscleWeight(position: number): number {
    return MUSCLE_WEIGHTS[position] ?? 1;
}

/**
 * How much two exercises train the same muscles: for every muscle both list,
 * the product of what it weighs in each. Bench press and dip share chest first
 * and triceps second — 9 + 4 + 1 for the front delts — where bench press and an
 * overhead press share only what each trains second and third.
 */
export function muscleOverlap(
    subject: readonly string[],
    candidate: readonly string[],
): { score: number; shared: string[] } {
    let score = 0;
    const shared: string[] = [];

    subject.forEach((muscle, position) => {
        const there = candidate.indexOf(muscle);

        if (there < 0) return;

        score += muscleWeight(position) * muscleWeight(there);
        shared.push(muscle);
    });

    return { score, shared };
}

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

    const muscles = subject.muscles;

    if (muscles === undefined) {
        const sameGroup = subject.group === undefined
            ? []
            : take((exercise) => exercise.group === subject.group);

        return { variations, samePattern, sameMuscles: [], sameGroup };
    }

    // Ranked rather than in library order: here the order is the answer. Ties
    // go first to an exercise whose own main muscle this one trains — after a
    // deadlift, a leg curl (hamstrings) before a squat (quads) — and then to
    // the library's order, so the list is stable from one swap to the next.
    const sameMuscles = exercises
        .map((exercise, order) => ({ exercise, order }))
        .filter(({ exercise }) => !offered.has(exercise.name) && exercise.muscles !== undefined)
        .map(({ exercise, order }) => {
            const main = exercise.muscles?.[0];

            return {
                exercise,
                order,
                mainShared: main !== undefined && muscles.includes(main),
                ...muscleOverlap(muscles, exercise.muscles ?? []),
            };
        })
        .filter((match) => match.score >= MIN_MUSCLE_OVERLAP)
        .sort((a, b) => b.score - a.score
            || Number(b.mainShared) - Number(a.mainShared)
            || a.order - b.order)
        .slice(0, MAX_MUSCLE_MATCHES)
        .map(({ exercise, shared }) => ({ exercise, shared }));

    return { variations, samePattern, sameMuscles, sameGroup: [] };
}
