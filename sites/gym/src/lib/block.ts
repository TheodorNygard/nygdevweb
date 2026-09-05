import { isWarmUpRpe } from './format';
import type { CurrentBlock, Mesocycle, SessionSummary, WorkSet } from './types';

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
        if (session.dayIndex >= mesocycle.days.length) continue;

        cells.add(`${session.week}:${session.dayIndex}`);
    }

    const totalCount = mesocycle.weeks * mesocycle.days.length;

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

/** What a rest week asks you to leave behind: effectively everything. */
const REST_TANK = 8;

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
