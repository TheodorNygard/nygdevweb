import { useState } from 'react';

import { Sheet } from './Sheet';
import { isSkipped, plannedFor, setsForWeek } from '../lib/block';
import { kg, num, rpeLabel, sessionDateLabel, sessionOrdinal } from '../lib/format';
import type { PlannedExercise, SessionSummary, Workout } from '../lib/types';

interface DaySheetProps {
    week: number;
    dayIndex: number;
    label: string;

    /**
     * What this day prescribes, and how long its block is — which together are
     * what a day with nothing logged yet has to show. Without them the sheet
     * over an untouched day is a row of zeroes, while the draft Start is about
     * to seed from this very plan would show every exercise.
     */
    plan: PlannedExercise[];
    weeks: number;

    /** Everything filed against this cell, newest first. Often one; sometimes not. */
    sessions: SessionSummary[];

    /** The session being shown, and its entries once they have arrived. */
    selectedId: string | null;
    detail: Workout | null;
    loading: boolean;

    /**
     * Whether this cell can be trained. False for a day of a block that is not
     * the current one: Start files a session against whatever block the user is
     * pointed at, so offering it here would log today's workout into the block
     * being read rather than the one being read about.
     */
    canLog: boolean;

    busy: boolean;
    onSelect: (sessionId: string) => void;
    onStart: () => void;

    /**
     * Passes the day by without training it, so "up next" moves on. Offered
     * only on a cell nothing has been filed against yet — a draft is resumed
     * or discarded instead, and a day already logged or skipped needs neither.
     */
    onSkip: () => void;
    onResume: (sessionId: string) => void;

    /**
     * Opens a submitted session on the logging screen to correct its sets.
     * Offered on any block, unlike Start: correcting what was logged changes
     * nothing about which block the next workout goes into.
     */
    onEdit: (sessionId: string) => void;

    /**
     * Removes a session: deletes a logged one, discards a draft, or undoes a
     * skip. One call for all three — they are the same delete — and the sheet
     * decides how many taps each is worth.
     */
    onDelete: (sessionId: string) => void;
    onClose: () => void;
}

/**
 * What removing the selected session is called, and the label its second tap
 * carries — null where there is nothing to lose and one tap is enough: a skip
 * holds no sets, and neither does a draft nobody has lifted in yet.
 */
function removalOf(session: SessionSummary): { label: string; confirm: string | null } {
    if (isSkipped(session)) return { label: 'Undo the skip', confirm: null };

    if (session.status === 'draft') {
        return {
            label: 'Discard this draft',
            confirm: session.setCount === 0
                ? null
                : `Discard the draft and its ${session.setCount} `
                    + `${session.setCount === 1 ? 'set' : 'sets'} — tap again`,
        };
    }

    return {
        label: 'Delete this session',
        confirm: `Delete ${sessionDateLabel(session.id)} for good — tap again`,
    };
}

/**
 * The day card: what is in a cell of the block map, and the one place a workout
 * can be started, resumed, skipped or deleted.
 *
 * A cell can hold more than one session — the API stopped overwriting a
 * re-logged day, because losing a workout to a mistyped tap is worse than
 * showing two — and that trade only works if the second one is visible and
 * removable. So the newest is what the cell shows, the rest are listed under
 * it, each with the delete that is the other half of the bargain.
 *
 * It also opens over a day of a block that is no longer being trained, which is
 * what History taps into. That one is read-only in the one way that matters:
 * Start logs against the block the user is pointed at, so a cell of another
 * block shows what was done and does not offer to add to it.
 */
export function DaySheet({
    week,
    dayIndex,
    label,
    plan,
    weeks,
    sessions,
    selectedId,
    detail,
    loading,
    canLog,
    busy,
    onSelect,
    onStart,
    onSkip,
    onResume,
    onEdit,
    onDelete,
    onClose,
}: DaySheetProps) {
    // Two taps to delete, on two different buttons. There is no undo behind it,
    // so a mis-tap on a sheet full of 44px targets should not reach it.
    const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);

    const selected = sessions.find((session) => session.id === selectedId) ?? sessions[0];
    const draft = sessions.find((session) => session.status === 'draft');
    const others = sessions.filter((session) => session.id !== selected?.id);

    // A skipped day has no numbers worth a tile and no lines worth listing:
    // its entries are the plan it was opened on, with nothing lifted against
    // any of them.
    const skippedSelected = selected !== undefined && isSkipped(selected);
    const logged = sessions.some((session) => session.status === 'submitted' && !isSkipped(session));
    const filed = sessions.some((session) => session.status === 'submitted');
    const removal = selected ? removalOf(selected) : null;

    const stats = skippedSelected ? [] : selected
        ? [
            { key: 'SETS', value: String(selected.setCount) },
            { key: 'VOLUME', value: kg(selected.volumeKg) },
            { key: 'EXERCISES', value: String(selected.exerciseCount) },
            { key: 'AVG RPE', value: rpeLabel(selected.avgRpe) },
        ]
        : [
            { key: 'EXERCISES', value: String(plan.length) },
            {
                key: 'PLANNED SETS',
                value: String(plan.reduce(
                    (total, planned) => total + setsForWeek(planned.sets, week, weeks),
                    0,
                )),
            },
        ];

    const lines = !skippedSelected && detail?.id === selected?.id ? detail?.entries ?? [] : [];

    /**
     * What an exercise with nothing logged against it is asked for. Today that
     * is the plan's count for this week; it is also the one place a
     * recommendation from the backend will replace it, so the untouched day and
     * the empty draft both read from here.
     */
    function setsAsked(planned: PlannedExercise | undefined): string {
        return planned ? `${setsForWeek(planned.sets, week, weeks)} sets planned` : 'no sets';
    }

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
                    {skippedSelected ? ' · skipped' : ''}
                </p>
            ) : null}

            {skippedSelected ? (
                <p className="empty">
                    Skipped — nothing was logged on this day, and it does not count as a workout.
                </p>
            ) : (
                <div className="tiles">
                    {stats.map((stat) => (
                        <div className="tile" key={stat.key}>
                            <div className="tile__key">{stat.key}</div>
                            <div className="tile__value">{stat.value}</div>
                        </div>
                    ))}
                </div>
            )}

            {selected && lines.length > 0 ? (
                <div className="lines">
                    {lines.map((entry, index) => {
                        const first = entry.sets[0];
                        const detailText = first
                            ? `${entry.sets.length} × ${num(first.reps)} · ${num(first.weightKg)}kg`
                            : setsAsked(plannedFor(plan, lines, index));

                        return (
                            <div className="line" key={`${entry.exerciseName}-${index}`}>
                                <span className="line__name">{entry.exerciseName}</span>
                                <span className="line__detail">{detailText}</span>
                            </div>
                        );
                    })}
                </div>
            ) : null}

            {!selected && plan.length > 0 ? (
                <div className="lines">
                    {plan.map((planned, index) => (
                        <div className="line" key={`${planned.exerciseName}-${index}`}>
                            <span className="line__name">{planned.exerciseName}</span>
                            <span className="line__detail">{setsAsked(planned)}</span>
                        </div>
                    ))}
                </div>
            ) : null}

            {!selected && plan.length === 0 ? (
                <p className="empty">
                    Nothing planned for this day — add exercises as you go.
                </p>
            ) : null}

            {selected && !skippedSelected && loading && lines.length === 0 ? (
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
                                    <span className="row__value">
                                        {isSkipped(session) ? '—' : kg(session.volumeKg)}
                                    </span>
                                    <span className="row__unit">
                                        {isSkipped(session) ? 'skipped' : `${session.setCount} sets`}
                                    </span>
                                </span>
                            </button>
                        ))}
                    </div>
                </>
            ) : null}

            {canLog ? (
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
                            : logged
                                ? 'Log this day again'
                                : 'Start this workout'}
                </button>
            ) : (
                <p className="day__sub stack-18">
                    A block you are not training. Open it from Plan to log against it again.
                </p>
            )}

            {canLog && !draft && !filed ? (
                <button
                    type="button"
                    className="add-exercise stack-8"
                    style={{ width: '100%' }}
                    disabled={busy}
                    onClick={onSkip}
                >
                    Skip this day
                </button>
            ) : null}

            {selected && selected.status === 'submitted' && !skippedSelected ? (
                <button
                    type="button"
                    className="add-exercise stack-8"
                    style={{ width: '100%' }}
                    disabled={busy}
                    onClick={() => onEdit(selected.id)}
                >
                    Edit sets in this session
                </button>
            ) : null}

            {selected && removal ? (
                removal.confirm !== null && confirmingDelete === selected.id ? (
                    <button
                        type="button"
                        className="sheet__danger"
                        disabled={busy}
                        onClick={() => {
                            setConfirmingDelete(null);
                            onDelete(selected.id);
                        }}
                    >
                        {removal.confirm}
                    </button>
                ) : (
                    <button
                        type="button"
                        className="sheet__danger"
                        disabled={busy}
                        onClick={() => (removal.confirm === null
                            ? onDelete(selected.id)
                            : setConfirmingDelete(selected.id))}
                    >
                        {removal.label}
                    </button>
                )
            ) : null}

            <button type="button" className="ghost stack-8" onClick={onClose}>
                Close
            </button>
        </Sheet>
    );
}
