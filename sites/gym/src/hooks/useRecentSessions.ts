import { useResource, type Resource } from './useResource';
import type { GymApi } from '../lib/api';
import { localDate } from '../lib/format';
import type { DatedSession } from '../lib/types';

/**
 * How far back "recent" reaches: about three months, which is a training log's
 * worth of scrolling on a phone and several sightings of every exercise anyone
 * does regularly — so the last-time lookup below finds almost everything.
 */
const RECENT_DAYS = 90;

const NONE: DatedSession[] = [];

/** Module scope, as `useResource` requires — see there. */
function loadRecent(api: GymApi): Promise<DatedSession[]> {
    const today = new Date();
    const from = new Date(today);

    from.setDate(today.getDate() - (RECENT_DAYS - 1));

    return api.sessionsBetween(localDate(from), localDate(today), true);
}

/**
 * Every workout of the last few months, block or not, newest first, with the
 * sets on.
 *
 * This is what a lifter who does not train in blocks sees: no block holds their
 * sessions, so `/mesocycles/current` has none to give, and the date range is the
 * only list that can find them. The sets come along because the logger needs
 * them for "last time" — a freestanding workout has no same-day-last-week to
 * read, so it searches these instead (see `useLastSets`) — and asking for them
 * costs the bytes and not a second read.
 */
export function useRecentSessions(api: GymApi | null): Resource<DatedSession[]> {
    return useResource(api, loadRecent, NONE);
}
