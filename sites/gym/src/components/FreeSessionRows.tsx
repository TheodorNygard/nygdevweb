import { kg, rpeLabel, sessionDateLabel, sessionOrdinal } from '../lib/format';
import type { DatedSession } from '../lib/types';

interface FreeSessionRowsProps {
    sessions: DatedSession[];
    onOpen: (session: DatedSession) => void;
}

/** What a row is called: the exercises it opened with, the first two of them. */
function titleOf(session: DatedSession): string {
    const names = (session.entries ?? []).map((entry) => entry.exerciseName);

    if (names.length === 0) return 'Workout';

    return names.length > 2 ? `${names.slice(0, 2).join(' · ')} +${names.length - 2}` : names.join(' · ');
}

/**
 * Freestanding workouts as a list, newest first: Today's for a lifter with no
 * block, and History's "outside a block" for one with blocks as well.
 *
 * A row is named by its exercises rather than a day label, since there is none
 * — a freestanding workout is what was lifted, and the first two lifts are what
 * tells one Thursday from another.
 */
export function FreeSessionRows({ sessions, onOpen }: FreeSessionRowsProps) {
    return (
        <div className="rows">
            {sessions.map((session) => {
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
                                {titleOf(session)}
                                {session.status === 'draft' ? (
                                    <span className="row__tag">OPEN</span>
                                ) : null}
                            </span>
                            <span className="row__sub">
                                {sessionDateLabel(session.id)}
                                {' · RPE '}
                                {rpeLabel(session.avgRpe)}
                                {ordinal > 1 ? ` · #${ordinal} that day` : ''}
                            </span>
                        </span>
                        <span className="row__right">
                            <span className="row__value">{kg(session.volumeKg)}</span>
                            <span className="row__unit">{session.setCount} sets</span>
                        </span>
                    </button>
                );
            })}
        </div>
    );
}
