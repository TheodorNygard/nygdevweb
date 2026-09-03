import { elapsedLabel, kg, rpeLabel } from '../lib/format';
import type { SessionTotals } from '../lib/types';

interface DoneScreenProps {
    dayLabel: string;
    week: number;
    weeks: number;
    doneCount: number;
    totalCount: number;
    elapsed: number;
    totals: SessionTotals;
    onHome: () => void;
}

/**
 * The end of a session: what it added up to, and where that leaves the block.
 *
 * Duration is on this screen and nowhere else, because this is the only place
 * it is known — it is the stopwatch this page has been running, not a stored
 * field. A session opened tomorrow has no duration to show, which is why
 * History shows a date in its place.
 */
export function DoneScreen({
    dayLabel,
    week,
    weeks,
    doneCount,
    totalCount,
    elapsed,
    totals,
    onHome,
}: DoneScreenProps) {
    const stats = [
        { key: 'Workout', value: dayLabel },
        { key: 'Duration', value: elapsedLabel(elapsed) },
        { key: 'Exercises', value: String(totals.exerciseCount) },
        { key: 'Sets logged', value: String(totals.setCount) },
        { key: 'Total volume', value: kg(totals.volumeKg) },
        { key: 'Average RPE', value: rpeLabel(totals.avgRpe) },
    ];

    return (
        <div className="done">
            <div className="done__tick">✓</div>
            <h1 className="done__title">Workout logged.</h1>
            <p className="lede">
                Week {week} of {weeks} · {doneCount} of {totalCount} workouts in this block.
            </p>

            <div className="stat-rows">
                {stats.map((stat) => (
                    <div className="stat-row" key={stat.key}>
                        <span className="stat-row__key">{stat.key}</span>
                        <span className="stat-row__value">{stat.value}</span>
                    </div>
                ))}
            </div>

            <div className="stack-22">
                <button type="button" className="primary" onClick={onHome}>
                    Back to this week
                </button>
            </div>
        </div>
    );
}
