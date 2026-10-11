import { useState } from 'react';

import { Sheet } from './Sheet';
import { kg, num, rpeLabel, sessionDateLabel, sessionOrdinal } from '../lib/format';
import type { DatedSession } from '../lib/types';

interface FreeSessionSheetProps {
    /** One row of the date-range list, sets included. */
    session: DatedSession;
    busy: boolean;
    onResume: (sessionId: string) => void;
    onEdit: (sessionId: string) => void;
    onDelete: (sessionId: string) => void;
    onClose: () => void;
}

/**
 * A freestanding workout: what was in it, and the three things to do with it.
 *
 * The block's day card does this for a cell, and most of what it has to handle
 * is not here: no plan to show before anything is logged, no other sessions
 * filed against the same day, no week. What is left is the session itself,
 * Resume or Edit, and the two-tap delete. The sets are already on the row —
 * the date-range list carries them — so opening this costs no read.
 */
export function FreeSessionSheet({
    session,
    busy,
    onResume,
    onEdit,
    onDelete,
    onClose,
}: FreeSessionSheetProps) {
    // Two taps on two different buttons, as on the day card. There is no undo.
    const [confirming, setConfirming] = useState(false);

    const ordinal = sessionOrdinal(session.id);
    const isDraft = session.status === 'draft';

    const stats = [
        { key: 'SETS', value: String(session.setCount) },
        { key: 'VOLUME', value: kg(session.volumeKg) },
        { key: 'EXERCISES', value: String(session.exerciseCount) },
        { key: 'AVG RPE', value: rpeLabel(session.avgRpe) },
    ];

    return (
        <Sheet label={`Workout on ${sessionDateLabel(session.id)}`} onClose={onClose}>
            <div className="sheet__eyebrow">
                NO BLOCK{ordinal > 1 ? ` · SESSION #${ordinal} THAT DAY` : ''}
                {isDraft ? ' · DRAFT' : ''}
            </div>
            <div className="sheet__title">{sessionDateLabel(session.id)}</div>

            <div className="tiles">
                {stats.map((stat) => (
                    <div className="tile" key={stat.key}>
                        <div className="tile__key">{stat.key}</div>
                        <div className="tile__value">{stat.value}</div>
                    </div>
                ))}
            </div>

            {(session.entries ?? []).length > 0 ? (
                <div className="lines">
                    {(session.entries ?? []).map((entry, index) => {
                        const first = entry.sets[0];

                        return (
                            <div className="line" key={`${entry.exerciseName}-${index}`}>
                                <span className="line__name">{entry.exerciseName}</span>
                                <span className="line__detail">
                                    {first
                                        ? `${entry.sets.length} × ${num(first.reps)} · ${num(first.weightKg)}kg`
                                        : 'no sets'}
                                </span>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <p className="empty">Nothing logged in this one yet.</p>
            )}

            <button
                type="button"
                className="sheet__action"
                disabled={busy}
                onClick={() => (isDraft ? onResume(session.id) : onEdit(session.id))}
            >
                {busy ? 'Working…' : isDraft ? 'Resume this workout' : 'Edit sets in this session'}
            </button>

            {confirming ? (
                <button
                    type="button"
                    className="sheet__danger"
                    disabled={busy}
                    onClick={() => {
                        setConfirming(false);
                        onDelete(session.id);
                    }}
                >
                    Delete {sessionDateLabel(session.id)} for good — tap again
                </button>
            ) : (
                <button
                    type="button"
                    className="sheet__danger"
                    disabled={busy}
                    onClick={() => setConfirming(true)}
                >
                    Delete this session
                </button>
            )}

            <button type="button" className="ghost stack-8" onClick={onClose}>
                Close
            </button>
        </Sheet>
    );
}
