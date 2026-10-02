import { useState } from 'react';

import { Sheet } from './Sheet';
import { alternativesFor } from '../lib/library';
import type { ExerciseLibrary, LibraryExercise } from '../lib/types';

/**
 * The exercise being swapped out, when the picker is choosing a replacement
 * rather than something to add.
 */
export interface Swapping {
    exerciseName: string;

    /**
     * What the exercise was itself swapped in for, if it was. A custom name has
     * nothing in the library to suggest alternatives from, but the planned
     * exercise it replaced usually does.
     */
    swappedFrom?: string;

    /** One line on what the swap will do here — keep the sets, change the plan. */
    note: string;

    /**
     * Whether the sets logged on the exercise go with the swap, when that is
     * the user's to choose: mid-workout, on an exercise with sets, where a swap
     * can mean either thing — the equipment is taken and the rest goes on
     * something else, or the sets already logged were done on something else.
     * Absent where only one of those is possible.
     */
    carry?: {
        withSets: boolean;
        onChange: (withSets: boolean) => void;
    };
}

/** One suggested exercise, and the muscles it shares when that is why. */
interface Suggestion {
    exercise: LibraryExercise;
    shared: string[] | null;
}

interface ExercisePickerProps {
    library: ExerciseLibrary | null;
    busy: boolean;

    /** Set to choose a replacement for an exercise rather than add a new one. */
    swapping?: Swapping;

    onPick: (exerciseName: string) => void;
    onClose: () => void;
}

/**
 * The exercise picker, for adding an exercise or swapping one out. The search
 * box doubles as the way to add something the shipped library does not have: a
 * custom name posts inline with the entry and lives on the session document.
 *
 * Only the name is sent — the API stores no equipment on an entry, so the chip
 * beside a result filters the library rather than travelling with the pick.
 *
 * Swapping opens on **suggestions** rather than the alphabet, because the
 * person swapping is standing next to a machine somebody else is on: the
 * exercise's own variations first, then other exercises doing the same job,
 * then whatever else trains the same muscles, best match first and each with
 * the muscles it shares (see `alternativesFor`). The equipment chips filter
 * those too, which is the other half of the question — "what can I do with the
 * dumbbells that are free". Swapping to a variation is therefore two taps from
 * the logging screen: the swap button, then the variation. Moving the sets
 * already logged along with it — they were done on the variation all along —
 * is one more, on the choice above the note.
 */
export function ExercisePicker({ library, busy, swapping, onPick, onClose }: ExercisePickerProps) {
    const [query, setQuery] = useState('');
    const [equipment, setEquipment] = useState('All');

    const filters = ['All', ...(library?.equipment ?? [])];
    const needle = query.trim().toLowerCase();
    const fitsFilter = (exercise: LibraryExercise) => (
        equipment === 'All' || exercise.equipment === equipment
    );

    // Suggestions only until a search is typed: a query is somebody who knows
    // what they want, and the tiers would push it down the list.
    const alternatives = swapping && !needle
        ? alternativesFor(library, swapping.exerciseName, swapping.swappedFrom)
        : null;

    const plain = (list: LibraryExercise[]) => list
        .filter(fitsFilter)
        .map((exercise) => ({ exercise, shared: null }));

    const tiers: { label: string; items: Suggestion[] }[] = alternatives
        ? [
            { label: 'VARIATIONS', items: plain(alternatives.variations) },
            { label: 'SAME MOVEMENT', items: plain(alternatives.samePattern) },
            {
                label: 'SAME MUSCLES',
                items: alternatives.sameMuscles.filter((match) => fitsFilter(match.exercise)),
            },
            { label: 'SAME MUSCLE GROUP', items: plain(alternatives.sameGroup) },
        ].filter((tier) => tier.items.length > 0)
        : [];

    const suggested = new Set(tiers.flatMap((tier) => tier.items.map((item) => item.exercise.name)));

    const results = (library?.exercises ?? []).filter((exercise) => (
        fitsFilter(exercise)
        && exercise.name !== swapping?.exerciseName
        && !suggested.has(exercise.name)
        && (!needle || exercise.name.toLowerCase().includes(needle))
    ));

    // Offered once the query is long enough to be a name rather than a
    // half-typed search, and only when it is not already in the library.
    const showCustom = needle.length > 1
        && !(library?.exercises ?? []).some((exercise) => exercise.name.toLowerCase() === needle);

    const title = swapping ? `Swap ${swapping.exerciseName}` : 'Add exercise';
    const carry = swapping?.carry;

    function item(exercise: LibraryExercise, shared: string[] | null = null) {
        return (
            <button
                key={`${exercise.name}-${exercise.equipment}`}
                type="button"
                className="picker__item"
                disabled={busy}
                onClick={() => onPick(exercise.name)}
            >
                <span className="picker__item-body">
                    <span className="picker__item-name">{exercise.name}</span>
                    {/* Why it was suggested, for the one tier where that is not
                        obvious from the name: what it trains in common. */}
                    {shared ? (
                        <span className="picker__item-muscles">{shared.join(' · ')}</span>
                    ) : null}
                </span>
                <span className="picker__item-eq">{exercise.equipment}</span>
            </button>
        );
    }

    return (
        <Sheet label={title} onClose={onClose} tall>
            <div className="picker__head">
                <div className="picker__bar">
                    <span className="picker__title">{title}</span>
                    <button type="button" className="picker__done" onClick={onClose}>
                        {swapping ? 'Cancel' : 'Done'}
                    </button>
                </div>
                {/* Before the suggestions rather than after a pick: the choice
                    is about the sets, not the exercise, and asking after the
                    tap would make the common swap cost one more. */}
                {carry ? (
                    <div className="picker__carry" role="group" aria-label="The sets logged on it">
                        {[false, true].map((withSets) => (
                            <button
                                key={String(withSets)}
                                type="button"
                                className={withSets === carry.withSets
                                    ? 'picker__carry-option picker__carry-option--on'
                                    : 'picker__carry-option'}
                                aria-pressed={withSets === carry.withSets}
                                onClick={() => carry.onChange(withSets)}
                            >
                                {withSets ? 'Move sets too' : 'Keep sets here'}
                            </button>
                        ))}
                    </div>
                ) : null}
                {swapping ? <p className="picker__note">{swapping.note}</p> : null}
                <input
                    className="picker__search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={swapping ? 'Search, or type any exercise' : 'Search or type a new exercise'}
                    aria-label="Search exercises"
                    autoComplete="off"
                    enterKeyHint="done"
                />
                <div className="chips">
                    {filters.map((filter) => (
                        <button
                            key={filter}
                            type="button"
                            className={filter === equipment ? 'chip chip--on' : 'chip'}
                            onClick={() => setEquipment(filter)}
                            aria-pressed={filter === equipment}
                        >
                            {filter}
                        </button>
                    ))}
                </div>
            </div>

            <div className="picker__list">
                {showCustom ? (
                    <button
                        type="button"
                        className="picker__custom"
                        disabled={busy}
                        onClick={() => onPick(query.trim())}
                    >
                        + {swapping ? 'Swap to' : 'Add'} “{query.trim()}” as a custom exercise
                    </button>
                ) : null}

                {tiers.map((tier) => (
                    <section key={tier.label} aria-label={tier.label.toLowerCase()}>
                        <span className="picker__section">{tier.label}</span>
                        {tier.items.map((suggestion) => item(suggestion.exercise, suggestion.shared))}
                    </section>
                ))}

                {tiers.length > 0 && results.length > 0 ? (
                    <span className="picker__section">EVERYTHING ELSE</span>
                ) : null}

                {results.map((exercise) => item(exercise))}

                {results.length === 0 && tiers.length === 0 && !showCustom ? (
                    <p className="picker__empty">
                        Nothing in the library matches. Type a name to add it as a custom exercise.
                    </p>
                ) : null}
            </div>
        </Sheet>
    );
}
