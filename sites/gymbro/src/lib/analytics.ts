import { type SessionEntry, type SessionStatus } from './gym';

/**
 * What a series is built from: a session with its sets, from a block's list or
 * the date range. A freestanding one has no week and no day; see `LiftPoint`.
 */
export interface LoggedSession {
    id: string;
    status: SessionStatus;
    entries?: SessionEntry[];
    week?: number;
    dayIndex?: number;
}

/**
 * One exercise on one day: the heaviest set that was logged, and what the
 * session around it looked like.
 *
 * "Top set" is weight first and reps only as the tie-break, because that is the
 * question the chart is asked — a 95 kg triple is progress over a 90 kg five,
 * and averaging the two into an estimated one-rep max would put a number on the
 * screen nobody lifted. The reps travel with it so the point can be read
 * honestly: `95 kg × 3`, not `102 kg e1RM`.
 */
export interface LiftPoint {
    sessionId: string;
    date: string;
    weightKg: number;
    reps: number;
    sets: number;
    rpe: number | null;

    /** The week of the block, or null for a workout in no block. */
    week: number | null;

    /** Which plan day the session was logged against — D1 is 0. Null in no block. */
    dayIndex: number | null;
}

export interface LiftSeries {
    name: string;
    points: LiftPoint[];
    best: number;
    change: number;
}

/**
 * Every exercise that was actually lifted, with its progression, newest last.
 *
 * Built from sessions read with their sets on them, because a summary has
 * totals and nothing about which exercise they came from — nothing short of the
 * sets themselves can answer this. They arrive in the block's own list rather
 * than a session at a time; see `useWorkouts` for what that replaced.
 *
 * Only submitted sessions count. A draft is a workout in progress, and a lift
 * chart that dipped every time somebody was three sets into a session would be
 * reporting the clock rather than the training.
 */
export function seriesOf(
    sessions: readonly LoggedSession[],
    dateOf: (sessionId: string) => string,
): LiftSeries[] {
    const byName = new Map<string, LiftPoint[]>();

    // Oldest first, so a series comes out in the order the chart draws it.
    const ordered = [...sessions]
        .filter((session) => session.status === 'submitted')
        .sort((a, b) => a.id.localeCompare(b.id));

    for (const session of ordered) {
        // One point per exercise per session, however many entries it was
        // logged under. Swapped away and back again, or added twice, it is
        // still one day of that lift — two points on one date would chart it
        // as two sessions, and count it as two in the coaching export.
        const lifted = new Map<string, {
            top: { weightKg: number; reps: number } | null;
            sets: number;
            rpeTotal: number;
            rpeCount: number;
        }>();

        for (const entry of session.entries ?? []) {
            const day = lifted.get(entry.exerciseName)
                ?? { top: null, sets: 0, rpeTotal: 0, rpeCount: 0 };

            for (const set of entry.sets) {
                if (
                    day.top === null
                    || set.weightKg > day.top.weightKg
                    || (set.weightKg === day.top.weightKg && set.reps > day.top.reps)
                ) {
                    day.top = { weightKg: set.weightKg, reps: set.reps };
                }

                if (set.rpe !== null) {
                    day.rpeTotal += set.rpe;
                    day.rpeCount += 1;
                }
            }

            day.sets += entry.sets.length;
            lifted.set(entry.exerciseName, day);
        }

        for (const [name, { top, sets, rpeTotal, rpeCount }] of lifted) {
            // An exercise added to a session and then not lifted has no top
            // set, and belongs on no chart.
            if (top === null) continue;

            const points = byName.get(name) ?? [];

            points.push({
                sessionId: session.id,
                date: dateOf(session.id),
                weightKg: top.weightKg,
                reps: top.reps,
                sets,
                rpe: rpeCount === 0 ? null : Math.round((rpeTotal / rpeCount) * 10) / 10,
                week: session.week ?? null,
                dayIndex: session.dayIndex ?? null,
            });

            byName.set(name, points);
        }
    }

    const series: LiftSeries[] = [];

    for (const [name, points] of byName) {
        const weights = points.map((point) => point.weightKg);
        const first = points[0];
        const last = points[points.length - 1];

        series.push({
            name,
            points,
            best: Math.max(...weights),
            change: first && last ? last.weightKg - first.weightKg : 0,
        });
    }

    // Most-trained first: the lift with the most sessions behind it is the one
    // whose line says something, and it is what the view should open on.
    return series.sort((a, b) => b.points.length - a.points.length || a.name.localeCompare(b.name));
}
