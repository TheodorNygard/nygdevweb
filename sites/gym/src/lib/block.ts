import type { CurrentBlock, Mesocycle, SessionSummary } from './types';

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

/** The label for a day, falling back the way the prototype does. */
export function dayLabel(mesocycle: Mesocycle | null, dayIndex: number): string {
    return mesocycle?.days[dayIndex]?.label ?? `Day ${dayIndex + 1}`;
}

/** What a rest week asks you to leave behind: effectively everything. */
export const REST_TANK = 8;

/** The most a training week asks you to leave behind. */
const MAX_TANK = 3;

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
 * Counted back from the last *training* week, which is the one before the rest
 * week: nothing left in the tank there, one the week before, two before that.
 * Held at three earlier than that rather than counting up forever, because a
 * long block would otherwise open on a target indistinguishable from a warm-up.
 */
export function repsInTank(week: number, weeks: number): number {
    if (isRestWeek(week, weeks)) return REST_TANK;

    // `weeks - 1` is the last training week, so this is training weeks left
    // after this one. Clamped below for a week outside the block, which the
    // week arrows cannot reach but a stale session can carry.
    return Math.min(MAX_TANK, Math.max(0, weeks - 1 - week));
}
