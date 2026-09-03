import type { CurrentBlock, Mesocycle, SessionSummary } from './types';

/**
 * The sessions filed against one cell of the block map, newest first.
 *
 * A cell holds more than one now. Sessions are keyed on the calendar date
 * rather than on `(meso, week, dayIndex)`, so tapping Start on a day that has
 * already been logged files a *second* session rather than overwriting the
 * first — the API relaxed that rule deliberately, because silently destroying
 * a logged workout because the wrong day was tapped is a worse failure than a
 * visible duplicate.
 *
 * The screens answer it the way the API's README suggests: the cell shows the
 * most recent session, and the day sheet lists the rest with a way to delete
 * one.
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
 * "12 of 20 workouts logged".
 *
 * Counted in cells rather than in sessions, because the denominator is cells:
 * a day logged twice is one cell of progress through the block, not two, and
 * counting sessions would let a block read 21 of 20.
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
 * Which week Today opens on: the one being trained, taken as the latest week
 * that has anything in it, or the first week of a block with nothing yet.
 *
 * Not derived from the calendar. Days are labelled, not scheduled — the whole
 * premise is that you log "Upper A" whenever you do it — so there is no date
 * arithmetic that could say which week it is, and guessing from the block's
 * start date would be wrong for anyone who missed a week.
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
