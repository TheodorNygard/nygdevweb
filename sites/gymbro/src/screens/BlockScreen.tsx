import { useState } from 'react';

import { DayCard } from '../components/DayCard';
import { DeleteBlockModal } from '../components/DeleteBlockModal';
import { ExercisePicker } from '../components/ExercisePicker';
import { Stepper } from '../components/Stepper';
import { TemplateModal } from '../components/TemplateModal';
import { catalogue, GROUPS, groupOf, NO_GROUP } from '../lib/groups';
import {
    daysForWeek,
    isRestWeek,
    repsInTank,
    setsForWeek,
    type DayInput,
    type ExerciseLibrary,
    type MesocycleSummary,
    type TemplatesState,
} from '../lib/gym';
import {
    DEFAULT_DAY_LABELS,
    MAX_DAYS,
    MAX_NAME,
    MAX_PLANNED_PER_DAY,
    MAX_WEEKS,
    MIN_DAYS,
    MIN_WEEKS,
} from '../lib/limits';

/** The block as this screen edits it — the three fields PATCH takes. */
export interface Draft {
    name: string;
    weeks: number;

    // The whole day, plan included: `days` is replaced wholesale by the PATCH,
    // so holding only labels here is how a save would clear every plan.
    days: DayInput[];
}

export function draftOf(block: MesocycleSummary): Draft {
    return {
        name: block.name,
        weeks: block.weeks,
        days: block.days.map((day) => ({ label: day.label, plan: [...day.plan] })),
    };
}

/** "D1", "D1 and D3", "D1, D2 and D4". */
function listOf(items: string[]): string {
    if (items.length <= 1) return items.join('');

    return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function sameDay(a: DayInput, b: DayInput): boolean {
    return a.label === b.label
        && a.plan.length === b.plan.length
        && a.plan.every((planned, index) => {
            const other = b.plan[index];

            return other !== undefined
                && planned.exerciseName === other.exerciseName
                && planned.sets === other.sets;
        });
}

/** Whether a draft would change anything, which is what arms Save. */
export function isDirty(draft: Draft, block: MesocycleSummary): boolean {
    const saved = draftOf(block);

    return draft.name !== saved.name
        || draft.weeks !== saved.weeks
        || draft.days.length !== saved.days.length
        || !draft.days.every((day, index) => {
            const other = saved.days[index];

            return other !== undefined && sameDay(day, other);
        });
}

/** What a plan can be saved as: every day named, and the name not blank. */
export function isSaveable(draft: Draft): boolean {
    return draft.name.trim().length > 0
        && draft.days.every((day) => day.label.trim().length > 0);
}

/**
 * The volume a week of this plan asks of one muscle group, and where that sits
 * against the range worth aiming at.
 *
 * Ten to twenty working sets a week is the range most of the evidence lands in,
 * and it is a range rather than a number — so the bar reads three ways rather
 * than red/green. Below ten is muted: not wrong, just light. Above twenty is
 * accent: not wrong either, but it is the number to have decided on rather than
 * arrived at.
 */
const GROUP_FULL_SCALE = 24;
const GROUP_LOW = 10;
const GROUP_HIGH = 20;

interface BlockScreenProps {
    block: MesocycleSummary;
    draft: Draft;
    onDraft: (draft: Draft) => void;
    library: ExerciseLibrary | null;

    /** The week the group panel counts, so a rest week reads as one. */
    week: number;

    /** Saved and built-in day plans, for the modal behind each day's Templates button. */
    templates: TemplatesState;

    /**
     * Total volume logged in the block, or null while its sessions are still being
     * read — the delete waits on it so the confirmation never understates.
     */
    volumeKg: number | null;

    busy: boolean;
    onMakeCurrent: () => void;

    /** Creates a block from a draft — the one on screen, edits included. */
    onCopy: (draft: Draft) => void;
    onDelete: () => void;
}

/**
 * The block builder — the screen this site exists for.
 *
 * Everything here edits a local draft and nothing writes until Save, which is
 * the opposite of how the phone works and deliberately so: on the phone a tap
 * is one set and wants to land immediately, and here a session at the desk is
 * twenty small decisions that only make sense together. The two panels on the
 * right are what make it worth doing on a desktop at all — the day cards
 * change, and the consequence changes beside them.
 */
export function BlockScreen({
    block,
    draft,
    onDraft,
    library,
    week,
    templates,
    volumeKg,
    busy,
    onMakeCurrent,
    onCopy,
    onDelete,
}: BlockScreenProps) {
    const [picking, setPicking] = useState<number | null>(null);
    const [templating, setTemplating] = useState<number | null>(null);
    const [deleting, setDeleting] = useState(false);

    function writeDays(days: DayInput[]) {
        onDraft({ ...draft, days });
    }

    function editDay(index: number, change: (day: DayInput) => DayInput) {
        writeDays(draft.days.map((day, position) => (position === index ? change(day) : day)));
    }

    function setWeeks(weeks: number) {
        onDraft({ ...draft, weeks });
    }

    function setDayCount(count: number) {
        if (count > draft.days.length) {
            const label = DEFAULT_DAY_LABELS[draft.days.length] ?? `Day ${draft.days.length + 1}`;

            writeDays([...draft.days, { label, plan: [] }]);

            return;
        }

        // Trimmed off the end, and the plan on that day goes with it. Days are
        // labelled rather than scheduled, so there is no "which one" to ask.
        writeDays(draft.days.slice(0, count));
    }

    // Sets per group for the week being viewed, so a rest week's halved sets
    // show as halved rather than as the plan on paper — and only across the days
    // that week runs, since the rest week drops most of them.
    const tally = new Map<string, number>();

    for (const group of GROUPS) tally.set(group, 0);

    const weekDays = draft.days.slice(0, daysForWeek(draft.days.length, week, draft.weeks));

    for (const day of weekDays) {
        for (const planned of day.plan) {
            const group = groupOf(planned.exerciseName);

            if (group === NO_GROUP) continue;

            tally.set(
                group,
                (tally.get(group) ?? 0) + setsForWeek(planned.sets, week, draft.weeks),
            );
        }
    }

    const ungrouped = draft.days.reduce(
        (total, day) => total + day.plan.filter(
            (planned) => groupOf(planned.exerciseName) === NO_GROUP,
        ).length,
        0,
    );

    const plannedNames = draft.days.flatMap((day) => day.plan.map((one) => one.exerciseName));
    const options = catalogue(library, plannedNames);
    const pickingDay = picking === null ? null : draft.days[picking];
    const templatingDay = templating === null ? null : draft.days[templating];

    // Days that plan nothing, as "D1", "D3". Not a reason to refuse Save — a fresh
    // block starts with every day empty — but worth saying, since an empty day
    // opens in the logger as a blank session.
    const unplanned = draft.days
        .map((day, index) => (day.plan.length === 0 ? `D${index + 1}` : null))
        .filter((badge): badge is string => badge !== null);

    return (
        <div className="view">
            <section className="builder__top">
                <label className="field">
                    <span className="field__label">BLOCK NAME</span>
                    <input
                        className="text-input"
                        value={draft.name}
                        onChange={(event) => onDraft({ ...draft, name: event.target.value })}
                        aria-label="Block name"
                        maxLength={MAX_NAME}
                    />
                </label>
                <Stepper
                    label="WEEKS"
                    value={draft.weeks}
                    min={MIN_WEEKS}
                    max={MAX_WEEKS}
                    onChange={setWeeks}
                />
                <Stepper
                    label="DAYS / WEEK"
                    value={draft.days.length}
                    min={MIN_DAYS}
                    max={MAX_DAYS}
                    onChange={setDayCount}
                />
            </section>

            <div className="builder__body">
                <div style={{ minWidth: 0 }}>
                    <div className="builder__heading">
                        <span className="panel__label">WORKOUT DAYS</span>
                        <span className="builder__hint">
                            One plan per day label, shared by every week of the block.
                        </span>
                    </div>

                    <div className="builder__days">
                        {draft.days.map((day, index) => (
                            <DayCard
                                // The index is the identity, legitimately: a day *is* its
                                // position — the `dayIndex` sessions are filed under.
                                key={index}
                                day={day}
                                index={index}
                                library={library}
                                onChange={(next) => editDay(index, () => next)}
                                onAdd={() => setPicking(index)}
                                onTemplates={() => setTemplating(index)}
                            />
                        ))}
                    </div>

                    {unplanned.length > 0 ? (
                        <p className="builder__warn">
                            {`${listOf(unplanned)} ${unplanned.length === 1 ? 'has' : 'have'} no `
                                + 'exercises. It can still be saved, but a day with nothing on it '
                                + 'opens in the logger as a blank session — which is the problem '
                                + 'the plan exists to solve.'}
                        </p>
                    ) : null}

                    <div className="builder__heading builder__actions">
                        <span className="builder__hint">
                            {block.isCurrent
                                ? 'This is the block the phone opens on.'
                                : 'This is not the block the phone opens on. Editing it is safe '
                                    + 'either way — nothing here changes what is being trained.'}
                        </span>
                        <span className="builder__buttons">
                            {block.isCurrent ? null : (
                                <button
                                    type="button"
                                    className="ghost"
                                    onClick={onMakeCurrent}
                                    disabled={busy}
                                >
                                    Train this block
                                </button>
                            )}
                            <button
                                type="button"
                                className="ghost"
                                onClick={() => onCopy(draft)}
                                disabled={busy || !isSaveable(draft)}
                                title={
                                    'Creates a new block from the plan on screen, edits included. '
                                    + 'This one is left as it is.'
                                }
                            >
                                Copy to a new block
                            </button>
                            <button
                                type="button"
                                className="ghost ghost--danger"
                                onClick={() => setDeleting(true)}
                                disabled={busy}
                            >
                                Delete block
                            </button>
                        </span>
                    </div>
                </div>

                <div className="builder__aside">
                    <section className="panel panel--tight">
                        <div className="panel__head">
                            <span className="panel__label">SETS PER GROUP</span>
                            <span className="row__strong" style={{ fontSize: 10 }}>
                                {isRestWeek(week, draft.weeks) ? `W${week} · REST` : `W${week}`}
                            </span>
                        </div>

                        <div className="groups">
                            {GROUPS.map((group) => {
                                const sets = tally.get(group) ?? 0;
                                const low = sets > 0 && sets < GROUP_LOW;
                                const high = sets > GROUP_HIGH;

                                return (
                                    <div key={group}>
                                        <div className="group__head">
                                            <span className="group__name">{group}</span>
                                            <span
                                                className={
                                                    high
                                                        ? 'group__count group__count--high'
                                                        : low
                                                            ? 'group__count group__count--low'
                                                            : 'group__count'
                                                }
                                            >
                                                {sets}
                                            </span>
                                        </div>
                                        <div className="group__track">
                                            <div
                                                className={
                                                    high
                                                        ? 'group__bar group__bar--high'
                                                        : low
                                                            ? 'group__bar group__bar--low'
                                                            : 'group__bar'
                                                }
                                                style={{
                                                    width: `${Math.min(
                                                        100,
                                                        Math.round((sets / GROUP_FULL_SCALE) * 100),
                                                    )}%`,
                                                }}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <p className="panel__note">
                            10–20 working sets a week per group is the usual range. Below 10 reads
                            muted; above 20 reads accent.
                            {ungrouped > 0
                                ? ` ${ungrouped} planned `
                                    + `${ungrouped === 1 ? 'exercise has' : 'exercises have'} `
                                    + 'a name the library does not carry, so '
                                    + `${ungrouped === 1 ? 'it counts' : 'they count'} toward `
                                    + 'nothing here.'
                                : ''}
                        </p>
                    </section>

                    <section className="panel panel--tight">
                        <span className="panel__label">THE RAMP</span>

                        <div className="rows" style={{ marginTop: 12 }}>
                            {Array.from({ length: draft.weeks }, (_, index) => {
                                const w = index + 1;
                                const rest = isRestWeek(w, draft.weeks);
                                const runs = daysForWeek(draft.days.length, w, draft.weeks);

                                return (
                                    <div key={w} className="row">
                                        <span className="row__meta">
                                            {rest
                                                ? `WEEK ${w} · ${runs} ${runs === 1 ? 'DAY' : 'DAYS'}`
                                                : `WEEK ${w}`}
                                        </span>
                                        <span
                                            className={
                                                rest ? 'map__tank map__tank--rest' : 'map__tank'
                                            }
                                        >
                                            {`${repsInTank(w, draft.weeks)} LEFT`}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>

                        <p className="panel__note">
                            Counted back from the last training week, so shortening a block gives
                            at the easy end. The rest week closing it runs half the sets, on the
                            first one or two days of the plan.
                        </p>
                    </section>
                </div>
            </div>

            {templating !== null && templatingDay ? (
                <TemplateModal
                    dayLabel={templatingDay.label}
                    plan={templatingDay.plan}
                    templates={templates}
                    onApply={(plan) => editDay(templating, (current) => ({ ...current, plan }))}
                    onClose={() => setTemplating(null)}
                />
            ) : null}

            {deleting ? (
                <DeleteBlockModal
                    block={block}
                    volumeKg={volumeKg}
                    busy={busy}
                    onDelete={() => {
                        setDeleting(false);
                        onDelete();
                    }}
                    onClose={() => setDeleting(false)}
                />
            ) : null}

            {picking !== null && pickingDay ? (
                <ExercisePicker
                    dayLabel={pickingDay.label}
                    library={library}
                    catalogue={options}
                    onPick={(exerciseName) => {
                        editDay(picking, (current) => (
                            current.plan.length >= MAX_PLANNED_PER_DAY
                                ? current
                                : { ...current, plan: [...current.plan, { exerciseName, sets: 3 }] }
                        ));
                        setPicking(null);
                    }}
                    onClose={() => setPicking(null)}
                />
            ) : null}
        </div>
    );
}
