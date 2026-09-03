import { useState } from 'react';

import { Stepper } from '../components/Stepper';
import { isRestWeek, repsInTank } from '../lib/block';
import { elapsedLabel, kg, num, rpeNote, tankLabel } from '../lib/format';
import { equipmentFor } from '../lib/library';
import type { ExerciseLibrary, PlannedExercise, WorkSet, Workout } from '../lib/types';

/** The design's steps: 2.5 kg of weight, one rep, half a point of RPE. */
const WEIGHT_STEP = 2.5;
const REP_STEP = 1;
const RPE_MIN = 5;
const RPE_MAX = 10;

/** What a fresh exercise opens on before anything has been logged against it. */
const OPENING = { weightKg: 60, reps: 8, rpe: 7 };

/**
 * The RPE a reps-in-the-tank target is, since the slider is the control that
 * target is actually aimed at: RPE 10 is nothing left, 8 is two left. Clamped
 * to the slider's own range, which is what a rest week's full tank hits — the
 * scale has no number for "eight left" and does not need one.
 */
function rpeForTank(tank: number): number {
    return Math.min(RPE_MAX, Math.max(RPE_MIN, 10 - tank));
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
    elapsed: number;
    savedAt: number | null;
    onAddExercise: () => void;
    onLogSet: (entryIndex: number, set: WorkSet) => void;
    onRemoveSet: (entryIndex: number, setIndex: number) => void;
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
    elapsed,
    savedAt,
    onAddExercise,
    onLogSet,
    onRemoveSet,
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

    function valuesFor(entryIndex: number): Pending {
        const held = pending[entryIndex];

        if (held) return held;

        const sets = workout.entries[entryIndex]?.sets ?? [];
        const last = sets[sets.length - 1];

        // What you last lifted beats what the plan asked for: the plan opens
        // the session, the previous set continues it.
        if (last) {
            return { weightKg: last.weightKg, reps: last.reps, rpe: last.rpe ?? OPENING.rpe };
        }

        // Nothing logged yet. Reps open on a generic eight — the plan no longer
        // prescribes one, and a target that names a number is the thing this
        // screen stopped doing. The RPE opens on the week's target instead,
        // which is where the intensity now comes from.
        return { ...OPENING, rpe: targetRpe };
    }

    function adjust(entryIndex: number, patch: Partial<Pending>) {
        setPending({ ...pending, [entryIndex]: { ...valuesFor(entryIndex), ...patch } });
    }

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
                        ? 'Deload. Same movements, half the load — leave the tank full and let '
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
                    const target = targetFor(entryIndex);
                    const volume = entry.sets.reduce(
                        (total, set) => total + set.weightKg * set.reps,
                        0,
                    );

                    return (
                        <article className="exercise" key={`${entry.exerciseName}-${entryIndex}`}>
                            <button
                                type="button"
                                className="exercise__head"
                                onClick={() => setActiveIndex(isActive ? null : entryIndex)}
                                aria-expanded={isActive}
                            >
                                <span style={{ flex: 1, minWidth: 0 }}>
                                    <span className="exercise__name">{entry.exerciseName}</span>
                                    <span className="exercise__eq">
                                        {equipmentFor(library, entry.exerciseName)}
                                        {target ? ` · target ${target.sets} sets` : ''}
                                    </span>
                                </span>
                                <span
                                    className={target && entry.sets.length >= target.sets
                                        ? 'exercise__summary exercise__summary--met'
                                        : 'exercise__summary'}
                                >
                                    {target
                                        ? `${entry.sets.length} of ${target.sets} sets`
                                        : entry.sets.length > 0
                                            ? `${entry.sets.length} sets · ${kg(volume)}`
                                            : 'no sets yet'}
                                </span>
                            </button>

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
                                                weightKg: values.weightKg + WEIGHT_STEP,
                                            })}
                                            canDecrease={values.weightKg > 0}
                                        />
                                        <Stepper
                                            label="REPS"
                                            value={num(values.reps)}
                                            onDecrease={() => adjust(entryIndex, {
                                                reps: Math.max(1, values.reps - REP_STEP),
                                            })}
                                            onIncrease={() => adjust(entryIndex, {
                                                reps: values.reps + REP_STEP,
                                            })}
                                            canDecrease={values.reps > 1}
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
