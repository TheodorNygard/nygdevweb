import { useMemo, useState } from 'react';

import { Sheet } from '../components/Sheet';
import { Stepper } from '../components/Stepper';
import { draftIn, sessionsFor } from '../lib/block';
import type { CurrentBlock, Mesocycle, MesocycleSummary } from '../lib/types';

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
    days: string[];
}

function draftOf(mesocycle: Mesocycle | null): Draft {
    if (!mesocycle) {
        return { name: 'Block 1', weeks: 5, days: DEFAULT_DAYS.slice(0, 4) };
    }

    return {
        name: mesocycle.name,
        weeks: mesocycle.weeks,
        days: mesocycle.days.map((day) => day.label),
    };
}

function sameDraft(a: Draft, b: Draft): boolean {
    return a.name === b.name
        && a.weeks === b.weeks
        && a.days.length === b.days.length
        && a.days.every((label, index) => label === b.days[index]);
}

interface PlanScreenProps {
    block: CurrentBlock;

    /** Every block this user has planned, newest first. */
    blocks: MesocycleSummary[];
    blocksLoading: boolean;
    onOpenBlock: (block: MesocycleSummary) => void;
    busy: boolean;
    onSave: (patch: { name: string; weeks: number; days: string[] }) => void;
    onCreate: (plan: { name: string; weeks: number; days: string[] }) => void;
    onSignOut: () => void;
    account: string;
}

/**
 * The Plan tab owns the block: its length, how many days it holds, and what
 * they are called. Editing it is safe by construction — sessions are keyed on
 * their date rather than on their position, so shortening a block hides cells
 * rather than orphaning workouts, and the copy says so.
 *
 * The draft is local until Save. A PATCH per keystroke would be a write per
 * character on a field whose value is only meaningful once it is finished.
 */
export function PlanScreen({
    block,
    blocks,
    blocksLoading,
    onOpenBlock,
    busy,
    onSave,
    onCreate,
    onSignOut,
    account,
}: PlanScreenProps) {
    const saved = useMemo(() => draftOf(block.mesocycle), [block.mesocycle]);
    const [draft, setDraft] = useState<Draft>(saved);
    const [confirmFresh, setConfirmFresh] = useState(false);

    // The saved block changed under the draft — a create, or another device.
    // Adopting it is the honest thing: the alternative is showing edits
    // against a block that no longer exists.
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
            days.push(DEFAULT_DAYS[days.length] ?? `Day ${days.length + 1}`);
        }

        setDraft({ ...draft, days: days.slice(0, count) });
    }

    function rename(index: number, label: string) {
        setDraft({
            ...draft,
            days: draft.days.map((existing, position) => (position === index ? label : existing)),
        });
    }

    // The map is drawn from the *draft*, so dragging weeks up or down shows
    // what the block will look like before it is saved. Cells outside the new
    // bounds simply stop being drawn — which is exactly what the API does to
    // them, rather than deleting anything.
    const rows = Array.from({ length: draft.weeks }, (_, index) => {
        const week = index + 1;

        return {
            week,
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

    const canSave = draft.name.trim().length > 0 && draft.days.every((day) => day.trim().length > 0);

    return (
        <div className="screen">
            <h1 className="title">Mesocycle</h1>
            <p className="lede">
                3–8 weeks, 2–6 workouts per week. Changing the plan never touches sessions you have
                already logged.
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
                {draft.days.map((label, index) => (
                    // The index is the identity here, and legitimately: a day
                    // *is* its position in the block — that position is the
                    // `dayIndex` every session is filed under.
                    <div className="dayfield" key={index}>
                        <span className="dayfield__badge">D{index + 1}</span>
                        <input
                            className="dayfield__input"
                            value={label}
                            onChange={(event) => rename(index, event.target.value)}
                            aria-label={`Label for day ${index + 1}`}
                            maxLength={40}
                        />
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
                    </div>
                ))}
                <div className="map__key">
                    <span>■ logged</span>
                    <span>▨ in progress</span>
                    <span>□ planned</span>
                </div>
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
                            days: draft.days.map((day) => day.trim()),
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
                                days: draft.days.map((day) => day.trim()),
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
