import { useState } from 'react';

import { catalogue } from '../lib/groups';
import { type ExerciseLibrary, type MesocycleSummary } from '../lib/gym';

interface LibraryScreenProps {
    library: ExerciseLibrary | null;
    block: MesocycleSummary | null;
}

/**
 * Every exercise the planner can reach, and how much of the selected block each
 * one accounts for.
 *
 * Read-only, and that is the honest shape rather than a missing feature. The
 * built-in half is a static blob on the CDN — identical for every account,
 * which is what lets it cost no token and no function call — so there is
 * nothing here anyone could edit. Exercises of your own would be somebody's,
 * and the API has no store for them: no `/gym/exercises` route exists, and the
 * one place a name of your own does live is inside the session or plan that
 * uses it. Typing one into the picker is therefore the whole feature, and this
 * table shows it the moment a block plans it.
 *
 * The IN BLOCK column is why this is a view rather than a reference page. It
 * answers the question a plan raises — where did all these sets go — against
 * the block in the sidebar, from data already in hand.
 */
export function LibraryScreen({ library, block }: LibraryScreenProps) {
    const [query, setQuery] = useState('');
    const [equipment, setEquipment] = useState('All');

    const inBlock = new Map<string, number>();

    for (const day of block?.days ?? []) {
        for (const planned of day.plan) {
            inBlock.set(
                planned.exerciseName,
                (inBlock.get(planned.exerciseName) ?? 0) + planned.sets,
            );
        }
    }

    const rows = catalogue(library, [...inBlock.keys()]);
    const filters = ['All', ...(library?.equipment ?? [])];
    const needle = query.trim().toLowerCase();

    const shown = rows.filter((exercise) => (
        (equipment === 'All' || exercise.equipment === equipment)
        && (!needle || exercise.name.toLowerCase().includes(needle))
    ));

    return (
        <div className="view library">
            <div className="library__controls">
                <input
                    className="library__search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search exercises"
                    aria-label="Search exercises"
                    autoComplete="off"
                />
                <div className="library__chips">
                    {filters.map((filter) => (
                        <button
                            key={filter}
                            type="button"
                            className={filter === equipment ? 'chip chip--on' : 'chip'}
                            aria-pressed={filter === equipment}
                            onClick={() => setEquipment(filter)}
                        >
                            {filter}
                        </button>
                    ))}
                </div>
            </div>

            <div className="table table--head" role="presentation">
                <span>EXERCISE</span>
                <span>EQUIPMENT</span>
                <span>GROUP</span>
                <span style={{ textAlign: 'right' }}>IN BLOCK</span>
            </div>

            <div className="rows rows--roomy">
                {shown.map((exercise) => {
                    const sets = inBlock.get(exercise.name) ?? 0;

                    return (
                        <div key={`${exercise.name}:${exercise.equipment}`} className="table">
                            <span className="table__name">
                                {exercise.name}
                                {exercise.equipment === 'Custom'
                                    ? <span className="pill">CUSTOM</span>
                                    : null}
                            </span>
                            <span className="table__mono">{exercise.equipment}</span>
                            <span className="table__mono">{exercise.group}</span>
                            <span className={sets ? 'table__use table__use--on' : 'table__use'}>
                                {sets ? `${sets} sets` : '—'}
                            </span>
                        </div>
                    );
                })}
            </div>

            {shown.length === 0 ? (
                <p className="empty" style={{ paddingLeft: 0, marginTop: 20 }}>
                    Nothing matches. A name the library does not have is one you type — into the
                    picker here, or on the phone mid-session — and it appears in this table as
                    soon as something uses it.
                </p>
            ) : null}

            <p className="panel__note panel__note--wide">
                The built-in half ships with the app and is the same for every account, so it
                stays a static file rather than a route. Exercises of your own cannot be: they
                would need a store the API does not have, the way saved day templates already
                have one. Muscle groups are this site&rsquo;s addition, held as a map against the
                shipped names — nothing on the wire carries them, so a name typed anywhere reads
                as no group rather than as a guess.
            </p>
        </div>
    );
}
