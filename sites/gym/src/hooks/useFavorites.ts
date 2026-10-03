import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

import { messageOf, type GymApi } from '../lib/api';

export interface FavoritesState {
    /** Starred exercise names, in the order they were starred. */
    favorites: string[];

    /**
     * What the last few finished workouts lifted, most recent first. Written
     * by Submit on the server and only read here.
     */
    recent: string[];

    isFavorite: (name: string) => boolean;
    toggle: (name: string) => void;

    /** Stars every one of these that is not starred yet — "star this block's plan". */
    addAll: (names: readonly string[]) => void;

    /** Shown where the stars are; a failed star is not worth the app-wide banner. */
    error: string | null;
}

const NONE: string[] = [];

/**
 * The starred exercises, and the writes that change them.
 *
 * The lists arrive on a block read each app already makes — `/current` for the
 * logger, `/mesocycles` for the planner — and are handed in here as `server`.
 * A star changes on screen on the tap, because it is one tap mid-workout and a
 * round trip in front of it would make the star feel broken; what makes that
 * safe is that the request is the whole list, so it can be resent and the last
 * one sent is the one that sticks.
 *
 * Which is why the writes go out **one at a time, newest list last**. Tapping
 * three stars quickly sends the first list and then only the newest, never an
 * older list landing after a newer one and quietly undoing a star. A failure
 * puts the screen back on the last list the server confirmed and says so.
 *
 * A list that arrives from the server while a write is in flight is ignored:
 * it was read before the write landed, and adopting it would flicker the star
 * that was just tapped.
 */
export function useFavorites(
    api: GymApi | null,
    server: readonly string[] | undefined,
    recent: readonly string[] | undefined,
): FavoritesState {
    const [favorites, setFavorites] = useState<string[]>(() => [...(server ?? NONE)]);
    const [error, setError] = useState<string | null>(null);

    // What the server last said the list is — what a failure goes back to.
    const confirmed = useRef<string[]>([...(server ?? NONE)]);

    // A write in flight, and the newest list waiting behind it.
    const sending = useRef(false);
    const waiting = useRef<string[] | null>(null);

    // Adopt what the server read says, by content: a reload hands over a new
    // array with the same names in it, and that is not news.
    const serverKey = (server ?? NONE).join('\n');
    const [adopted, setAdopted] = useState(serverKey);

    if (adopted !== serverKey && !sending.current) {
        setAdopted(serverKey);
        setFavorites([...(server ?? NONE)]);
        confirmed.current = [...(server ?? NONE)];
    }

    const send = useCallback(async (list: string[]) => {
        if (!api) return;

        sending.current = true;

        let next: string[] | null = list;

        try {
            while (next) {
                const stored = await api.setFavorites(next);

                confirmed.current = stored;
                next = waiting.current;
                waiting.current = null;
            }

            setError(null);
        } catch (cause) {
            waiting.current = null;
            setFavorites(confirmed.current);
            setError(messageOf(cause));
        } finally {
            sending.current = false;
        }
    }, [api]);

    // The latest list, for the handlers below — they are called from rows that
    // would otherwise close over the render they were drawn in.
    const current = useRef(favorites);

    useEffect(() => { current.current = favorites; }, [favorites]);

    const write = useCallback((next: string[]) => {
        current.current = next;
        setFavorites(next);

        if (sending.current) {
            waiting.current = next;
        } else {
            void send(next);
        }
    }, [send]);

    const toggle = useCallback((name: string) => {
        const list = current.current;

        write(list.includes(name) ? list.filter((one) => one !== name) : [...list, name]);
    }, [write]);

    const addAll = useCallback((names: readonly string[]) => {
        const list = current.current;
        const added = [...new Set(names)].filter((name) => !list.includes(name));

        if (added.length > 0) write([...list, ...added]);
    }, [write]);

    const isFavorite = useCallback((name: string) => favorites.includes(name), [favorites]);

    return {
        favorites,
        recent: recent ? [...recent] : NONE,
        isFavorite,
        toggle,
        addAll,
        error,
    };
}

/**
 * The logger's stars, for its exercise picker.
 *
 * Context rather than a prop because the picker opens from four places — the
 * session's Add and its swap, and the day plan's add and swap — under three
 * screens that have no use for the list themselves, and the stars are the same
 * in all of them. Null outside a provider, which the picker reads as "no
 * favourites": gymbro has its own picker and passes its stars directly.
 */
export const FavoritesContext = createContext<FavoritesState | null>(null);

export function useFavoritesContext(): FavoritesState | null {
    return useContext(FavoritesContext);
}
