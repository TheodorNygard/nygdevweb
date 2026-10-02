import { isWarmUpRpe } from './format';
import type {
    CurrentBlock,
    Mesocycle,
    PlannedExercise,
    SessionEntry,
    SessionSummary,
    WorkSet,
} from './types';

/**
 * The sessions filed against one cell of the block map, newest first.
 *
 * A cell holds more than one now: sessions are keyed on the calendar date
 * rather than on `(meso, week, dayIndex)`, so Start on an already-logged day
 * files a *second* session rather than overwriting the first. The cell shows
 * the most recent; the day sheet lists the rest with a way to delete one.
 */
export function sessionsFor(
    sessions: SessionSummary[],
    week: number,
    dayIndex: number,
): SessionSummary[] {
    return sessions.filter((session) => session.week === week && session.dayIndex === dayIndex);
}

/** The open draft, if this cell has one. At most one exists per date and cell. */
export function draftIn(sessions: SessionSummary[]): SessionSummary | undefined {
    return sessions.find((session) => session.status === 'draft');
}

export interface BlockProgress {
    /** Cells with at least one submitted session. */
    doneCount: number;
    totalCount: number;
    percent: number;
}

/**
 * "12 of 20 workouts logged". Counted in cells rather than in sessions: a day
 * logged twice is one cell of progress, and counting sessions would let a block
 * read 21 of 20.
 */
export function progressOf(mesocycle: Mesocycle, sessions: SessionSummary[]): BlockProgress {
    const cells = new Set<string>();

    for (const session of sessions) {
        if (session.status !== 'submitted') continue;
        if (session.week < 1 || session.week > mesocycle.weeks) continue;

        // Against what the *week* asks for rather than what the block holds,
        // which is now two different numbers: the rest week runs fewer days
        // than the training weeks do. A session logged on a day the rest week
        // dropped is work you did, and History keeps it — it is just not a
        // cell of a plan that no longer has one there, the same way a second
        // session on one date is not a second cell.
        if (session.dayIndex >= daysForWeek(mesocycle.days.length, session.week, mesocycle.weeks)) {
            continue;
        }

        cells.add(`${session.week}:${session.dayIndex}`);
    }

    let totalCount = 0;

    for (let week = 1; week <= mesocycle.weeks; week += 1) {
        totalCount += daysForWeek(mesocycle.days.length, week, mesocycle.weeks);
    }

    return {
        doneCount: cells.size,
        totalCount,
        percent: totalCount === 0 ? 0 : Math.round((cells.size / totalCount) * 100),
    };
}

/**
 * Which week Today opens on: the latest week with anything in it, or week 1.
 *
 * Not derived from the calendar. Days are labelled, not scheduled — you log
 * "Upper A" whenever you do it — so there is no date arithmetic that could say
 * which week it is, and a start date would be wrong for anyone who missed one.
 */
export function currentWeek(block: CurrentBlock): number {
    if (!block.mesocycle) return 1;

    let latest = 1;

    for (const session of block.sessions) {
        if (session.week > latest && session.week <= block.mesocycle.weeks) {
            latest = session.week;
        }
    }

    return latest;
}

/**
 * How many of an entry's sets count against what the day asks for.
 *
 * Warm-ups do not. They are work you did and the session records them like any
 * other set — the volume, the header's set count and everything the API derives
 * all still include them — but a day that prescribes three sets is prescribing
 * three *working* sets, and warm-ups counted toward it would mean the target is
 * met by ramping up to the weight.
 *
 * That the two numbers can disagree is deliberate rather than a rounding
 * problem: "3 of 3" is progress against a plan and the header's "9 sets" is the
 * record of what was lifted. Only the first one is what a warm-up should be
 * invisible to.
 */
export function workingSetCount(sets: readonly WorkSet[]): number {
    return sets.reduce((total, set) => total + (isWarmUpRpe(set.rpe) ? 0 : 1), 0);
}

/**
 * Whether logging a set at this RPE is the one that *meets* an entry's target.
 *
 * Three ways to be false, and each is a case the logging screen would otherwise
 * get wrong:
 *
 * - **No target.** An exercise added mid-session has nothing to meet.
 * - **Already met.** The deliberate fourth set against a three-set plan. The
 *   plan is not a contract, and a set that took the count past the target has
 *   not just crossed it.
 * - **Not there yet**, warm-ups included: a warm-up adds nothing to the count,
 *   so it can never be the set that completes one.
 *
 * `sets` is the entry as it stands *before* the set being logged.
 */
export function completesTarget(
    sets: readonly WorkSet[],
    target: number | undefined,
    rpe: number | null,
): boolean {
    if (target === undefined) return false;

    const before = workingSetCount(sets);

    if (before >= target) return false;

    return before + (isWarmUpRpe(rpe) ? 0 : 1) >= target;
}

/** The label for a day, falling back the way the prototype does. */
export function dayLabel(mesocycle: Mesocycle | null, dayIndex: number): string {
    return mesocycle?.days[dayIndex]?.label ?? `Day ${dayIndex + 1}`;
}

/**
 * What a rest week asks you to leave behind: most of the set, but not all of it.
 *
 * Four rather than the eight this started as, because the scale the target is
 * read off has a floor. RPE runs from 5, and everything at 5.5 or below is a
 * warm-up — a set the app deliberately does not count toward what the day asks
 * for. A tank of eight is RPE 2, which the slider cannot reach, so it clamped
 * to the bottom of the scale and every set of a rest week was logged as a
 * warm-up: the sets never counted and no day ever filled.
 *
 * Four is the deepest tank with a working rating of its own — RPE 6, "easy, 4+
 * left" — and it is what a deload is supposed to be anyway. Easy, not absent:
 * the week still has to be training, or there is nothing for the half sets to
 * be half of.
 */
const REST_TANK = 4;

/**
 * The ramp, read backwards from the end of the block: what to leave in the tank
 * with this many *training* weeks still to come after the current one.
 *
 * Written as the shape rather than as arithmetic because the shape is the whole
 * decision, and the doubled 2 is the part arithmetic would hide — the second
 * week of the ramp repeats, so a block spends two weeks working at two in
 * reserve before it starts closing on failure. Past the end of the list the
 * last value holds, which is what a long block wants: more weeks at the top,
 * not a higher top.
 */
const TANK_RAMP = [0, 1, 2, 2, 3];

/** What the ramp opens on, and holds at for any week earlier than it covers. */
const OPENING_TANK = 3;

/**
 * The deload: the last week of a block is a rest week rather than a training
 * week.
 *
 * Being last is the whole rule, and it has to be — the plan hangs off the day
 * rather than off a cell, so there is nowhere to write "week 6 is easier" even
 * if you wanted to. Deriving it from the position means every block gets one,
 * including the ones planned before this existed.
 */
export function isRestWeek(week: number, weeks: number): boolean {
    return week >= weeks;
}

/**
 * Reps left in the tank — what a week prescribes now that a day no longer
 * prescribes reps.
 *
 * A rep target is a number you either hit or quietly fudge, and it is the
 * wrong thing to fix in advance: the same bar is a different set on a
 * different day. What a block actually decides is how close to failure to
 * train, so the target is how many reps you should be able to leave behind —
 * and where you stop is then read off the bar rather than off a plan written
 * weeks ago.
 *
 * Counted back from the last *training* week rather than forwards from the
 * first, so the hard end of the block is fixed and it is the easy end that
 * gives when a block is shorter: six weeks run 3 · 2 · 2 · 1 · 0 · rest, and
 * four weeks are the last of those — 2 · 1 · 0 · rest — rather than the same
 * five weeks squeezed. See `TANK_RAMP` for the shape.
 */
export function repsInTank(week: number, weeks: number): number {
    if (isRestWeek(week, weeks)) return REST_TANK;

    // `weeks - 1` is the last training week, so this is training weeks left
    // after this one. Clamped below for a week outside the block, which the
    // week arrows cannot reach but a stale session can carry.
    const remaining = Math.max(0, weeks - 1 - week);

    return TANK_RAMP[Math.min(remaining, TANK_RAMP.length - 1)] ?? OPENING_TANK;
}

/**
 * How many sessions the rest week keeps, and the cadence it changes at.
 *
 * The other half of the deload, and the one that gives a rest week any rest in
 * it: turning up six times to do half a workout is six trips to the gym, which
 * is the part of a training week that fatigue is actually made of. So the week
 * collapses to one session, or two once the block runs four days or more —
 * enough to keep both halves of an upper/lower or push/pull split moving
 * through the week instead of leaving one of them a fortnight cold.
 *
 * Kept as the first days of the plan rather than a spread, because a day *is*
 * its position here: D1 and D2 are the two sessions the block was built around,
 * and the ones whose numbers the next block will be read against.
 */
const REST_DAYS_FEW = 1;
const REST_DAYS_MANY = 2;
const REST_TWO_SESSION_CADENCE = 4;

/**
 * How many of the block's days a given week actually runs.
 *
 * A training week runs all of them. The rest week runs one or two — see the
 * constants above. Derived from the block's shape for the same reason the tank
 * is: there is nowhere to write "week 6 is shorter", and deriving it means
 * every block gets the deload, including ones planned before it existed.
 */
export function daysForWeek(days: number, week: number, weeks: number): number {
    if (!isRestWeek(week, weeks)) return days;

    const kept = days >= REST_TWO_SESSION_CADENCE ? REST_DAYS_MANY : REST_DAYS_FEW;

    // Clamped, so a block with fewer days than the rest week would keep asks
    // for what it has rather than for a day that does not exist.
    return Math.min(days, kept);
}

/** What share of a day's planned sets the rest week keeps. */
const REST_SET_SHARE = 0.5;

/**
 * How many sets of a planned exercise a given week actually asks for.
 *
 * Every week runs the same exercises — the plan hangs off the day, and a
 * deload that swapped the movements would stop being the same block, which is
 * the only thing making the week before it and the week after it comparable.
 * What the rest week takes off is the volume: half the sets, rounded up so a
 * single-set exercise survives it rather than disappearing.
 *
 * A training week gets what the plan says, untouched. The reduction is not
 * written into the plan for the same reason the tank target is not: it is a
 * fact about where the week sits, and storing it would be a second copy of
 * something the block already knows.
 */
export function setsForWeek(planned: number, week: number, weeks: number): number {
    if (!isRestWeek(week, weeks)) return planned;

    return Math.max(1, Math.ceil(planned * REST_SET_SHARE));
}

/**
 * The planned exercise behind one entry of a session, or none. By position
 * first, because a seeded session's entries are the plan in order and
 * exercises are only appended. The name check keeps that position from being
 * trusted blindly; the name lookup behind it covers a planned exercise that
 * ended up out of order.
 *
 * A swapped entry is matched on what it was swapped in for: the leg press that
 * replaced a planned squat is the squat's slot, as far as the plan is concerned.
 */
export function plannedFor(
    plan: readonly PlannedExercise[],
    entries: readonly SessionEntry[],
    entryIndex: number,
): PlannedExercise | undefined {
    const entry = entries[entryIndex];

    if (!entry) return undefined;

    const name = originalOf(entry);
    const positional = plan[entryIndex];

    if (positional && positional.exerciseName === name) return positional;

    return plan.find((planned) => planned.exerciseName === name);
}

/** The exercise an entry stands for: the one it was swapped in for, or itself. */
export function originalOf(entry: SessionEntry): string {
    return entry.swappedFrom ?? entry.exerciseName;
}

/**
 * Whether an entry was swapped away from after it was lifted — some later entry
 * was swapped in for the same original. Its sets stay as the record of what was
 * done on it, but it owes nothing more: the substitute after it carries what
 * the plan still asks for. An entry replaced before it was lifted is not here
 * at all; the substitute took its slot.
 */
export function swappedAway(entries: readonly SessionEntry[], entryIndex: number): boolean {
    const entry = entries[entryIndex];

    if (!entry) return false;

    const original = originalOf(entry);

    return entries.some((later, index) => index > entryIndex && later.swappedFrom === original);
}

/**
 * The entries with one exercise swapped for another — the same rule the API
 * applies in `GymSession.WithSwap`, done locally so the swap shows on the tap.
 *
 * Nothing logged on the exercise: it is replaced where it stands. Sets logged on
 * it: they stay exactly where they were lifted, and the substitute goes in
 * straight after. `withSets` says the sets were lifted on `to` all along — the
 * correction a finished workout makes — so it is replaced where it stands and
 * its sets go with it. `swappedFrom` always names the original, so a second
 * swap still points at the plan; putting the original back in place clears it.
 */
export function swapped(
    entries: readonly SessionEntry[],
    entryIndex: number,
    to: string,
    withSets = false,
): { entries: SessionEntry[]; at: number; replaced: boolean } {
    const next = [...entries];
    const current = entries[entryIndex];

    if (!current) return { entries: next, at: entryIndex, replaced: false };

    const original = originalOf(current);

    if (current.sets.length === 0 || withSets) {
        next[entryIndex] = original === to
            ? { exerciseName: to, sets: current.sets }
            : { exerciseName: to, swappedFrom: original, sets: current.sets };

        return { entries: next, at: entryIndex, replaced: true };
    }

    next.splice(entryIndex + 1, 0, { exerciseName: to, swappedFrom: original, sets: [] });

    return { entries: next, at: entryIndex + 1, replaced: false };
}

/**
 * How many sets each entry of a session owes this week, or `undefined` for one
 * the plan has nothing to say about.
 *
 * The plan's count, halved in the rest week — and, across a swap, shared rather
 * than repeated. Four planned sets of squat, two of them done before the rack
 * was taken, is two sets of leg press: the substitute owes what the original
 * had left, counted in working sets like everything else here. The original
 * itself, once swapped away from, owes nothing (`undefined`), and its sets stay
 * as the record of what was lifted on it.
 *
 * A substitute with nothing left to owe — swapped in after the target was
 * already met — has no target either, the same as any exercise added on top of
 * the plan.
 */
export function targetsFor(
    plan: readonly PlannedExercise[],
    entries: readonly SessionEntry[],
    week: number,
    weeks: number,
): (number | undefined)[] {
    return entries.map((entry, index) => {
        if (swappedAway(entries, index)) return undefined;

        const planned = plannedFor(plan, entries, index);

        if (!planned) return undefined;

        const asked = setsForWeek(planned.sets, week, weeks);

        if (entry.swappedFrom === undefined) return asked;

        const done = entries
            .slice(0, index)
            .filter((earlier) => originalOf(earlier) === entry.swappedFrom)
            .reduce((total, earlier) => total + workingSetCount(earlier.sets), 0);
        const left = asked - done;

        return left > 0 ? left : undefined;
    });
}
