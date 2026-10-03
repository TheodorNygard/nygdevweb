import { useRef, useState } from 'react';

import { NO_GROUP, type Exercise } from '../lib/groups';
import { useDialog, type ExerciseLibrary, type FavoritesState } from '../lib/gym';

/** How many recently used exercises the picker shows above the list. */
const RECENT_SHOWN = 8;

interface ExercisePickerProps {
    /** The day being planned, for the eyebrow. */
    dayLabel: string;
    library: ExerciseLibrary | null;
    catalogue: Exercise[];

    /** The starred and recently used exercises, shown first and starred in place. */
    favorites: FavoritesState;

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
 *
 * It opens on your own picks, as the phone's does: starred exercises, then what
 * the last few workouts lifted, then everything else. A search has no sections,
 * so the starred matches go first instead. Every row has a star.
 */
export function ExercisePicker({
    dayLabel,
    library,
    catalogue,
    favorites,
    onPick,
    onClose,
}: ExercisePickerProps) {
    const [query, setQuery] = useState('');
    const [equipment, setEquipment] = useState('All');

    const searchRef = useRef<HTMLInputElement>(null);

    // Opened by a click on "+ Add exercise", and the next thing anybody does is
    // type, so focus opens in the search field rather than on the panel. Escape
    // closes it — the scrim behind handles the mouse; this is the half a
    // pointer-only close would leave out — and Tab stays inside until it
    // closes, when focus goes back to the button that opened it. `useDialog`.
    const root = useDialog<HTMLDivElement>(onClose, searchRef);

    const filters = ['All', ...(library?.equipment ?? [])];
    const trimmed = query.trim();
    const needle = trimmed.toLowerCase();

    const fits = (exercise: Exercise) => equipment === 'All' || exercise.equipment === equipment;

    // A starred or recent name the catalogue does not hold — typed on the
    // phone in a block this site has not been told about — still shows, the
    // way a typed name does everywhere else here.
    const byName = new Map(catalogue.map((exercise) => [exercise.name, exercise]));
    const entryFor = (name: string): Exercise => (
        byName.get(name) ?? { name, equipment: 'Custom', group: NO_GROUP, kind: 'typed' }
    );

    const sections = needle
        ? []
        : [
            { label: 'FAVORITES', items: favorites.favorites.map(entryFor).filter(fits) },
            {
                label: 'RECENT',
                items: favorites.recent
                    .filter((name) => !favorites.isFavorite(name))
                    .map(entryFor)
                    .filter(fits)
                    .slice(0, RECENT_SHOWN),
            },
        ].filter((section) => section.items.length > 0);

    const shown = new Set(sections.flatMap((section) => section.items.map((exercise) => exercise.name)));

    const results = catalogue.filter((exercise) => (
        fits(exercise)
        && !shown.has(exercise.name)
        && (!needle || exercise.name.toLowerCase().includes(needle))
    ));

    // Stable, so the catalogue's own order holds within each half.
    if (needle) {
        results.sort((a, b) => Number(favorites.isFavorite(b.name)) - Number(favorites.isFavorite(a.name)));
    }

    // Top to bottom, as drawn — what Enter picks the first of.
    const visible = [...sections.flatMap((section) => section.items), ...results];

    // Offered once the query is long enough to be a name rather than a
    // half-typed search, and only when it is not already in the catalogue.
    const showCustom = needle.length > 1
        && !catalogue.some((exercise) => exercise.name.toLowerCase() === needle);

    function row(exercise: Exercise, index: number) {
        const starred = favorites.isFavorite(exercise.name);

        return (
            <div
                key={`${exercise.name}:${exercise.equipment}`}
                className={index % 2 === 0 ? 'pick-row' : 'pick-row pick-row--alt'}
            >
                <button type="button" className="pick" onClick={() => onPick(exercise.name)}>
                    <span style={{ minWidth: 0 }}>
                        <span className="pick__name">{exercise.name}</span>
                        <span className="pick__group">{exercise.group}</span>
                    </span>
                    <span className="pick__eq">{exercise.equipment}</span>
                </button>
                {/* Beside the pick, not inside it: a star is not a pick, and a
                    button inside a button is not valid HTML. */}
                <button
                    type="button"
                    className={starred ? 'pick__star pick__star--on' : 'pick__star'}
                    aria-pressed={starred}
                    aria-label={`Favourite ${exercise.name}`}
                    onClick={() => favorites.toggle(exercise.name)}
                >
                    {starred ? '★' : '☆'}
                </button>
            </div>
        );
    }

    return (
        <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Add exercise"
            ref={root}
        >
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
                        onKeyDown={(event) => {
                            if (event.key !== 'Enter') return;

                            event.preventDefault();

                            // Whatever is at the top of the list: the custom
                            // name when it is offered — which is only when
                            // nothing in the catalogue is an exact match —
                            // and the first result otherwise. Type, Enter, and
                            // the next exercise is one more search away.
                            const first = visible[0];

                            if (showCustom) onPick(trimmed);
                            else if (first) onPick(first.name);
                        }}
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

                    {favorites.error ? (
                        <p className="exform__problem">{`The star did not save: ${favorites.error}`}</p>
                    ) : null}

                    {sections.map((section) => (
                        <div key={section.label}>
                            <div className="modal__section">{section.label}</div>
                            {section.items.map(row)}
                        </div>
                    ))}

                    {sections.length > 0 && results.length > 0 ? (
                        <div className="modal__section">ALL EXERCISES</div>
                    ) : null}

                    {results.map(row)}

                    {visible.length === 0 && !showCustom ? (
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
