import { useState } from 'react';

import { Sheet } from './Sheet';
import type { ExerciseLibrary } from '../lib/types';

interface ExercisePickerProps {
    library: ExerciseLibrary | null;
    busy: boolean;
    onPick: (exerciseName: string) => void;
    onClose: () => void;
}

/**
 * The exercise picker. The search box doubles as the way to add something the
 * shipped library does not have: a custom name posts inline with the entry and
 * lives on the session document.
 *
 * Only the name is sent — the API stores no equipment on an entry, so the chip
 * beside a result filters the library rather than travelling with the pick.
 */
export function ExercisePicker({ library, busy, onPick, onClose }: ExercisePickerProps) {
    const [query, setQuery] = useState('');
    const [equipment, setEquipment] = useState('All');

    const filters = ['All', ...(library?.equipment ?? [])];
    const needle = query.trim().toLowerCase();

    const results = (library?.exercises ?? []).filter((exercise) => (
        (equipment === 'All' || exercise.equipment === equipment)
        && (!needle || exercise.name.toLowerCase().includes(needle))
    ));

    // Offered once the query is long enough to be a name rather than a
    // half-typed search, and only when it is not already in the library.
    const showCustom = needle.length > 1
        && !(library?.exercises ?? []).some((exercise) => exercise.name.toLowerCase() === needle);

    return (
        <Sheet label="Add exercise" onClose={onClose} tall>
            <div className="picker__head">
                <div className="picker__bar">
                    <span className="picker__title">Add exercise</span>
                    <button type="button" className="picker__done" onClick={onClose}>
                        Done
                    </button>
                </div>
                <input
                    className="picker__search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search or type a new exercise"
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
                        + Add “{query.trim()}” as a custom exercise
                    </button>
                ) : null}

                {results.map((exercise) => (
                    <button
                        key={`${exercise.name}-${exercise.equipment}`}
                        type="button"
                        className="picker__item"
                        disabled={busy}
                        onClick={() => onPick(exercise.name)}
                    >
                        <span className="picker__item-name">{exercise.name}</span>
                        <span className="picker__item-eq">{exercise.equipment}</span>
                    </button>
                ))}

                {results.length === 0 && !showCustom ? (
                    <p className="picker__empty">
                        Nothing in the library matches. Type a name to add it as a custom exercise.
                    </p>
                ) : null}
            </div>
        </Sheet>
    );
}
