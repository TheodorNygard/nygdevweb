import { useMemo, useState } from 'react';

import { DayPlanSheet } from '../components/DayPlanSheet';
import { Sheet } from '../components/Sheet';
import { Stepper } from '../components/Stepper';
import { draftIn, isRestWeek, repsInTank, sessionsFor } from '../lib/block';
import type {
    CurrentBlock,
    DayInput,
    ExerciseLibrary,
    Mesocycle,
    MesocycleSummary,
} from '../lib/types';

/** The API's bounds, and the prototype's: 3–8 weeks of 2–6 workout days. */
const MIN_WEEKS = 3;
const MAX_WEEKS = 8;
const MIN_DAYS = 2;
const MAX_DAYS = 6;

/** What a new day is called before it is named. The prototype's list. */
const DEFAULT_DAYS = ['Upper A', 'Lower A', 'Upper B', 'Lower B', 'Push', 'Pull'];

interface Draft {
    name: string;
    weeks: number;

    // The whole day, plan included: `days` is replaced wholesale by the PATCH,
    // so holding only labels here is how a save would clear every plan.
    days: DayInput[];
}

function draftOf(mesocycle: Mesocycle | null): Draft {
    if (!mesocycle) {
        return {
            name: 'Block 1',
            weeks: 5,
            days: DEFAULT_DAYS.slice(0, 4).map((label) => ({ label, plan: [] })),
        };
    }

    return {
        name: mesocycle.name,
        weeks: mesocycle.weeks,
        days: mesocycle.days.map((day) => ({ label: day.label, plan: day.plan })),
    };
}

function samePlan(a: DayInput, b: DayInput): boolean {
    return a.label === b.label
        && a.plan.length === b.plan.length
        && a.plan.every((exercise, index) => {
            const other = b.plan[index];

            return other !== undefined
                && exercise.exerciseName === other.exerciseName
                && exercise.sets === other.sets;
        });
}

function sameDraft(a: Draft, b: Draft): boolean {
    return a.name === b.name
        && a.weeks === b.weeks
        && a.days.length === b.days.length
        && a.days.every((day, index) => {
            const other = b.days[index];

            return other !== undefined && samePlan(day, other);
        });
}

interface PlanScreenProps {
    block: CurrentBlock;

    /** Every block this user has planned, newest first. */
    blocks: MesocycleSummary[];
    blocksLoading: boolean;
    onOpenBlock: (block: MesocycleSummary) => void;

    /** For the equipment chip beside a planned exercise, and the picker. */
    library: ExerciseLibrary | null;
    busy: boolean;
    onSave: (patch: { name: string; weeks: number; days: DayInput[] }) => void;
    onCreate: (plan: { name: string; weeks: number; days: DayInput[] }) => void;
    onSignOut: () => void;
    account: string;
}

/**
 * The Plan tab owns the block: its length, how many days it holds, and what
 * they are called. Editing is safe by construction — sessions are keyed on
 * their date rather than their position, so shortening a block hides cells
 * rather than orphaning workouts.
 *
 * The draft is local until Save: a PATCH per keystroke would be a write per
 * character on a field only meaningful once it is finished.
 */
export function PlanScreen({
    block,
    blocks,
    blocksLoading,
    onOpenBlock,
    library,
    busy,
    onSave,
    onCreate,
    onSignOut,
    account,
}: PlanScreenProps) {
    const saved = useMemo(() => draftOf(block.mesocycle), [block.mesocycle]);
    const [draft, setDraft] = useState<Draft>(saved);
    const [confirmFresh, setConfirmFresh] = useState(false);

    // Which day's plan is being edited, by position. Null is the common case.
    const [planningDay, setPlanningDay] = useState<number | null>(null);

    // The saved block changed under the draft — a create, or another device.
    // The alternative is showing edits against a block that no longer exists.
    const [adopted, setAdopted] = useState(saved);

    if (adopted !== saved) {
        setAdopted(saved);
        setDraft(saved);
    }

    const dirty = !sameDraft(draft, saved);
    const exists = block.mesocycle !== null;

    function setDays(count: number) {
        const days = draft.days.slice();

        while (days.length < count) {
            days.push({
                label: DEFAULT_DAYS[days.length] ?? `Day ${days.length + 1}`,
                plan: [],
            });
        }

        setDraft({ ...draft, days: days.slice(0, count) });
    }

    function rename(index: number, label: string) {
        setDraft({
            ...draft,
            days: draft.days.map((existing, position) => (
                position === index ? { ...existing, label } : existing
            )),
        });
    }

    function replan(index: number, plan: DayInput['plan']) {
        setDraft({
            ...draft,
            days: draft.days.map((existing, position) => (
                position === index ? { ...existing, plan } : existing
            )),
        });
    }

    // Drawn from the *draft*, so stepping weeks up or down previews the block
    // before it is saved. Cells outside the new bounds stop being drawn, which
    // is what the API does to them rather than deleting anything.
    const rows = Array.from({ length: draft.weeks }, (_, index) => {
        const week = index + 1;

        return {
            week,

            // Read off the *draft's* length too, so stepping weeks up or down
            // moves the whole ramp with it — the last row is always the rest
            // week, whatever the block is being resized to.
            rest: isRestWeek(week, draft.weeks),
            tank: repsInTank(week, draft.weeks),
            cells: draft.days.map((_, dayIndex) => {
                const cell = sessionsFor(block.sessions, week, dayIndex);
                const submitted = cell.some((session) => session.status === 'submitted');

                return {
                    dayIndex,
                    state: submitted ? 'done' : draftIn(cell) ? 'draft' : 'planned',
                };
            }),
        };
    });

    const canSave = draft.name.trim().length > 0
        && draft.days.every((day) => day.label.trim().length > 0);

    return (
        <div className="screen">
            <h1 className="title">Mesocycle</h1>
            <p className="lede">
                3–8 weeks, 2–6 workouts per week — the last of them a rest week. Changing the plan
                never touches sessions you have already logged.
            </p>

            <section className="panel">
                <div className="field-label">BLOCK NAME</div>
                <input
                    className="text-input"
                    value={draft.name}
                    onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                    aria-label="Block name"
                    maxLength={80}
                />

                <div className="stepper-row">
                    <Stepper
                        label="WEEKS"
                        value={String(draft.weeks)}
                        onDecrease={() => setDraft({ ...draft, weeks: draft.weeks - 1 })}
                        onIncrease={() => setDraft({ ...draft, weeks: draft.weeks + 1 })}
                        canDecrease={draft.weeks > MIN_WEEKS}
                        canIncrease={draft.weeks < MAX_WEEKS}
                    />
                    <Stepper
                        label="DAYS / WEEK"
                        value={String(draft.days.length)}
                        onDecrease={() => setDays(draft.days.length - 1)}
                        onIncrease={() => setDays(draft.days.length + 1)}
                        canDecrease={draft.days.length > MIN_DAYS}
                        canIncrease={draft.days.length < MAX_DAYS}
                    />
                </div>
            </section>

            <span className="section-label">WORKOUT DAYS</span>
            <div className="dayfields">
                {draft.days.map((day, index) => (
                    // The index is the identity, legitimately: a day *is* its
                    // position — the `dayIndex` sessions are filed under.
                    <div className="dayfield" key={index}>
                        <span className="dayfield__badge">D{index + 1}</span>
                        <input
                            className="dayfield__input"
                            value={day.label}
                            onChange={(event) => rename(index, event.target.value)}
                            aria-label={`Label for day ${index + 1}`}
                            maxLength={40}
                        />
                        <button
                            type="button"
                            className="dayfield__plan"
                            onClick={() => setPlanningDay(index)}
                            aria-label={`Plan ${day.label}`}
                        >
                            {day.plan.length === 0 ? 'plan' : `${day.plan.length} ex`}
                        </button>
                    </div>
                ))}
            </div>

            <span className="section-label">BLOCK MAP</span>
            <div className="map">
                {rows.map((row) => (
                    <div className="map__row" key={row.week}>
                        <span className="map__week">W{row.week}</span>
                        <span className="map__cells">
                            {row.cells.map((cell) => (
                                <span
                                    key={cell.dayIndex}
                                    className={`map__cell${cell.state === 'planned' ? '' : ` map__cell--${cell.state}`}`}
                                />
                            ))}
                        </span>
                        {/* The ramp, which is the only thing that distinguishes one
                            week of the block from another now that days are shared. */}
                        <span
                            className={row.rest ? 'map__tank map__tank--rest' : 'map__tank'}
                        >
                            {row.rest ? 'REST' : `${row.tank} LEFT`}
                        </span>
                    </div>
                ))}
                <div className="map__key">
                    <span>■ logged</span>
                    <span>▨ in progress</span>
                    <span>□ planned</span>
                </div>
                <p className="map__note">
                    The number is reps left in the tank: how much you should have in reserve when
                    a set ends. It tightens week by week and resets in the rest week.
                </p>
            </div>

            <div className="stack-22">
                <button
                    type="button"
                    className="primary"
                    disabled={busy || !canSave || (exists && !dirty)}
                    onClick={() => {
                        const patch = {
                            name: draft.name.trim(),
                            weeks: draft.weeks,
                            days: draft.days.map((day) => ({
                                label: day.label.trim(),
                                plan: day.plan,
                            })),
                        };

                        if (exists) onSave(patch);
                        else onCreate(patch);
                    }}
                >
                    {busy
                        ? 'Saving…'
                        : exists
                            ? dirty ? 'Save changes' : 'Plan saved'
                            : 'Create mesocycle'}
                </button>
            </div>

            {exists ? (
                <div className="stack-8">
                    <button
                        type="button"
                        className="secondary"
                        onClick={() => setConfirmFresh(true)}
                        disabled={busy}
                    >
                        Start a fresh mesocycle
                    </button>
                </div>
            ) : null}

            <span className="section-label">ALL BLOCKS</span>
            {blocksLoading && blocks.length === 0 ? (
                <p className="empty">Reading your blocks…</p>
            ) : blocks.length === 0 ? (
                <p className="empty">
                    Nothing planned yet. The block you create above will be the first.
                </p>
            ) : (
                <div className="rows" style={{ marginTop: 12 }}>
                    {blocks.map((entry) => (
                        <button
                            key={entry.id}
                            type="button"
                            className="row"
                            onClick={() => onOpenBlock(entry)}
                        >
                            <span>
                                <span className="row__label">
                                    {entry.name}
                                    {entry.isCurrent ? <span className="row__tag">CURRENT</span> : null}
                                </span>
                                <span className="row__sub">
                                    {entry.weeks} weeks · {entry.days.length} days
                                </span>
                            </span>
                            <span className="row__right">
                                <span className="row__value">{entry.submittedCount}</span>
                                <span className="row__unit">logged</span>
                            </span>
                        </button>
                    ))}
                </div>
            )}

            <div className="stack-22">
                <p className="empty">Signed in as {account}.</p>
                <button type="button" className="ghost" onClick={onSignOut}>
                    Sign out
                </button>
            </div>

            {planningDay !== null && draft.days[planningDay] ? (
                <DayPlanSheet
                    label={draft.days[planningDay].label}
                    dayIndex={planningDay}
                    plan={draft.days[planningDay].plan}
                    library={library}
                    onChange={(plan) => replan(planningDay, plan)}
                    onClose={() => setPlanningDay(null)}
                />
            ) : null}

            {confirmFresh ? (
                <Sheet label="Start a fresh mesocycle" onClose={() => setConfirmFresh(false)}>
                    <div className="sheet__question">Start a fresh mesocycle?</div>
                    <p className="lede">
                        The new block becomes the current one. Nothing logged in “{saved.name}” is
                        deleted — History keeps it, and it is still reachable by its own id.
                    </p>
                    <button
                        type="button"
                        className="sheet__action"
                        disabled={busy || !canSave}
                        onClick={() => {
                            setConfirmFresh(false);
                            onCreate({
                                name: draft.name.trim(),
                                weeks: draft.weeks,
                                days: draft.days.map((day) => ({
                                    label: day.label.trim(),
                                    plan: day.plan,
                                })),
                            });
                        }}
                    >
                        Create and switch
                    </button>
                    <button
                        type="button"
                        className="ghost stack-8"
                        onClick={() => setConfirmFresh(false)}
                    >
                        Keep the current block
                    </button>
                </Sheet>
            ) : null}
        </div>
    );
}
