import { useCallback, useEffect, useState } from 'react';

import { ApiError, messageOf, type GymApi } from '../lib/api';
import type { CustomExercise, CustomExerciseInput } from '../lib/types';

export interface CustomExercisesState {
    /** The user's own, by name. */
    exercises: CustomExercise[];

    loading: boolean;

    /** A write in flight — the form disables its buttons on it. */
    busy: boolean;

    /**
     * The API's own message, shown beside the form that caused it rather than
     * in the app-wide banner, for the reason templates keep theirs local: the
     * library still works without these, and nothing else depends on them.
     */
    error: string | null;

    /** Each resolves true when the write landed, so a form knows to clear. */
    create: (input: CustomExerciseInput) => Promise<boolean>;
    replace: (exerciseId: string, input: CustomExerciseInput) => Promise<boolean>;
    remove: (exerciseId: string) => Promise<boolean>;
}

const NONE: CustomExercise[] = [];

function byName(a: CustomExercise, b: CustomExercise): number {
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
}

/**
 * The exercises this user has described, and the writes that describe them.
 *
 * Read once per sign-in and held; writes update the list from what the API
 * answers rather than reading it again, as templates do. A null `api` means
 * there is nothing to read yet — not signed in, or not wanted yet — and the
 * list it already holds is kept, so a screen that comes back shows it at once.
 *
 * What the list is *for* is `withCustom` in `lib/library`, which puts these
 * into the library every screen already reads. A failed read leaves the
 * shipped library as it was, which is what both apps did before these existed.
 */
export function useCustomExercises(api: GymApi | null): CustomExercisesState {
    const [exercises, setExercises] = useState<CustomExercise[]>(NONE);
    const [loading, setLoading] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async (client: GymApi, isCancelled: () => boolean) => {
        setLoading(true);

        try {
            const loaded = await client.customExercises();

            if (isCancelled()) return;

            setExercises(loaded);
            setError(null);
        } catch (cause) {
            if (!isCancelled()) setError(messageOf(cause));
        } finally {
            if (!isCancelled()) setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!api) return;

        let cancelled = false;

        void load(api, () => cancelled);

        return () => { cancelled = true; };
    }, [api, load]);

    /**
     * One write, with the busy flag and the error around it. Nothing here is
     * optimistic: a description that failed to save should not sit in the
     * library looking saved, counting toward a tally.
     */
    const write = useCallback(async (action: (client: GymApi) => Promise<void>): Promise<boolean> => {
        if (!api) return false;

        setBusy(true);

        try {
            await action(api);
            setError(null);

            return true;
        } catch (cause) {
            // A name already described is, after a lost response, the create
            // that already landed. Either way the list is what is out of date,
            // so read it and let the screen show the one that exists.
            if (cause instanceof ApiError && cause.code === 'exercise_exists') {
                await load(api, () => false);
            }

            setError(messageOf(cause));

            return false;
        } finally {
            setBusy(false);
        }
    }, [api, load]);

    const create = useCallback((input: CustomExerciseInput) => write(async (client) => {
        const created = await client.createExercise(input);

        setExercises((current) => [...current, created].sort(byName));
    }), [write]);

    const replace = useCallback((exerciseId: string, input: CustomExerciseInput) => (
        write(async (client) => {
            const replaced = await client.replaceExercise(exerciseId, input);

            setExercises((current) => current.map((existing) => (
                existing.id === exerciseId ? replaced : existing
            )));
        })
    ), [write]);

    const remove = useCallback((exerciseId: string) => write(async (client) => {
        await client.deleteExercise(exerciseId);

        setExercises((current) => current.filter((existing) => existing.id !== exerciseId));
    }), [write]);

    return { exercises, loading, busy, error, create, replace, remove };
}
