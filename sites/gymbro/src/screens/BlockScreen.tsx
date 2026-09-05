import { useState } from 'react';

import { ExercisePicker } from '../components/ExercisePicker';
import { Stepper } from '../components/Stepper';
import { catalogue, GROUPS, groupOf, NO_GROUP } from '../lib/groups';
import {
    equipmentFor,
    isRestWeek,
    repsInTank,
    setsForWeek,
    type DayInput,
    type ExerciseLibrary,
    type MesocycleSummary,
} from '../lib/gym';
import {
    DEFAULT_DAY_LABELS,
    MAX_DAYS,
    MAX_PLANNED_PER_DAY,
    MAX_SETS,
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

    busy: boolean;
    onMakeCurrent: () => void;
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
    busy,
    onMakeCurrent,
}: BlockScreenProps) {
    const [picking, setPicking] = useState<number | null>(null);

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
    // show as halved rather than as the plan on paper.
    const tally = new Map<string, number>();

    for (const group of GROUPS) tally.set(group, 0);

    for (const day of draft.days) {
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
                            <section key={index} className="day">
                                <div className="day__head">
                                    <span className="day__n">{`D${index + 1}`}</span>
                                    <input
                                        className="day__name"
                                        value={day.label}
                                        onChange={(event) => editDay(index, (current) => ({
                                            ...current,
                                            label: event.target.value,
                                        }))}
                                        aria-label={`Label for day ${index + 1}`}
                                    />
                                </div>

                                <div className="day__counts">
                                    <span>{`${day.plan.length} EXERCISES`}</span>
                                    <span>
                                        {`${day.plan.reduce((t, p) => t + p.sets, 0)} SETS`}
                                    </span>
                                </div>

                                <div className="day__plan">
                                    {day.plan.map((planned, position) => (
                                        <div
                                            key={`${planned.exerciseName}:${position}`}
                                            className="plan-item"
                                        >
                                            <div className="plan-item__head">
                                                <span className="plan-item__text">
                                                    <span className="plan-item__name">
                                                        {planned.exerciseName}
                                                    </span>
                                                    <span className="plan-item__meta">
                                                        {equipmentFor(
                                                            library,
                                                            planned.exerciseName,
                                                        )}
                                                        {` · ${groupOf(planned.exerciseName)}`}
                                                    </span>
                                                </span>
                                                <button
                                                    type="button"
                                                    className="icon-button"
                                                    aria-label={`Remove ${planned.exerciseName}`}
                                                    onClick={() => editDay(index, (current) => ({
                                                        ...current,
                                                        plan: current.plan.filter(
                                                            (_, at) => at !== position,
                                                        ),
                                                    }))}
                                                >
                                                    ×
                                                </button>
                                            </div>

                                            <div className="plan-item__sets">
                                                <button
                                                    type="button"
                                                    className="tick tick--small"
                                                    aria-label={`One fewer set of ${planned.exerciseName}`}
                                                    disabled={planned.sets <= 1}
                                                    onClick={() => editDay(index, (current) => ({
                                                        ...current,
                                                        plan: current.plan.map((one, at) => (
                                                            at === position
                                                                ? { ...one, sets: one.sets - 1 }
                                                                : one
                                                        )),
                                                    }))}
                                                >
                                                    −
                                                </button>
                                                <span className="plan-item__count">
                                                    {planned.sets}
                                                    <span className="plan-item__unit"> SETS</span>
                                                </span>
                                                <button
                                                    type="button"
                                                    className="tick tick--small"
                                                    aria-label={`One more set of ${planned.exerciseName}`}
                                                    disabled={planned.sets >= MAX_SETS}
                                                    onClick={() => editDay(index, (current) => ({
                                                        ...current,
                                                        plan: current.plan.map((one, at) => (
                                                            at === position
                                                                ? { ...one, sets: one.sets + 1 }
                                                                : one
                                                        )),
                                                    }))}
                                                >
                                                    +
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <button
                                    type="button"
                                    className="day__add"
                                    disabled={day.plan.length >= MAX_PLANNED_PER_DAY}
                                    onClick={() => setPicking(index)}
                                >
                                    {day.plan.length >= MAX_PLANNED_PER_DAY
                                        ? `${MAX_PLANNED_PER_DAY} is the most a day can plan`
                                        : '+ Add exercise'}
                                </button>
                            </section>
                        ))}
                    </div>

                    {block.isCurrent ? null : (
                        <div className="builder__heading" style={{ marginTop: 22 }}>
                            <span className="builder__hint">
                                This is not the block the phone opens on. Editing it is safe
                                either way — nothing here changes what is being trained.
                            </span>
                            <button
                                type="button"
                                className="ghost"
                                onClick={onMakeCurrent}
                                disabled={busy}
                            >
                                Train this block
                            </button>
                        </div>
                    )}
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

                                return (
                                    <div key={w} className="row">
                                        <span className="row__meta">{`WEEK ${w}`}</span>
                                        <span
                                            className={
                                                rest ? 'map__tank map__tank--rest' : 'map__tank'
                                            }
                                        >
                                            {rest ? 'REST · 8' : `${repsInTank(w, draft.weeks)} LEFT`}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>

                        <p className="panel__note">
                            Counted back from the last training week, so shortening a block gives
                            at the easy end.
                        </p>
                    </section>
                </div>
            </div>

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
