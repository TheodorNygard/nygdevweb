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
 * as the fallback for a library cached from then. An exercise of the user's own
 * that has been described in the Library view carries its group the same way,
 * because the described ones are merged into the library before anything here
 * reads it. A name nothing describes — one typed into a picker and left at
 * that — has no group, which is what {@link groupOf} answers with a dash rather
 * than a guess: a wrong group silently skews the panel that exists to be
 * trusted.
 */
export const GROUPS = ['Chest', 'Back', 'Shoulders', 'Arms', 'Quads', 'Posterior', 'Calves'];

/**
 * What an exercise can say it trains — the shipped library's closed vocabulary,
 * from `gym/README.md` in NygDevAzure. Offered as choices rather than typed,
 * because the swap sheet matches these by spelling and a muscle written any
 * other way matches nothing.
 */
export const MUSCLES = [
    'Chest',
    'Front Delts',
    'Side Delts',
    'Rear Delts',
    'Triceps',
    'Biceps',
    'Forearms',
    'Lats',
    'Upper Back',
    'Lower Back',
    'Quads',
    'Glutes',
    'Hamstrings',
    'Calves',
];

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
 * Every exercise the picker and the library table show, and where each came
 * from:
 *
 * - `library` — shipped on the CDN, the same for everybody.
 * - `yours` — described in the Library view, merged into the library with its
 *   equipment and group (see `withCustom`).
 * - `typed` — a name some plan uses that nothing describes: typed into a
 *   picker, here or on the phone. It reads `Custom` for equipment — the word
 *   the logger's `equipmentFor` falls back to — and a dash for its group, and
 *   it is what the Library view offers to describe.
 */
export interface Exercise {
    name: string;
    equipment: string;
    group: string;
    kind: 'library' | 'yours' | 'typed';
}

/**
 * `library` is the merged one. `knownNames` is every name the plans use —
 * all blocks', not only the selected one, so a name typed for last block is
 * still offered for this one rather than retyped and misspelled. `yours` is
 * which of the library's names are the user's own.
 */
export function catalogue(
    library: ExerciseLibrary | null,
    knownNames: readonly string[],
    yours: ReadonlySet<string> = new Set(),
): Exercise[] {
    const listed: Exercise[] = (library?.exercises ?? []).map((exercise) => ({
        name: exercise.name,
        equipment: exercise.equipment,
        group: groupOf(exercise.name, library),
        kind: yours.has(exercise.name) ? 'yours' : 'library',
    }));

    const known = new Set(listed.map((exercise) => exercise.name));
    const typed: Exercise[] = [];

    for (const name of knownNames) {
        if (known.has(name)) continue;

        known.add(name);
        typed.push({ name, equipment: 'Custom', group: groupOf(name, library), kind: 'typed' });
    }

    // The user's own first, described then typed: they are the short list,
    // and the one somebody is looking for when they came to this table
    // wondering where a name went.
    return [
        ...listed.filter((exercise) => exercise.kind === 'yours'),
        ...typed,
        ...listed.filter((exercise) => exercise.kind === 'library'),
    ];
}
