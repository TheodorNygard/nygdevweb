import { type ExerciseLibrary } from './gym';

/**
 * Muscle groups, and the one thing on this site with no counterpart on the wire.
 *
 * The API stores an exercise as a name and nothing else, and the library blob
 * adds equipment and stops there. Grouping is a planning question — it is what
 * makes "eleven sets of chest this week" answerable — and it is asked on a
 * desktop screen with room for the panel, so it is answered here.
 *
 * A map rather than a field means it costs nothing anywhere else: no migration,
 * no second copy of the library, and a phone that keeps logging names it has
 * never heard of. What it costs instead is that a name typed on the phone has
 * no group, which is what {@link groupOf} answers with a dash rather than a
 * guess — a wrong group silently skews the panel that exists to be trusted.
 */
export const GROUPS = ['Chest', 'Back', 'Shoulders', 'Arms', 'Quads', 'Posterior', 'Calves'];

/** No group known. Shown as-is, and counted toward nothing. */
export const NO_GROUP = '—';

/**
 * The shipped library's twenty names, grouped.
 *
 * Keyed on the name alone, deliberately: the library lists "Bench Press" twice,
 * once on a bar and once on dumbbells, and both are chest. Equipment changes
 * how a movement is loaded rather than what it trains.
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

/** The group for an exercise name, or {@link NO_GROUP} for one nobody has grouped. */
export function groupOf(name: string): string {
    return GROUP_BY_NAME[name] ?? NO_GROUP;
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
        group: groupOf(exercise.name),
    }));

    const known = new Set(shipped.map((exercise) => exercise.name));
    const custom: Exercise[] = [];

    for (const name of plannedNames) {
        if (known.has(name)) continue;

        known.add(name);
        custom.push({ name, equipment: 'Custom', group: groupOf(name) });
    }

    // Custom first: it is the short list, and the one somebody is looking for
    // when they came to this table wondering where a name went.
    return [...custom, ...shipped];
}
