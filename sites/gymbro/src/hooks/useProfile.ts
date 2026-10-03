import { useCallback, useState } from 'react';

import { messageOf, type GymApi, type LifterProfile } from '../lib/gym';

export interface ProfileState {
    /** The profile as last confirmed — by the block read, or by a save. */
    profile: LifterProfile;

    /** A save in flight — the form disables its buttons on it. */
    busy: boolean;

    /** The API's own message, shown beside the form rather than in the banner. */
    error: string | null;

    /** Resolves true when the save landed, so the form knows to close. */
    save: (next: LifterProfile) => Promise<boolean>;
}

const EMPTY: LifterProfile = {};

/** The profile by content, so a reload handing over an equal object is not news. */
function keyOf(profile: LifterProfile): string {
    return JSON.stringify([profile.experience, profile.bodyweightKg, profile.goal, profile.injuries]);
}

/**
 * The lifter's profile, and the one write that changes it.
 *
 * It arrives on the block read the planner already makes — `GET /gym/mesocycles`
 * carries it beside the favourites — and is handed in as `server`. A save is
 * not optimistic: the form holds the draft until the API confirms it, and what
 * the export reads is only ever what the server last said, so a profile that
 * failed to save cannot end up in a document as though it had.
 *
 * A server read that lands after a save is adopted by content, the same rule
 * `useFavorites` applies: a reload hands over a new object with the same four
 * fields, and that is not a change.
 */
export function useProfile(api: GymApi | null, server: LifterProfile | undefined): ProfileState {
    const [profile, setProfile] = useState<LifterProfile>(server ?? EMPTY);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const serverKey = keyOf(server ?? EMPTY);
    const [adopted, setAdopted] = useState(serverKey);

    if (adopted !== serverKey) {
        setAdopted(serverKey);
        setProfile(server ?? EMPTY);
    }

    const save = useCallback(async (next: LifterProfile): Promise<boolean> => {
        if (!api) return false;

        setBusy(true);

        try {
            const stored = await api.setProfile(next);

            // What the API echoes is what is stored, with unknown fields left
            // off — the shape the export and the summary line read.
            setProfile(stored);
            setAdopted(keyOf(stored));
            setError(null);

            return true;
        } catch (cause) {
            setError(messageOf(cause));

            return false;
        } finally {
            setBusy(false);
        }
    }, [api]);

    return { profile, busy, error, save };
}
