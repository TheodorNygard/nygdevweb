import { dayLabel } from '../lib/block';
import { kg, rpeLabel, sessionDateLabel, sessionOrdinal } from '../lib/format';
import type { CurrentBlock, SessionSummary } from '../lib/types';

interface HistoryScreenProps {
    block: CurrentBlock;
    onOpen: (session: SessionSummary) => void;
}

/**
 * Submitted workouts, grouped under their week with the week's volume beside
 * it. The grouping is client-side: the API sends one flat list newest first.
 *
 * Rows show the date where the prototype showed a duration. The API stores no
 * timestamp finer than the day, and the date is what you want anyway when a
 * cell holds two sessions.
 */
export function HistoryScreen({ block, onOpen }: HistoryScreenProps) {
    const { mesocycle, sessions } = block;
    const submitted = sessions.filter((session) => session.status === 'submitted');

    const weeks: { week: number; rows: SessionSummary[] }[] = [];

    for (let week = mesocycle?.weeks ?? 0; week >= 1; week -= 1) {
        const rows = submitted.filter((session) => session.week === week);

        if (rows.length > 0) weeks.push({ week, rows });
    }

    return (
        <div className="screen">
            <h1 className="title">History</h1>

            {weeks.length === 0 ? (
                <p className="empty">
                    No sessions submitted yet. Log one from Today and it will land here under its
                    week.
                </p>
            ) : (
                <div className="hist">
                    {weeks.map((group) => {
                        const volume = group.rows.reduce((total, row) => total + row.volumeKg, 0);

                        return (
                            <section key={group.week}>
                                <div className="hist__head">
                                    <span className="eyebrow">WEEK {group.week}</span>
                                    <span className="hist__total">{kg(volume)}</span>
                                </div>
                                <div className="rows">
                                    {group.rows.map((session) => {
                                        const ordinal = sessionOrdinal(session.id);

                                        return (
                                            <button
                                                key={session.id}
                                                type="button"
                                                className="row"
                                                onClick={() => onOpen(session)}
                                            >
                                                <span>
                                                    <span className="row__label">
                                                        {dayLabel(mesocycle, session.dayIndex)}
                                                    </span>
                                                    <span className="row__sub">
                                                        {sessionDateLabel(session.id)}
                                                        {' · '}
                                                        D{session.dayIndex + 1}
                                                        {' · RPE '}
                                                        {rpeLabel(session.avgRpe)}
                                                        {ordinal > 1 ? ` · #${ordinal} that day` : ''}
                                                    </span>
                                                </span>
                                                <span className="row__right">
                                                    <span className="row__value">
                                                        {kg(session.volumeKg)}
                                                    </span>
                                                    <span className="row__unit">
                                                        {session.setCount} sets
                                                    </span>
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </section>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
