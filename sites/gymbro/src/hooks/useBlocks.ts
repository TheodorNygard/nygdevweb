import { useResource, type GymApi, type MesocycleSummary, type Resource } from '../lib/gym';

export interface BlocksState extends Omit<Resource<MesocycleSummary[]>, 'data'> {
    blocks: MesocycleSummary[];
}

const EMPTY: MesocycleSummary[] = [];
const load = (api: GymApi) => api.mesocycles();

/**
 * Every block this account has planned, newest first — and the whole of each
 * one: name, weeks, days and the plan hanging off every day.
 *
 * The only read this site opens on, and `GET /gym/mesocycles/current` is
 * deliberately not beside it. That call exists so the phone can ask one
 * question — what am I training, and what have I logged in it — and answer it
 * in a single round trip before a workout. A planner asks a different question:
 * it wants the list, it wants to edit any block in it rather than only the
 * current one, and `isCurrent` on a summary already says which one the phone
 * would open. Reading both would be the current block twice.
 */
export function useBlocks(api: GymApi | null): BlocksState {
    const { data, ...rest } = useResource(api, load, EMPTY);

    return { blocks: data, ...rest };
}
