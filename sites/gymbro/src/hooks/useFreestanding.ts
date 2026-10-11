import { useMemo } from 'react';

import { localDate, useResource, type DatedSession, type GymApi } from '../lib/gym';
import { FREE_RANGE_DAYS } from '../lib/freestanding';

export interface FreestandingState {
    /** Every freestanding workout in the range, sets and all, newest first. */
    sessions: DatedSession[];

    /** The range read, both local dates included. */
    from: string;
    to: string;

    loading: boolean;
    error: string | null;
}

const NONE: DatedSession[] = [];

/** The last year, the most the API answers in one read. */
function rangeOf(today: Date = new Date()): { from: string; to: string } {
    const from = new Date(today);

    from.setDate(today.getDate() - (FREE_RANGE_DAYS - 1));

    return { from: localDate(from), to: localDate(today) };
}

/** Module scope, as `useResource` requires. */
function loadYear(api: GymApi): Promise<DatedSession[]> {
    const { from, to } = rangeOf();

    return api.sessionsBetween(from, to, true);
}

/**
 * Workouts logged in no block, from the last year, with their sets.
 *
 * Read in one call, the same trade `useWorkouts` makes for a block: the API
 * walks every set to add the totals up regardless, so asking for the sets back
 * costs the bytes and not a read per session — and this view is the overview,
 * the chart and the coaching export at once, all three of which want them.
 *
 * The date-range route returns every session in the range, block or not; the
 * ones in a block are already in their block's views, so only the freestanding
 * ones are kept. Read only once something asks for them — `api` is null until
 * then, as the builder's templates are.
 */
export function useFreestanding(api: GymApi | null): FreestandingState {
    const resource = useResource(api, loadYear, NONE);
    const sessions = useMemo(
        () => resource.data.filter((session) => session.freestanding === true),
        [resource.data],
    );

    // Recomputed per render rather than held: it is two dates, and a tab left
    // open past midnight should say today's.
    const { from, to } = rangeOf();

    return {
        sessions,
        from,
        to,
        loading: api !== null && resource.loading,
        error: resource.error,
    };
}
