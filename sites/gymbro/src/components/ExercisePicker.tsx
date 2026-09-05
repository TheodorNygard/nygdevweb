import { useEffect, useRef, useState } from 'react';

import { type Exercise } from '../lib/groups';
import { type ExerciseLibrary } from '../lib/gym';

interface ExercisePickerProps {
    /** The day being planned, for the eyebrow. */
    dayLabel: string;
    library: ExerciseLibrary | null;
    catalogue: Exercise[];
    onPick: (exerciseName: string) => void;
    onClose: () => void;
}

/**
 * The exercise picker, as the phone's is: a search box that doubles as the way
 * to add a name the library does not have.
 *
 * Only the name reaches the plan. The API stores no equipment and no group on a
 * planned exercise, so the chips filter what is shown rather than travelling
 * with the pick — which is also why a typed name is a complete answer here and
 * not a half-filled form.
 *
 * A modal rather than the phone's bottom sheet: this opens beside the day it is
 * adding to, and a sheet climbing up over a four-column layout would cover the
 * three days you are balancing it against.
 */
export function ExercisePicker({
    dayLabel,
    library,
    catalogue,
    onPick,
    onClose,
}: ExercisePickerProps) {
    const [query, setQuery] = useState('');
    const [equipment, setEquipment] = useState('All');

    const searchRef = useRef<HTMLInputElement>(null);

    // Opened by a click on "+ Add exercise", and the next thing anybody does is
    // type. On a keyboard that is worth doing for them.
    useEffect(() => { searchRef.current?.focus(); }, []);

    // Escape closes it. The scrim behind handles the mouse; this is the half a
    // pointer-only close would leave out.
    useEffect(() => {
        function onKey(event: KeyboardEvent) {
            if (event.key === 'Escape') onClose();
        }

        window.addEventListener('keydown', onKey);

        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    const filters = ['All', ...(library?.equipment ?? [])];
    const trimmed = query.trim();
    const needle = trimmed.toLowerCase();

    const results = catalogue.filter((exercise) => (
        (equipment === 'All' || exercise.equipment === equipment)
        && (!needle || exercise.name.toLowerCase().includes(needle))
    ));

    // Offered once the query is long enough to be a name rather than a
    // half-typed search, and only when it is not already in the catalogue.
    const showCustom = needle.length > 1
        && !catalogue.some((exercise) => exercise.name.toLowerCase() === needle);

    return (
        <div className="modal" role="dialog" aria-modal="true" aria-label="Add exercise">
            <button
                type="button"
                className="modal__scrim"
                aria-label="Close"
                onClick={onClose}
            />
            <section className="modal__panel">
                <div className="modal__head">
                    <div className="modal__title-row">
                        <div>
                            <div className="modal__eyebrow">
                                {`PLAN · ${dayLabel.toUpperCase()}`}
                            </div>
                            <div className="modal__title">Add exercise</div>
                        </div>
                        <button type="button" className="modal__done" onClick={onClose}>
                            Done
                        </button>
                    </div>
                    <input
                        ref={searchRef}
                        className="modal__search"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Search or type a new exercise"
                        aria-label="Search exercises"
                        autoComplete="off"
                    />
                    <div className="modal__chips">
                        {filters.map((filter) => (
                            <button
                                key={filter}
                                type="button"
                                className={
                                    filter === equipment
                                        ? 'chip chip--small chip--on'
                                        : 'chip chip--small'
                                }
                                aria-pressed={filter === equipment}
                                onClick={() => setEquipment(filter)}
                            >
                                {filter}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="modal__body">
                    {showCustom ? (
                        <button
                            type="button"
                            className="pick--custom"
                            onClick={() => onPick(trimmed)}
                        >
                            {`+ Add “${trimmed}” as a custom exercise`}
                        </button>
                    ) : null}

                    {results.map((exercise, index) => (
                        <button
                            key={`${exercise.name}:${exercise.equipment}`}
                            type="button"
                            className={index % 2 === 0 ? 'pick' : 'pick pick--alt'}
                            onClick={() => onPick(exercise.name)}
                        >
                            <span style={{ minWidth: 0 }}>
                                <span className="pick__name">{exercise.name}</span>
                                <span className="pick__group">{exercise.group}</span>
                            </span>
                            <span className="pick__eq">{exercise.equipment}</span>
                        </button>
                    ))}

                    {results.length === 0 && !showCustom ? (
                        <p className="empty">
                            Nothing in the library matches. Type a name to add it as a custom
                            exercise.
                        </p>
                    ) : null}
                </div>
            </section>
        </div>
    );
}
