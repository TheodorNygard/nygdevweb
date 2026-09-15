import { useCallback, useMemo } from 'react';

import { useResource, type Resource } from './useResource';

import type { GymApi } from '../lib/api';
import { readBlock, writeBlock } from '../lib/cache';
import type { CurrentBlock } from '../lib/types';

export interface BlockState extends Omit<Resource<CurrentBlock | null>, 'data'> {
    block: CurrentBlock | null;

    /**
     * Whether `block` is the copy held from the last visit rather than one this
     * sign-in has read. True only until the first read lands, and never again
     * after it — a reload keeps showing what the server last answered with.
     *
     * Read by anything that derives a decision from the block's sessions and
     * would have to make it again once they are current. Today that is the week
     * Today opens on; see `App`.
     */
    fromCache: boolean;
}

/**
 * The current mesocycle and its sessions — one call that serves Today, the
 * block map and History alike. `mesocycle: null` with no sessions is a first
 * run rather than a failure, and it reaches the screens as exactly that.
 *
 * Answered from `localStorage` first and the API second. This is the first call
 * of every sign-in, so it is the one that waits for a worker to start on an app
 * that scales to zero, and a training block is not something that changes while
 * nobody is training. Drawing the held copy immediately takes that wait off the
 * screen rather than shortening it; the server's answer replaces it when it
 * arrives, and `fromCache` says which is showing.
 *
 * **A stale block cannot cause a bad write**, and that is the API's doing
 * rather than this hook's. `POST /gym/workouts` takes a date, a week and a day
 * index and no mesocycle id: the server reads whichever block is current and
 * checks the cell against its real shape, so a cell tapped off a stale map is
 * refused with a 409 rather than logged against the wrong block. The same guard
 * that makes Start safe to retry on bad wifi is what makes it safe to draw from
 * here.
 *
 * What a stale block can do is show a session count that is a minute old, for
 * the length of one round trip. That is the trade, and it is the right way
 * round for a logbook opened between sets.
 */
export function useBlock(api: GymApi | null, accountId: string | null): BlockState {
    // Held on the way past rather than by the caller, so there is no way to
    // read this route and leave the cache behind.
    const load = useCallback(async (client: GymApi) => {
        const block = await client.currentBlock();

        writeBlock(accountId, block);

        return block;
    }, [accountId]);

    const { data, ...rest } = useResource<CurrentBlock | null>(api, load, null);

    // Not `useResource`'s own `initial`, which is captured on the first render
    // — before MSAL has resolved an account, so before there is an account to
    // key the read on. Read here instead, when the id arrives.
    const cached = useMemo(() => readBlock(accountId), [accountId]);

    return {
        // A failed read leaves the held copy on screen rather than the empty
        // state, with the banner above it saying why. That is the honest answer
        // on a phone that has lost signal: this is what your block looked like,
        // and the app could not reach the server to check.
        block: data ?? cached,
        fromCache: data === null && cached !== null,
        ...rest,
    };
}
