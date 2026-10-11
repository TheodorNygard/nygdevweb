import { groupOf } from './groups';
import { isWarmUpRpe, sessionDate, type DatedSession, type ExerciseLibrary } from './gym';

/**
 * How far back the freestanding views read: a year, which is the longest range
 * the API answers in one call — and a year of training is what a coach reading
 * the export wants to see a trend across.
 */
export const FREE_RANGE_DAYS = 365;

/** One calendar week of freestanding workouts, Monday to Sunday. */
export interface CalendarWeek {
    /** The Monday, `YYYY-MM-DD`. */
    start: string;

    /** Finished workouts that week, newest first. */
    sessions: DatedSession[];
    volumeKg: number;

    /** Working sets per muscle group, warm-ups excluded — the builder's tally rule. */
    workingByGroup: Map<string, number>;
}

/** `YYYY-MM-DD` of the Monday on or before a local date. */
export function mondayOf(date: string): string {
    const day = new Date(`${date}T00:00:00`);

    // getDay() is 0 on Sunday; a week here starts on Monday, as it does in
    // Norway and in ISO 8601.
    day.setDate(day.getDate() - ((day.getDay() + 6) % 7));

    const pad = (value: number) => String(value).padStart(2, '0');

    return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
}

/**
 * Finished freestanding workouts grouped into the calendar weeks they fell in,
 * newest week first.
 *
 * A block has weeks of its own — week 3 is a position in the plan, whatever
 * the calendar says. Freestanding training has none, so the calendar is the
 * only week there is, and it is the one a lifter without a plan counts in:
 * "three times this week". Weeks with nothing logged are left out rather than
 * drawn as zeroes; a gap is visible in the dates either side of it.
 */
export function calendarWeeks(
    sessions: readonly DatedSession[],
    library: ExerciseLibrary | null,
): CalendarWeek[] {
    const byStart = new Map<string, CalendarWeek>();

    for (const session of sessions) {
        if (session.status !== 'submitted') continue;

        const date = sessionDate(session.id);

        if (!date) continue;

        const start = mondayOf(date);
        const week = byStart.get(start)
            ?? { start, sessions: [], volumeKg: 0, workingByGroup: new Map<string, number>() };

        week.sessions.push(session);
        week.volumeKg += session.volumeKg;

        for (const entry of session.entries ?? []) {
            const working = entry.sets.filter((set) => !isWarmUpRpe(set.rpe)).length;

            if (working === 0) continue;

            const group = groupOf(entry.exerciseName, library);

            week.workingByGroup.set(group, (week.workingByGroup.get(group) ?? 0) + working);
        }

        byStart.set(start, week);
    }

    return [...byStart.values()]
        .map((week) => ({ ...week, sessions: week.sessions.sort((a, b) => b.id.localeCompare(a.id)) }))
        .sort((a, b) => b.start.localeCompare(a.start));
}

/** What a freestanding workout is called: its exercises, the first two of them. */
export function freeTitle(session: DatedSession): string {
    const names = (session.entries ?? []).map((entry) => entry.exerciseName);

    if (names.length === 0) return 'Workout';

    return names.length > 2 ? `${names.slice(0, 2).join(' · ')} +${names.length - 2}` : names.join(' · ');
}
