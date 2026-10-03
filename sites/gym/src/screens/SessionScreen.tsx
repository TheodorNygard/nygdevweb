import { useEffect, useRef, useState } from 'react';

import { DragHandle } from '../components/DragHandle';
import { ExercisePicker } from '../components/ExercisePicker';
import { SetSheet } from '../components/SetSheet';
import { Stepper } from '../components/Stepper';
import { useDragReorder } from '../hooks/useDragReorder';
import type { LastSets } from '../hooks/useLastSets';
import type { Waiting } from '../hooks/useSession';
import {
    completesTarget,
    isRestWeek,
    repsInTank,
    swappedAway,
    targetsFor,
    workingSetCount,
} from '../lib/block';
import { MIN_WORKING_RPE, isWarmUpRpe, kg, num, rpeNote, tankLabel } from '../lib/format';
import { equipmentFor } from '../lib/library';
import {
    MAX_REPS,
    MAX_WEIGHT_KG,
    REP_STEP,
    RPE_MAX,
    RPE_MIN,
    WEIGHT_STEP,
    clamp,
} from '../lib/steps';
import type { ExerciseLibrary, PlannedExercise, WorkSet, Workout } from '../lib/types';

/**
 * How long a set's delete stays armed after the first tap. Long enough to reach
 * for the second tap, short enough that a row left armed does not sit there
 * waiting for a stray thumb several sets later.
 */
const DELETE_ARMED_MS = 3000;

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
 * target is actually aimed at: RPE 10 is nothing left, 8 is two left.
 *
 * Floored at the first *working* rating rather than at the bottom of the
 * slider. The two are not the same: the slider opens at 5, but 5 and 5.5 are
 * warm-ups, so a target there would be a week asking for sets that count toward
 * nothing. A tank deep enough to fall off the scale gets the easiest rating
 * that is still a set.
 */
function rpeForTank(tank: number): number {
    return Math.min(RPE_MAX, Math.max(MIN_WORKING_RPE, 10 - tank));
}

/**
 * What each set of an exercise is called on screen. Working sets are numbered
 * 1, 2, 3 and warm-ups are not numbered at all — a warm-up that consumed a
 * number would put "3 of 3" beside a row labelled 4.
 */
function setLabelsOf(sets: readonly WorkSet[]): string[] {
    let counted = 0;

    return sets.map((set) => {
        if (isWarmUpRpe(set.rpe)) return 'W';

        counted += 1;

        return String(counted);
    });
}

/**
 * Whether the set about to be logged is the last one again — what "Log same
 * again" promises. Once a stepper has moved it is a different set, and the
 * button saying "same" over a heavier one is the label being wrong at the one
 * moment it is read. A last set with no RPE is matched against the rating the
 * steppers opened on for it, since that is what an untouched logger holds.
 */
function repeatsLast(sets: readonly WorkSet[], values: Pending): boolean {
    const last = sets[sets.length - 1];

    return last !== undefined
        && last.weightKg === values.weightKg
        && last.reps === values.reps
        && (last.rpe ?? OPENING.rpe) === values.rpe;
}

/**
 * What a swap is about to do, said under the picker's title — because the same
 * button does three different things depending on what is logged and whether
 * the sets go with it.
 */
function swapNote(setCount: number, withSets: boolean): string {
    if (setCount === 0) return 'Takes its place in this workout. The day’s plan is not changed.';

    const sets = setCount === 1 ? 'The set' : `The ${setCount} sets`;

    return withSets
        ? `${sets} logged on it ${setCount === 1 ? 'moves' : 'move'} to what you pick — for when `
            + `${setCount === 1 ? 'it was' : 'they were'} really done on something else. `
            + (setCount === 1 ? 'Its history goes with it.' : 'Their history goes with them.')
        : `${sets} logged on it ${setCount === 1 ? 'stays' : 'stay'} there. What you pick goes `
            + 'in after it, for whatever the plan has left.';
}

/** A set by its position: which exercise, and which of its sets. */
interface SetRef {
    entryIndex: number;
    setIndex: number;
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

    savedAt: number | null;

    /**
     * Writes that did not get through and are being retried. While there are
     * any, the header says how many instead of when the last one landed —
     * "Saved 19:42" above a set that is not saved would be the one lie the
     * header exists not to tell.
     */
    waiting: Waiting | null;
    onAddExercise: () => void;
    onLogSet: (entryIndex: number, set: WorkSet) => void;

    /** Confirmed on the row first — the one destructive thing a set row does. */
    onRemoveSet: (entryIndex: number, setIndex: number) => void;

    /** Corrects a logged set in place. No confirmation; see `SetSheet`. */
    onEditSet: (entryIndex: number, setIndex: number, set: WorkSet) => void;

    /**
     * Swaps an exercise for another — replaced where it stands if nothing is
     * logged on it, inserted after it otherwise, so its sets are never lost.
     * `withSets` moves them with it instead: always on a finished workout, and
     * mid-workout when the user says so. The picker that chooses `to` is this
     * screen's own, because where the logger lands afterwards depends on the
     * shape.
     */
    onSwapEntry: (entryIndex: number, to: string, withSets: boolean) => void;

    /**
     * Takes an exercise out of the session — offered only once it holds no
     * sets, which is what the API allows and what the control means. A picked
     * exercise that was never lifted is a mis-tap; one with sets against it is
     * a logged workout, and the sets come off first.
     */
    onRemoveEntry: (entryIndex: number) => void;

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
 *
 * The set that meets an exercise's target **moves the logger on** to the next
 * exercise that still owes sets. That is the shape of a workout — you finish
 * one thing and start the next — and doing it on the tap means the common case
 * costs no thought and no scrolling. It is not a limit: the target is a plan,
 * not a contract, so a fourth set against a three-set plan is one tap on the
 * exercise's own header to reopen it. Nothing is closed off, only re-ordered.
 *
 * Warm-ups do not count toward that target — see `workingSetCount` — so ramping
 * up to a working weight cannot finish an exercise by itself.
 *
 * When the equipment is taken, the ⇄ on an exercise swaps it: its variations
 * first, then anything else doing the same job. Sets already logged stay on the
 * exercise they were lifted on, and the substitute owes what the plan had left
 * — see `targetsFor`. Or, one tap more, they move with it: the curls were done
 * on the cable and logged as dumbbell curls, which is a correction rather than
 * a swap, and the sets' history belongs on the cable.
 *
 * Every logged set can be corrected by tapping it, and deleted by tapping its ×
 * twice. That holds on a submitted workout too, which is opened here from the
 * day sheet to be edited: the finish bar becomes a way back rather than a
 * second submit, and ⇄ becomes a correction — the sets logged on an exercise
 * move to the one they were actually done on, rather than staying behind for a
 * substitute there is nothing left to log against.
 */
export function SessionScreen({
    workout,
    label,
    library,
    plan,
    weeks,
    lastSets,
    savedAt,
    waiting,
    onAddExercise,
    onLogSet,
    onRemoveSet,
    onEditSet,
    onSwapEntry,
    onRemoveEntry,
    onReorderEntry,
    onFinish,
    onBack,
}: SessionScreenProps) {
    // The exercise whose logger is open. The session opens at the top of the
    // workout: the entries are in the order the day plans them, and the first
    // one is the one about to be done — on a fresh session and on a draft
    // resumed mid-workout alike, where the top is still where you read from.
    // Adding one later moves the focus to it; see `entryCount` below.
    const [activeIndex, setActiveIndex] = useState<number | null>(
        workout.entries.length > 0 ? 0 : null,
    );

    // Per-entry stepper values, only for entries the user has touched. An
    // untouched entry reads its defaults from its own last set, so coming back
    // to an exercise opens on what you last lifted.
    const [pending, setPending] = useState<Record<number, Pending>>({});

    // Where the logger goes when the list next grows, if not to the bottom. A
    // swap that keeps the sets inserts its substitute straight after the
    // original, and that — not the last exercise — is what is about to be done.
    const [growthFocus, setGrowthFocus] = useState<number | null>(null);

    // A new exercise was added while this screen was open: focus it, because
    // adding one is always immediately followed by logging against it. Only
    // when the list *grew* — a removal changes the count too, and jumping the
    // logger to the last exercise is the opposite of what taking one out
    // means.
    const [entryCount, setEntryCount] = useState(workout.entries.length);

    if (entryCount !== workout.entries.length) {
        const grew = workout.entries.length > entryCount;

        setEntryCount(workout.entries.length);

        if (grew) {
            setActiveIndex(growthFocus ?? workout.entries.length - 1);
            setGrowthFocus(null);
        }
    }

    // The exercise the swap picker is open for, the set being corrected, and
    // the set whose delete has had its first tap. All three are positions, so
    // anything that moves positions — a drag, a removal, a swap — clears them
    // rather than leaving them pointing at whatever moved into the slot.
    const [swapping, setSwapping] = useState<number | null>(null);
    const [editing, setEditing] = useState<SetRef | null>(null);

    // Whether the swap being picked moves the logged sets along with it, where
    // that is a choice at all (see `carryChoice` below). Off each time the
    // picker opens: the equipment being taken is the common reason to swap.
    const [moveSets, setMoveSets] = useState(false);
    const [armed, setArmed] = useState<SetRef | null>(null);

    useEffect(() => {
        if (!armed) return;

        const timer = window.setTimeout(() => setArmed(null), DELETE_ARMED_MS);

        return () => window.clearTimeout(timer);
    }, [armed]);

    function forgetPositions() {
        setSwapping(null);
        setEditing(null);
        setArmed(null);
    }

    // One target for the whole session: how deep into each set to go, read off
    // where this week sits in the block rather than off the plan.
    const rest = isRestWeek(workout.week, weeks);
    const tank = repsInTank(workout.week, weeks);
    const targetRpe = rpeForTank(tank);

    // How many sets this week wants of each entry, or none where nothing is
    // planned. The plan's count in a training week; half of it in the rest
    // week, which is the whole of what the deload changes — same exercises,
    // less of them. Across a swap the count is shared rather than repeated:
    // the substitute owes what the original had left.
    const targets = targetsFor(plan, workout.entries, workout.week, weeks);

    function targetSetsFor(entryIndex: number): number | undefined {
        return targets[entryIndex];
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
        forgetPositions();
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

    /**
     * The same problem a drag has, in its simpler form: everything after the
     * removed entry shifts down a place, and `activeIndex` and `pending` are
     * keyed by place. The logger open on the exercise being removed closes,
     * because the thing it was open on is gone.
     */
    function removeEntry(entryIndex: number) {
        forgetPositions();
        setActiveIndex((index) => {
            if (index === null || index === entryIndex) return null;

            return index > entryIndex ? index - 1 : index;
        });

        setPending((held) => {
            const next: Record<number, Pending> = {};

            for (const [key, value] of Object.entries(held)) {
                const index = Number(key);

                if (index === entryIndex) continue;

                next[index > entryIndex ? index - 1 : index] = value;
            }

            return next;
        });

        onRemoveEntry(entryIndex);
    }

    /**
     * Swaps an exercise and puts the logger where the next set belongs.
     *
     * The two shapes move positions differently. Replaced in place, nothing
     * shifts — but what the steppers held was for the old exercise, and the
     * substitute should open on its own last weight rather than on a number
     * lifted on something else. Inserted after, everything below moves down one
     * and the logger moves to the substitute, which is what is about to be done.
     *
     * Moving the sets with it is the in-place shape with the sets kept, so the
     * logger stays where it is — open on the same sets under their right name,
     * with the steppers reading the last of them.
     */
    function swapEntry(entryIndex: number, to: string, withSets: boolean) {
        const entry = workout.entries[entryIndex];

        if (!entry || entry.exerciseName === to) return;

        forgetPositions();

        if (entry.sets.length === 0 || withSets) {
            setPending((held) => {
                const next = { ...held };

                delete next[entryIndex];

                return next;
            });
            setActiveIndex(entryIndex);
        } else {
            setPending((held) => {
                const next: Record<number, Pending> = {};

                for (const [key, value] of Object.entries(held)) {
                    const index = Number(key);

                    next[index > entryIndex ? index + 1 : index] = value;
                }

                return next;
            });
            setGrowthFocus(entryIndex + 1);
        }

        onSwapEntry(entryIndex, to, withSets);
    }

    /**
     * The next exercise below this one that still owes sets, or null when the
     * rest of the workout is done.
     *
     * Forward only, deliberately. The screen is a list read top to bottom, and
     * an advance that jumped *backwards* to an exercise left unfinished earlier
     * would move the page under a thumb that is expecting to go down. An
     * exercise skipped on the way past stays skipped until it is tapped, which
     * is what leaving it meant.
     *
     * An unplanned exercise — one added during the session — always counts as
     * owing sets. It has no target to have met, and it was added on purpose.
     * One that was swapped away from owes nothing: its substitute, further
     * down, is carrying what is left.
     */
    function nextUnmet(from: number): number | null {
        for (let index = from + 1; index < workout.entries.length; index += 1) {
            const entry = workout.entries[index];

            if (!entry || swappedAway(workout.entries, index)) continue;

            const target = targetSetsFor(index);

            if (target === undefined || workingSetCount(entry.sets) < target) return index;
        }

        return null;
    }

    /**
     * Moves the logger on, for the set that meets the target and no other — see
     * `completesTarget`, which is where that rule lives and is tested.
     *
     * Read from the session as it stands *before* this set lands: the write
     * applies locally a render later, so `entry.sets` here is what the set being
     * logged is about to add to.
     */
    function advanceAfter(entryIndex: number, rpe: number) {
        const entry = workout.entries[entryIndex];

        if (!entry || !completesTarget(entry.sets, targetSetsFor(entryIndex), rpe)) return;

        const next = nextUnmet(entryIndex);

        setActiveIndex(next);
        advancedTo.current = next;
    }

    const { rowProps, handleProps } = useDragReorder(workout.entries.length, reorderEntry);

    // The rows themselves, for scrolling an auto-advance into view. Kept
    // separately from the drag hook's own map rather than reaching into it: that
    // one exists to measure a drag, and two features sharing one ref is how one
    // of them ends up quietly depending on the other's lifecycle.
    const rowElements = useRef<Map<number, HTMLElement>>(new Map());

    // Which entry an advance just opened, consumed by the effect below. A ref
    // rather than state because it must not cause a render of its own, and
    // because the scroll has to happen *after* the render that expanded the row.
    const advancedTo = useRef<number | null>(null);

    useEffect(() => {
        const index = advancedTo.current;

        advancedTo.current = null;

        // Null is the workout's last unmet exercise having just been finished:
        // the logger closes and nothing is scrolled to, which leaves the finish
        // bar as the only thing left to press.
        if (index === null) return;

        rowElements.current.get(index)?.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
        });
    });

    const totals = workout.totals;
    const submitted = workout.status === 'submitted';

    const swappingEntry = swapping === null ? undefined : workout.entries[swapping];

    // What a swap does with the sets already logged. A finished workout has
    // nothing left to log, so they can only have been done on something else.
    // An exercise already swapped away from has its substitute below it, and a
    // second one would split what the plan has left three ways, so its sets
    // can only be corrected too. Anywhere else with sets, it is the user's
    // call — and with none, there is nothing to carry.
    const swappingAway = swapping !== null && swappedAway(workout.entries, swapping);
    const carryChoice = !submitted && !swappingAway && (swappingEntry?.sets.length ?? 0) > 0;
    const carriesSets = submitted || swappingAway || (carryChoice && moveSets);
    const editingEntry = editing === null ? undefined : workout.entries[editing.entryIndex];
    const editingSet = editing === null ? undefined : editingEntry?.sets[editing.setIndex];

    return (
        <div className="session">
            <header className="session__head">
                <button type="button" className="back" onClick={onBack} aria-label="Back">
                    ←
                </button>
                <div className="session__title">
                    <div className="session__label">{label}</div>
                    <div className="session__state">
                        <span className={savedAt && !waiting ? 'dot' : 'dot dot--muted'} />
                        <span className="session__saved">
                            {waiting
                                ? `${waiting.count} ${waiting.setsOnly ? 'set' : 'change'}`
                                    + `${waiting.count === 1 ? '' : 's'} waiting to save`
                                : savedAt
                                    ? `Saved ${new Date(savedAt).toLocaleTimeString([], {
                                        hour: '2-digit',
                                        minute: '2-digit',
                                    })}`
                                    : submitted
                                        ? 'Submitted · edits save as you make them'
                                        : 'Every set saves as you log it'}
                        </span>
                    </div>
                </div>
                {/* What the session adds up to so far. There is no clock: a
                    logbook is a record of what was lifted, and a stopwatch
                    counting up beside it turns a rest between sets into
                    something being measured. */}
                <div className="session__tally">
                    <div className="session__count">{totals.setCount} sets</div>
                    <div className="session__volume">{kg(totals.volumeKg)}</div>
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
                        ? 'Deload. Same exercises, half the sets, and every set stopped with '
                            + `${tankLabel(tank)} — around RPE ${num(targetRpe)}. Easy, but still `
                            + 'sets: log them the way you log any other.'
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
                    const working = workingSetCount(entry.sets);
                    const volume = entry.sets.reduce(
                        (total, set) => total + set.weightKg * set.reps,
                        0,
                    );
                    const setLabels = setLabelsOf(entry.sets);
                    const away = swappedAway(workout.entries, entryIndex);

                    // Named only when it says something: an entry swapped back
                    // to its own original is standing in for itself.
                    const standsInFor = entry.swappedFrom !== undefined
                        && entry.swappedFrom !== entry.exerciseName
                        ? entry.swappedFrom
                        : null;

                    // Quieter while another exercise has the logger open, so
                    // the eye lands on the one being lifted. Only then: with
                    // every exercise closed there is nothing to defer to.
                    const idle = activeIndex !== null && !isActive;

                    const row = rowProps(entryIndex);
                    const articleClassName = ['exercise', idle ? 'exercise--idle' : '', row.className]
                        .filter(Boolean)
                        .join(' ');

                    return (
                        <article
                            className={articleClassName}
                            style={row.style}
                            ref={(element) => {
                                row.ref(element);

                                if (element) rowElements.current.set(entryIndex, element);
                                else rowElements.current.delete(entryIndex);
                            }}
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
                                            {/* A substitute names what it
                                                stands in for in place of its
                                                target — the counter beside it
                                                already says how many it owes,
                                                and both will not fit a phone. */}
                                            {away
                                                ? ' · swapped'
                                                : standsInFor
                                                    ? ` · for ${standsInFor}`
                                                    : targetSets === undefined
                                                        ? ''
                                                        : ` · target ${targetSets} sets`}
                                        </span>
                                    </span>
                                    <span
                                        className={targetSets !== undefined
                                            && working >= targetSets
                                            ? 'exercise__summary exercise__summary--met'
                                            : 'exercise__summary'}
                                    >
                                        {targetSets !== undefined
                                            ? `${working} of ${targetSets} sets`
                                            : entry.sets.length > 0
                                                ? `${entry.sets.length} sets · ${kg(volume)}`
                                                : 'no sets yet'}
                                    </span>
                                </button>
                                {/* On every exercise, one already swapped away
                                    from included: its sets may have been done
                                    on something else too, and correcting
                                    that is the one swap it can still make. */}
                                <button
                                    type="button"
                                    className="exercise__swap"
                                    onClick={() => {
                                        setArmed(null);
                                        setMoveSets(false);
                                        setSwapping(entryIndex);
                                    }}
                                    aria-label={`Swap ${entry.exerciseName} for another exercise`}
                                >
                                    ⇄
                                </button>
                                {entry.sets.length === 0 ? (
                                    <button
                                        type="button"
                                        className="exercise__del"
                                        onClick={() => removeEntry(entryIndex)}
                                        aria-label={`Remove ${entry.exerciseName}`}
                                    >
                                        ×
                                    </button>
                                ) : null}
                            </div>

                            {entry.sets.length > 0 ? (
                                <div className="sets">
                                    {entry.sets.map((set, setIndex) => {
                                        const isArmed = armed?.entryIndex === entryIndex
                                            && armed.setIndex === setIndex;
                                        const setName = setLabels[setIndex] === 'W'
                                            ? 'warm-up'
                                            : `set ${setLabels[setIndex] ?? setIndex + 1}`;

                                        return (
                                            <div
                                                className={isWarmUpRpe(set.rpe)
                                                    ? 'set set--warmup'
                                                    : 'set'}
                                                key={`${setIndex}-${set.weightKg}-${set.reps}`}
                                            >
                                                {/* The row is the edit: the
                                                    numbers being corrected are
                                                    the thing to tap. */}
                                                <button
                                                    type="button"
                                                    className="set__edit"
                                                    onClick={() => {
                                                        setArmed(null);
                                                        setEditing({ entryIndex, setIndex });
                                                    }}
                                                    aria-label={`Edit ${setName}: ${num(set.weightKg)} kg × ${num(set.reps)}`}
                                                >
                                                    <span className="set__no">
                                                        {setLabels[setIndex]}
                                                    </span>
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
                                                </button>
                                                {/* Two taps, the second on a
                                                    control that says what it
                                                    does. A set deleted by a
                                                    thumb brushing the × is a
                                                    logged lift gone. */}
                                                {isArmed ? (
                                                    <button
                                                        type="button"
                                                        className="set__del set__del--armed"
                                                        onClick={() => {
                                                            setArmed(null);
                                                            onRemoveSet(entryIndex, setIndex);
                                                        }}
                                                        aria-label={`Confirm deleting ${setName}`}
                                                    >
                                                        Delete
                                                    </button>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        className="set__del"
                                                        onClick={() => setArmed({ entryIndex, setIndex })}
                                                        aria-label={`Delete ${setName}`}
                                                    >
                                                        ×
                                                    </button>
                                                )}
                                            </div>
                                        );
                                    })}
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
                                        onClick={() => {
                                            onLogSet(entryIndex, {
                                                weightKg: values.weightKg,
                                                reps: values.reps,
                                                rpe: values.rpe,
                                            });

                                            advanceAfter(entryIndex, values.rpe);
                                        }}
                                    >
                                        {/* Naming the warm-up on the button is
                                            where the rule is visible: it is the
                                            moment it applies, and it says why
                                            the count did not move afterwards. */}
                                        {isWarmUpRpe(values.rpe)
                                            ? `Log warm-up (${num(values.weightKg)}×${num(values.reps)})`
                                            : entry.sets.length === 0
                                                ? 'Log first set'
                                                : repeatsLast(entry.sets, values)
                                                    ? `Log same again (${num(values.weightKg)}×${num(values.reps)})`
                                                    : `Log set (${num(values.weightKg)}×${num(values.reps)})`}
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
                {submitted ? (
                    // Already submitted: every edit saved as it was made, so
                    // there is nothing left to finish — only a way back.
                    <button type="button" className="finish-bar__button" onClick={onBack}>
                        Done editing
                    </button>
                ) : (
                    <button type="button" className="finish-bar__button" onClick={onFinish}>
                        Finish &amp; submit workout
                    </button>
                )}
            </div>

            {swapping !== null && swappingEntry ? (
                <ExercisePicker
                    library={library}
                    busy={false}
                    swapping={{
                        exerciseName: swappingEntry.exerciseName,
                        ...(swappingEntry.swappedFrom === undefined
                            ? {}
                            : { swappedFrom: swappingEntry.swappedFrom }),
                        note: swapNote(swappingEntry.sets.length, carriesSets),
                        ...(carryChoice
                            ? { carry: { withSets: moveSets, onChange: setMoveSets } }
                            : {}),
                    }}
                    onPick={(name) => swapEntry(swapping, name, carriesSets)}
                    onClose={() => setSwapping(null)}
                />
            ) : null}

            {editing !== null && editingEntry && editingSet ? (
                <SetSheet
                    exerciseName={editingEntry.exerciseName}
                    setLabel={setLabelsOf(editingEntry.sets)[editing.setIndex] === 'W'
                        ? 'Warm-up'
                        : `Set ${setLabelsOf(editingEntry.sets)[editing.setIndex] ?? editing.setIndex + 1}`}
                    set={editingSet}
                    onSave={(set) => {
                        setEditing(null);
                        onEditSet(editing.entryIndex, editing.setIndex, set);
                    }}
                    onClose={() => setEditing(null)}
                />
            ) : null}
        </div>
    );
}
