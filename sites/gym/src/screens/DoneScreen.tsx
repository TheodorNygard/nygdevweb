import { kg, rpeLabel } from '../lib/format';
import type { SessionTotals } from '../lib/types';

interface DoneScreenProps {
    dayLabel: string;

    /** Null for a workout in no block: there is no week, and no block to fill. */
    week: number | null;
    weeks: number;
    doneCount: number;
    totalCount: number;
    totals: SessionTotals;
    onHome: () => void;
}

/**
 * The end of a session: what it added up to, and where that leaves the block.
 *
 * No duration. Every number here is derived from the sets that were logged, so
 * this page says the same thing whether it is read now or a session is reopened
 * next week — which is what a duration, measured only while the screen happened
 * to be open, could never be.
 */
export function DoneScreen({
    dayLabel,
    week,
    weeks,
    doneCount,
    totalCount,
    totals,
    onHome,
}: DoneScreenProps) {
    const stats = [
        { key: 'Workout', value: dayLabel },
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
                {week === null
                    ? 'Logged on its own — no block, no week.'
                    : `Week ${week} of ${weeks} · ${doneCount} of ${totalCount} workouts in this block.`}
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
                    {week === null ? 'Back to Today' : 'Back to this week'}
                </button>
            </div>
        </div>
    );
}
