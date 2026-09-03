import { useResource, type Resource } from './useResource';

import type { GymApi } from '../lib/api';
import type { CurrentBlock } from '../lib/types';

export interface BlockState extends Omit<Resource<CurrentBlock | null>, 'data'> {
    block: CurrentBlock | null;
}

const load = (api: GymApi) => api.currentBlock();

/**
 * The current mesocycle and its sessions — one call that serves Today, the
 * block map and History alike. `mesocycle: null` with no sessions is a first
 * run rather than a failure, and it reaches the screens as exactly that.
 */
export function useBlock(api: GymApi | null): BlockState {
    const { data, ...rest } = useResource<CurrentBlock | null>(api, load, null);

    return { block: data, ...rest };
}
