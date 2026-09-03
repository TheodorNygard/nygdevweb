import { useResource, type Resource } from './useResource';

import type { GymApi } from '../lib/api';
import type { MesocycleSummary } from '../lib/types';

export interface BlocksState extends Omit<Resource<MesocycleSummary[]>, 'data'> {
    blocks: MesocycleSummary[];
}

const EMPTY: MesocycleSummary[] = [];
const load = (api: GymApi) => api.mesocycles();

/**
 * Every block the user has planned — the Plan tab's list.
 *
 * Deliberately not part of `useBlock`: that one reloads after every submitted
 * session and every back-out of the logging screen, and this list is read by
 * one tab that none of those touch. An empty list is a first run, not a failure.
 */
export function useBlocks(api: GymApi | null): BlocksState {
    const { data, ...rest } = useResource(api, load, EMPTY);

    return { blocks: data, ...rest };
}
