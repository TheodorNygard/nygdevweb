import { type SessionSummary, type Workout } from './gym';

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
    week: number;
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
 * Built from full workouts rather than from the summaries the block list
 * carries: a summary has totals and nothing about which exercise they came
 * from, so nothing short of the sets themselves can answer this. That is the
 * cost the Analytics view pays and the reason it is a view of its own rather
 * than a panel on the dashboard — see `useWorkouts`.
 *
 * Only submitted sessions count. A draft is a workout in progress, and a lift
 * chart that dipped every time somebody was three sets into a session would be
 * reporting the clock rather than the training.
 */
export function seriesOf(
    workouts: readonly Workout[],
    summaries: readonly SessionSummary[],
    dateOf: (sessionId: string) => string,
): LiftSeries[] {
    const submitted = new Set(
        summaries.filter((one) => one.status === 'submitted').map((one) => one.id),
    );

    const byName = new Map<string, LiftPoint[]>();

    // Oldest first, so a series comes out in the order the chart draws it.
    const ordered = [...workouts]
        .filter((workout) => submitted.has(workout.id))
        .sort((a, b) => a.id.localeCompare(b.id));

    for (const workout of ordered) {
        for (const entry of workout.entries) {
            let top: { weightKg: number; reps: number } | null = null;
            let rpeTotal = 0;
            let rpeCount = 0;

            for (const set of entry.sets) {
                if (
                    top === null
                    || set.weightKg > top.weightKg
                    || (set.weightKg === top.weightKg && set.reps > top.reps)
                ) {
                    top = { weightKg: set.weightKg, reps: set.reps };
                }

                if (set.rpe !== null) {
                    rpeTotal += set.rpe;
                    rpeCount += 1;
                }
            }

            // An exercise added to a session and then not lifted has no top
            // set, and belongs on no chart.
            if (top === null) continue;

            const points = byName.get(entry.exerciseName) ?? [];

            points.push({
                sessionId: workout.id,
                date: dateOf(workout.id),
                weightKg: top.weightKg,
                reps: top.reps,
                sets: entry.sets.length,
                rpe: rpeCount === 0 ? null : Math.round((rpeTotal / rpeCount) * 10) / 10,
                week: workout.week,
            });

            byName.set(entry.exerciseName, points);
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
