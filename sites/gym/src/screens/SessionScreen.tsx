import { useState } from 'react';

import { DragHandle } from '../components/DragHandle';
import { Stepper } from '../components/Stepper';
import { useDragReorder } from '../hooks/useDragReorder';
import { useElapsed } from '../hooks/useElapsed';
import type { LastSets } from '../hooks/useLastSets';
import { isRestWeek, repsInTank, setsForWeek } from '../lib/block';
import { elapsedLabel, kg, num, rpeNote, tankLabel } from '../lib/format';
import { equipmentFor } from '../lib/library';
import type { ExerciseLibrary, PlannedExercise, WorkSet, Workout } from '../lib/types';

/** The design's steps: 2.5 kg of weight, one rep, half a point of RPE. */
const WEIGHT_STEP = 2.5;
const REP_STEP = 1;
const RPE_MIN = 5;
const RPE_MAX = 10;

/** The API's bounds, so a typed number cannot compose a set it would refuse. */
const MAX_WEIGHT_KG = 1000;
const MAX_REPS = 200;

/**
 * What an exercise opens on when nothing is known about it: no weight at all.
 *
 * Nothing rather than a plausible 60 kg, because a plausible number is the one
 * that gets logged by accident. Zero is visibly not a weight you lifted, so it
 * has to be answered — and the answer is one tap on the number, not
 * twenty-four taps on the plus. An exercise that has been done before does not
 * reach this: it opens on what it was last done with.
 */
const OPENING = { weightKg: 0, reps: 8, rpe: 7 };

/**
 * The RPE a reps-in-the-tank target is, since the slider is the control that
 * target is actually aimed at: RPE 10 is nothing left, 8 is two left. Clamped
 * to the slider's own range, which is what a rest week's full tank hits — the
 * scale has no number for "eight left" and does not need one.
 */
function rpeForTank(tank: number): number {
    return Math.min(RPE_MAX, Math.max(RPE_MIN, 10 - tank));
}

/** A typed number, held inside the bounds the API would accept. */
function clamp(value: number, low: number, high: number): number {
    return Math.min(high, Math.max(low, value));
}

/**
 * Where a position-keyed value ends up after the same drag that moved entry
 * `from` to `to` — the index-space counterpart of `reordered()`, for the two
 * pieces of local state that are keyed by position instead of holding the
 * entry itself.
 */
function remapIndex(index: number, from: number, to: number): number {
    if (index === from) return to;

    if (from < to) {
        return index > from && index <= to ? index - 1 : index;
    }

    return index >= to && index < from ? index + 1 : index;
}

interface Pending {
    weightKg: number;
    reps: number;
    rpe: number;
}

interface SessionScreenProps {
    workout: Workout;
    label: string;
    library: ExerciseLibrary | null;

    /**
     * What this day prescribes, from the block rather than the session. Targets
     * live in one place so editing the plan cannot leave a stale number on a
     * logged workout.
     */
    plan: PlannedExercise[];

    /** How long the block is, which is what turns `workout.week` into a target. */
    weeks: number;

    /**
     * What each exercise was last done with, from the previous session on this
     * day. Empty is ordinary — a first week, or an exercise never logged — and
     * means the logger opens on nothing for it.
     */
    lastSets: LastSets;

    /** When this screen opened, for the stopwatch; null stops it at 0:00. */
    startedAt: number | null;
    savedAt: number | null;
    onAddExercise: () => void;
    onLogSet: (entryIndex: number, set: WorkSet) => void;
    onRemoveSet: (entryIndex: number, setIndex: number) => void;

    /**
     * Drags an exercise from one position to another. `from` and `to` use the
     * same splice semantics as `reordered()` in `useDragReorder` — `to` is
     * where the exercise lands, not a swap partner.
     *
     * This is more than a display preference: the order entries are logged in
     * is read by a separate backend downstream, so it has to reach the server
     * the same way a set does — one guarded write per drag, not just a local
     * re-sort the next sync happens to overwrite.
     */
    onReorderEntry: (from: number, to: number) => void;
    onFinish: () => void;
    onBack: () => void;
}

/**
 * The logging screen, and the reason the whole app exists.
 *
 * Its one rule: after the first set the primary button becomes **“Log same
 * again”**, so a working set is one tap and an adjustment is a delta rather
 * than a number typed from scratch. Everything else is arranged around not
 * getting in the way of that button, and nothing moves when a set lands.
 *
 * One exercise expanded at a time: two open loggers is two "Log same again"
 * buttons, and the tap is no longer safe to make without reading.
 *
 * The plan gives it a set count and nothing more. How hard each set should be
 * is the week's business — the band under the header carries one target of reps
 * left in the tank for the whole session, because it is one number for the
 * whole session, and the RPE control repeats it where it is acted on.
 */
export function SessionScreen({
    workout,
    label,
    library,
    plan,
    weeks,
    lastSets,
    startedAt,
    savedAt,
    onAddExercise,
    onLogSet,
    onRemoveSet,
    onReorderEntry,
    onFinish,
    onBack,
}: SessionScreenProps) {
    // The exercise whose logger is open — the last one added, which is the one
    // the picker was just used for.
    const [activeIndex, setActiveIndex] = useState<number | null>(
        workout.entries.length > 0 ? workout.entries.length - 1 : null,
    );

    // Per-entry stepper values, only for entries the user has touched. An
    // untouched entry reads its defaults from its own last set, so coming back
    // to an exercise opens on what you last lifted.
    const [pending, setPending] = useState<Record<number, Pending>>({});

    // A new exercise was added while this screen was open: focus it, because
    // adding one is always immediately followed by logging against it.
    const [entryCount, setEntryCount] = useState(workout.entries.length);

    if (entryCount !== workout.entries.length) {
        setEntryCount(workout.entries.length);

        if (workout.entries.length > 0) setActiveIndex(workout.entries.length - 1);
    }

    // One target for the whole session: how deep into each set to go, read off
    // where this week sits in the block rather than off the plan.
    const rest = isRestWeek(workout.week, weeks);
    const tank = repsInTank(workout.week, weeks);
    const targetRpe = rpeForTank(tank);

    /**
     * The target for one entry, or none. By position first, because a seeded
     * session's entries are the plan in order and exercises are only appended.
     * The name check keeps that position from being trusted blindly; the name
     * lookup behind it covers a planned exercise that ended up out of order.
     */
    function targetFor(entryIndex: number): PlannedExercise | undefined {
        const entry = workout.entries[entryIndex];

        if (!entry) return undefined;

        const positional = plan[entryIndex];

        if (positional && positional.exerciseName === entry.exerciseName) return positional;

        return plan.find((planned) => planned.exerciseName === entry.exerciseName);
    }

    /**
     * How many sets this week wants of one entry, or none if it is not planned.
     * The plan's count in a training week; half of it in the rest week, which
     * is the whole of what the deload changes — same exercises, less of them.
     */
    function targetSetsFor(entryIndex: number): number | undefined {
        const target = targetFor(entryIndex);

        return target ? setsForWeek(target.sets, workout.week, weeks) : undefined;
    }

    function valuesFor(entryIndex: number): Pending {
        const held = pending[entryIndex];

        if (held) return held;

        const entry = workout.entries[entryIndex];
        const sets = entry?.sets ?? [];
        const last = sets[sets.length - 1];

        // What you lifted a minute ago beats everything: this set continues the
        // one before it.
        if (last) {
            return { weightKg: last.weightKg, reps: last.reps, rpe: last.rpe ?? OPENING.rpe };
        }

        // Nothing logged against it today, so open on the last time it was
        // done at all. The weight and the reps carry over; the RPE does not,
        // because the week asks for something different from what last week
        // did and that is the whole shape of the block.
        const previous = entry ? lastSets[entry.exerciseName] : undefined;

        if (previous) {
            return { weightKg: previous.weightKg, reps: previous.reps, rpe: targetRpe };
        }

        // Never done. No weight to guess at, a generic eight reps, and the
        // week's intensity target — which is where intensity now comes from,
        // since the plan no longer names a rep count.
        return { ...OPENING, rpe: targetRpe };
    }

    function adjust(entryIndex: number, patch: Partial<Pending>) {
        setPending({ ...pending, [entryIndex]: { ...valuesFor(entryIndex), ...patch } });
    }

    // `activeIndex` and `pending` are keyed by position, and a drag changes
    // what sits at every position between `from` and `to`. Without this, the
    // logger left open after a drag would stay open on the *slot*, showing
    // whatever exercise the drag just moved into it rather than the one the
    // user actually had open.
    function reorderEntry(from: number, to: number) {
        setActiveIndex((current) => (current === null ? null : remapIndex(current, from, to)));

        setPending((current) => {
            const next: Record<number, Pending> = {};

            for (const [key, value] of Object.entries(current)) {
                next[remapIndex(Number(key), from, to)] = value;
            }

            return next;
        });

        onReorderEntry(from, to);
    }

    const { rowProps, handleProps } = useDragReorder(workout.entries.length, reorderEntry);

    // Ticks here rather than in App, so the once-a-second render stays on
    // this screen instead of rippling through every tab and sheet above it.
    const elapsed = useElapsed(startedAt);

    const totals = workout.totals;

    return (
        <div className="session">
            <header className="session__head">
                <button type="button" className="back" onClick={onBack} aria-label="Back">
                    ←
                </button>
                <div className="session__title">
                    <div className="session__label">{label}</div>
                    <div className="session__state">
                        <span className={savedAt ? 'dot' : 'dot dot--muted'} />
                        <span className="session__saved">
                            {savedAt
                                ? `Saved ${new Date(savedAt).toLocaleTimeString([], {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                })}`
                                : 'Every set saves as you log it'}
                        </span>
                    </div>
                </div>
                <div className="session__clock">
                    <div className="session__elapsed">{elapsedLabel(elapsed)}</div>
                    <div className="session__totals">
                        {totals.setCount} sets · {kg(totals.volumeKg)}
                    </div>
                </div>
            </header>

            <div className={rest ? 'tank tank--rest' : 'tank'}>
                <div className="tank__head">
                    <span className="tank__week">
                        {rest ? `WEEK ${workout.week} · REST` : `WEEK ${workout.week} OF ${weeks}`}
                    </span>
                    <span className="tank__value">{tankLabel(tank)}</span>
                </div>
                <p className="tank__note">
                    {rest
                        ? 'Deload. Same exercises, half the sets — leave the tank full and let '
                            + 'the block finish itself.'
                        : tank === 0
                            ? 'Last training week. Take each set to the last rep you can hold '
                                + `form on, around RPE ${num(targetRpe)}.`
                            : `Stop each set with about ${tankLabel(tank)}, around RPE `
                                + `${num(targetRpe)}.`}
                </p>
            </div>

            <div className="session__body">
                {workout.entries.map((entry, entryIndex) => {
                    const isActive = entryIndex === activeIndex;
                    const values = valuesFor(entryIndex);
                    const targetSets = targetSetsFor(entryIndex);
                    const volume = entry.sets.reduce(
                        (total, set) => total + set.weightKg * set.reps,
                        0,
                    );

                    const row = rowProps(entryIndex);
                    const articleClassName = row.className
                        ? `exercise ${row.className}`
                        : 'exercise';

                    return (
                        <article
                            className={articleClassName}
                            style={row.style}
                            ref={row.ref}
                            key={`${entry.exerciseName}-${entryIndex}`}
                        >
                            <div className="exercise__head">
                                <DragHandle
                                    label={entry.exerciseName}
                                    {...handleProps(entryIndex)}
                                />
                                <button
                                    type="button"
                                    className="exercise__toggle"
                                    onClick={() => setActiveIndex(isActive ? null : entryIndex)}
                                    aria-expanded={isActive}
                                >
                                    <span style={{ flex: 1, minWidth: 0 }}>
                                        <span className="exercise__name">
                                            {entry.exerciseName}
                                        </span>
                                        <span className="exercise__eq">
                                            {equipmentFor(library, entry.exerciseName)}
                                            {targetSets === undefined
                                                ? ''
                                                : ` · target ${targetSets} sets`}
                                        </span>
                                    </span>
                                    <span
                                        className={targetSets !== undefined
                                            && entry.sets.length >= targetSets
                                            ? 'exercise__summary exercise__summary--met'
                                            : 'exercise__summary'}
                                    >
                                        {targetSets !== undefined
                                            ? `${entry.sets.length} of ${targetSets} sets`
                                            : entry.sets.length > 0
                                                ? `${entry.sets.length} sets · ${kg(volume)}`
                                                : 'no sets yet'}
                                    </span>
                                </button>
                            </div>

                            {entry.sets.length > 0 ? (
                                <div className="sets">
                                    {entry.sets.map((set, setIndex) => (
                                        <div
                                            className="set"
                                            key={`${setIndex}-${set.weightKg}-${set.reps}`}
                                        >
                                            <span className="set__no">{setIndex + 1}</span>
                                            <span className="set__main">
                                                {num(set.weightKg)} kg × {num(set.reps)}
                                            </span>
                                            <span
                                                className={set.rpe === null
                                                    ? 'set__rpe set__rpe--none'
                                                    : 'set__rpe'}
                                            >
                                                {set.rpe === null
                                                    ? 'no RPE'
                                                    : `RPE ${num(set.rpe)}`}
                                            </span>
                                            <button
                                                type="button"
                                                className="set__del"
                                                onClick={() => onRemoveSet(entryIndex, setIndex)}
                                                aria-label={`Remove set ${setIndex + 1}`}
                                            >
                                                ×
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            ) : null}

                            {isActive ? (
                                <div className="logger">
                                    <div className="stepper-row" style={{ marginTop: 0 }}>
                                        <Stepper
                                            label="WEIGHT KG"
                                            value={num(values.weightKg)}
                                            onDecrease={() => adjust(entryIndex, {
                                                weightKg: Math.max(
                                                    0,
                                                    values.weightKg - WEIGHT_STEP,
                                                ),
                                            })}
                                            onIncrease={() => adjust(entryIndex, {
                                                weightKg: Math.min(
                                                    MAX_WEIGHT_KG,
                                                    values.weightKg + WEIGHT_STEP,
                                                ),
                                            })}
                                            canDecrease={values.weightKg > 0}
                                            canIncrease={values.weightKg < MAX_WEIGHT_KG}
                                            onValue={(weightKg) => adjust(entryIndex, {
                                                weightKg: clamp(weightKg, 0, MAX_WEIGHT_KG),
                                            })}
                                        />
                                        <Stepper
                                            label="REPS"
                                            value={num(values.reps)}
                                            onDecrease={() => adjust(entryIndex, {
                                                reps: Math.max(1, values.reps - REP_STEP),
                                            })}
                                            onIncrease={() => adjust(entryIndex, {
                                                reps: Math.min(MAX_REPS, values.reps + REP_STEP),
                                            })}
                                            canDecrease={values.reps > 1}
                                            canIncrease={values.reps < MAX_REPS}
                                            keypad="numeric"
                                            onValue={(reps) => adjust(entryIndex, {
                                                reps: clamp(Math.round(reps), 1, MAX_REPS),
                                            })}
                                        />
                                    </div>

                                    <div className="rpe">
                                        <div className="rpe__head">
                                            <span className="field-label">
                                                RPE · TARGET {tank} LEFT
                                            </span>
                                            <span
                                                className={values.rpe === targetRpe
                                                    ? 'rpe__note rpe__note--met'
                                                    : 'rpe__note'}
                                            >
                                                {rpeNote(values.rpe)}
                                            </span>
                                        </div>
                                        <div className="rpe__controls">
                                            <input
                                                className="slider"
                                                type="range"
                                                min={RPE_MIN}
                                                max={RPE_MAX}
                                                step={0.5}
                                                value={values.rpe}
                                                onChange={(event) => adjust(entryIndex, {
                                                    rpe: Number(event.target.value),
                                                })}
                                                aria-label="Rate of perceived exertion"
                                            />
                                            <span className="rpe__value">
                                                {num(values.rpe)}
                                            </span>
                                        </div>
                                    </div>

                                    <button
                                        type="button"
                                        className="log-button"
                                        onClick={() => onLogSet(entryIndex, {
                                            weightKg: values.weightKg,
                                            reps: values.reps,
                                            rpe: values.rpe,
                                        })}
                                    >
                                        {entry.sets.length > 0
                                            ? `Log same again (${num(values.weightKg)}×${num(values.reps)})`
                                            : 'Log first set'}
                                    </button>
                                </div>
                            ) : null}
                        </article>
                    );
                })}

                <button type="button" className="add-exercise" onClick={onAddExercise}>
                    + Add exercise
                </button>
            </div>

            <div className="finish-bar">
                <button type="button" className="finish-bar__button" onClick={onFinish}>
                    Finish &amp; submit workout
                </button>
            </div>
        </div>
    );
}
