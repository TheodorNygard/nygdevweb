import { useState } from 'react';

import { Sheet } from './Sheet';
import { kg, num, rpeLabel, sessionDateLabel, sessionOrdinal } from '../lib/format';
import type { SessionSummary, Workout } from '../lib/types';

interface DaySheetProps {
    week: number;
    dayIndex: number;
    label: string;

    /** Everything filed against this cell, newest first. Often one; sometimes not. */
    sessions: SessionSummary[];

    /** The session being shown, and its entries once they have arrived. */
    selectedId: string | null;
    detail: Workout | null;
    loading: boolean;

    busy: boolean;
    onSelect: (sessionId: string) => void;
    onStart: () => void;
    onResume: (sessionId: string) => void;
    onDelete: (sessionId: string) => void;
    onClose: () => void;
}

/**
 * The day card: what is in a cell of the block map, and the one place a workout
 * can be started, resumed or deleted.
 *
 * A cell can hold more than one session — the API stopped overwriting a
 * re-logged day, because losing a workout to a mistyped tap is worse than
 * showing two — and that trade only works if the second one is visible and
 * removable. So the newest is what the cell shows, the rest are listed under
 * it, each with the delete that is the other half of the bargain.
 */
export function DaySheet({
    week,
    dayIndex,
    label,
    sessions,
    selectedId,
    detail,
    loading,
    busy,
    onSelect,
    onStart,
    onResume,
    onDelete,
    onClose,
}: DaySheetProps) {
    // Two taps to delete, on two different buttons. There is no undo behind it,
    // so a mis-tap on a sheet full of 44px targets should not reach it.
    const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);

    const selected = sessions.find((session) => session.id === selectedId) ?? sessions[0];
    const draft = sessions.find((session) => session.status === 'draft');
    const others = sessions.filter((session) => session.id !== selected?.id);

    const stats = selected
        ? [
            { key: 'SETS', value: String(selected.setCount) },
            { key: 'VOLUME', value: kg(selected.volumeKg) },
            { key: 'EXERCISES', value: String(selected.exerciseCount) },
            { key: 'AVG RPE', value: rpeLabel(selected.avgRpe) },
        ]
        : [
            { key: 'STATUS', value: '—' },
            { key: 'SETS', value: '0' },
        ];

    const lines = detail?.id === selected?.id ? detail?.entries ?? [] : [];

    return (
        <Sheet label={`Week ${week}, ${label}`} onClose={onClose}>
            <div className="sheet__eyebrow">WEEK {week} · DAY {dayIndex + 1}</div>
            <div className="sheet__title">{label}</div>

            {selected ? (
                <p className="day__sub" style={{ marginTop: 8 }}>
                    {sessionDateLabel(selected.id)}
                    {sessionOrdinal(selected.id) > 1
                        ? ` · session #${sessionOrdinal(selected.id)} that day`
                        : ''}
                    {selected.status === 'draft' ? ' · draft' : ''}
                </p>
            ) : null}

            <div className="tiles">
                {stats.map((stat) => (
                    <div className="tile" key={stat.key}>
                        <div className="tile__key">{stat.key}</div>
                        <div className="tile__value">{stat.value}</div>
                    </div>
                ))}
            </div>

            {selected && lines.length > 0 ? (
                <div className="lines">
                    {lines.map((entry, index) => {
                        const first = entry.sets[0];
                        const detailText = first
                            ? `${entry.sets.length} × ${num(first.reps)} · ${num(first.weightKg)}kg`
                            : 'no sets';

                        return (
                            <div className="line" key={`${entry.exerciseName}-${index}`}>
                                <span className="line__name">{entry.exerciseName}</span>
                                <span className="line__detail">{detailText}</span>
                            </div>
                        );
                    })}
                </div>
            ) : null}

            {selected && loading && lines.length === 0 ? (
                <p className="empty">Loading the session…</p>
            ) : null}

            {others.length > 0 ? (
                <>
                    <span className="section-label">ALSO ON THIS DAY</span>
                    <div className="rows" style={{ marginTop: 10 }}>
                        {others.map((session) => (
                            <button
                                key={session.id}
                                type="button"
                                className="row"
                                onClick={() => onSelect(session.id)}
                            >
                                <span>
                                    <span className="row__label">
                                        {sessionDateLabel(session.id)}
                                        {session.status === 'draft' ? ' · draft' : ''}
                                    </span>
                                    <span className="row__sub">
                                        session #{sessionOrdinal(session.id)}
                                    </span>
                                </span>
                                <span className="row__right">
                                    <span className="row__value">{kg(session.volumeKg)}</span>
                                    <span className="row__unit">{session.setCount} sets</span>
                                </span>
                            </button>
                        ))}
                    </div>
                </>
            ) : null}

            <button
                type="button"
                className="sheet__action"
                disabled={busy}
                onClick={() => (draft ? onResume(draft.id) : onStart())}
            >
                {busy
                    ? 'Working…'
                    : draft
                        ? 'Resume the open draft'
                        : sessions.length > 0
                            ? 'Log this day again'
                            : 'Start this workout'}
            </button>

            {selected && selected.status === 'submitted' ? (
                confirmingDelete === selected.id ? (
                    <button
                        type="button"
                        className="sheet__danger"
                        disabled={busy}
                        onClick={() => {
                            setConfirmingDelete(null);
                            onDelete(selected.id);
                        }}
                    >
                        Delete {sessionDateLabel(selected.id)} for good — tap again
                    </button>
                ) : (
                    <button
                        type="button"
                        className="sheet__danger"
                        disabled={busy}
                        onClick={() => setConfirmingDelete(selected.id)}
                    >
                        Delete this session
                    </button>
                )
            ) : null}

            <button type="button" className="ghost stack-8" onClick={onClose}>
                Close
            </button>
        </Sheet>
    );
}
