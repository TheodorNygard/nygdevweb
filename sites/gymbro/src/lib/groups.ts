import { type ExerciseLibrary } from './gym';

/**
 * Muscle groups — the question that makes "eleven sets of chest this week"
 * answerable.
 *
 * The API stores an exercise as a name and nothing else. The library blob is
 * where a name's group lives: `group` on each exercise, which the logger also
 * reads to suggest a swap. That is what lets a variation — `Preacher Curl`,
 * `Hack Squat` — count toward its group here without this file having heard of
 * it.
 *
 * The map below is what the blob said before it carried groups, and it is kept
 * as the fallback for a library cached from then. A name neither knows — one
 * typed on the phone — has no group, which is what {@link groupOf} answers with
 * a dash rather than a guess: a wrong group silently skews the panel that
 * exists to be trusted.
 */
export const GROUPS = ['Chest', 'Back', 'Shoulders', 'Arms', 'Quads', 'Posterior', 'Calves'];

/** No group known. Shown as-is, and counted toward nothing. */
export const NO_GROUP = '—';

/**
 * The library's original twenty names, grouped — the fallback for a cached
 * library that predates `group`.
 *
 * Keyed on the name alone, deliberately: equipment changes how a movement is
 * loaded rather than what it trains.
 */
const GROUP_BY_NAME: Record<string, string> = {
    'Bench Press': 'Chest',
    'Incline Bench Press': 'Chest',
    Dip: 'Chest',
    'Cable Fly': 'Chest',
    'Barbell Row': 'Back',
    'Pull-up': 'Back',
    'Lat Pulldown': 'Back',
    'Seated Row': 'Back',
    'Overhead Press': 'Shoulders',
    'Lateral Raise': 'Shoulders',
    'Triceps Pushdown': 'Arms',
    'Bicep Curl': 'Arms',
    Squat: 'Quads',
    'Front Squat': 'Quads',
    'Leg Press': 'Quads',
    Deadlift: 'Posterior',
    'Romanian Deadlift': 'Posterior',
    'Leg Curl': 'Posterior',
    'Calf Raise': 'Calves',
};

/**
 * The group for an exercise name, or {@link NO_GROUP} for one nobody has
 * grouped. The library's own `group` first; the map only for a library too old
 * to carry one.
 */
export function groupOf(name: string, library: ExerciseLibrary | null): string {
    const listed = library?.exercises.find((exercise) => exercise.name === name)?.group;

    return listed ?? GROUP_BY_NAME[name] ?? NO_GROUP;
}

/**
 * Every exercise the picker and the library table show: the shipped blob, plus
 * anything a block already plans that the blob does not list.
 *
 * The second half is what keeps a name typed on the phone from vanishing off
 * this screen. It reads `Custom` for equipment — the same word the logger's
 * `equipmentFor` falls back to — and a dash for its group.
 */
export interface Exercise {
    name: string;
    equipment: string;
    group: string;
}

export function catalogue(
    library: ExerciseLibrary | null,
    plannedNames: readonly string[],
): Exercise[] {
    const shipped = (library?.exercises ?? []).map((exercise) => ({
        name: exercise.name,
        equipment: exercise.equipment,
        group: groupOf(exercise.name, library),
    }));

    const known = new Set(shipped.map((exercise) => exercise.name));
    const custom: Exercise[] = [];

    for (const name of plannedNames) {
        if (known.has(name)) continue;

        known.add(name);
        custom.push({ name, equipment: 'Custom', group: groupOf(name, library) });
    }

    // Custom first: it is the short list, and the one somebody is looking for
    // when they came to this table wondering where a name went.
    return [...custom, ...shipped];
}
