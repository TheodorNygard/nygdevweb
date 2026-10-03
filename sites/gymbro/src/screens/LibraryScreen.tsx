import { useState } from 'react';

import { ExerciseForm } from '../components/ExerciseForm';
import { catalogue } from '../lib/groups';
import {
    type CustomExercise,
    type CustomExercisesState,
    type ExerciseLibrary,
    type FavoritesState,
    type MesocycleSummary,
} from '../lib/gym';

interface LibraryScreenProps {
    /** The shipped library with the user's own merged in — see `withCustom`. */
    library: ExerciseLibrary | null;
    block: MesocycleSummary | null;

    /** Every exercise name any block plans, for the typed names worth describing. */
    knownNames: readonly string[];

    custom: CustomExercisesState;

    /** The starred exercises — curated here, shown first in both pickers. */
    favorites: FavoritesState;
}

/** What the form is open for, if anything. */
type Editing =
    | { mode: 'new' }
    | { mode: 'edit'; exercise: CustomExercise }
    | { mode: 'describe'; name: string };

/**
 * Every exercise the planner can reach, how much of the selected block each one
 * accounts for — and the exercises of your own, described here.
 *
 * Three kinds of row. The shipped library is a static blob on the CDN,
 * identical for every account, so those are read-only. An exercise of your own
 * is a record on your account (`/gym/exercises`): created here, with the
 * equipment, group and muscles a typed name could never carry, and merged into
 * the library so the builder's tally and the phone's swap sheet treat it like a
 * shipped one. And a name some plan uses that nothing describes yet — typed into
 * a picker, here or mid-session on the phone — is offered to describe, which
 * gives every session already logged under it the description too, since
 * sessions hold the name.
 *
 * It is also where the favourites are curated. Both pickers open on them, and
 * this is the one screen with every exercise in a table, a filter for the
 * starred ones, and a way to star a whole block's plan at once — which is most
 * of a useful list in one click, since the plan is what is trained.
 *
 * The IN BLOCK column is why this is a view rather than a reference page. It
 * answers the question a plan raises — where did all these sets go — against
 * the block in the sidebar, from data already in hand.
 */
export function LibraryScreen({ library, block, knownNames, custom, favorites }: LibraryScreenProps) {
    const [query, setQuery] = useState('');
    const [equipment, setEquipment] = useState('All');
    const [starredOnly, setStarredOnly] = useState(false);
    const [editing, setEditing] = useState<Editing | null>(null);

    // The exercise whose delete has had its first click.
    const [arming, setArming] = useState<string | null>(null);

    const inBlock = new Map<string, number>();

    for (const day of block?.days ?? []) {
        for (const planned of day.plan) {
            inBlock.set(
                planned.exerciseName,
                (inBlock.get(planned.exerciseName) ?? 0) + planned.sets,
            );
        }
    }

    const yours = new Set(custom.exercises.map((exercise) => exercise.name));
    const rows = catalogue(library, knownNames, yours);
    const filters = ['All', ...(library?.equipment ?? [])];
    const needle = query.trim().toLowerCase();

    const shown = rows.filter((exercise) => (
        (equipment === 'All' || exercise.equipment === equipment)
        && (!starredOnly || favorites.isFavorite(exercise.name))
        && (!needle || exercise.name.toLowerCase().includes(needle))
    ));

    // What the selected block plans that is not starred yet, for the button
    // that stars it in one go.
    const unstarredInBlock = [...inBlock.keys()].filter((name) => !favorites.isFavorite(name));

    /**
     * Why a new name cannot be used. Compared ignoring case, as the API
     * compares it: two spellings of one name would be one exercise's history
     * split between two descriptions.
     */
    function refuse(name: string): string | null {
        const lower = name.toLowerCase();
        const own = custom.exercises.find((exercise) => exercise.name.toLowerCase() === lower);

        if (own) return `You already have “${own.name}” — edit that one instead.`;

        const shipped = library?.exercises.find((exercise) => exercise.name.toLowerCase() === lower);

        if (shipped) {
            return `“${shipped.name}” is in the built-in library already, and every account `
                + 'shares that description.';
        }

        return null;
    }

    function openForm(next: Editing) {
        setArming(null);
        setEditing(next);
    }

    const recordOf = (name: string) => custom.exercises.find((exercise) => exercise.name === name);

    return (
        <div className="view library">
            <section className="panel">
                <div className="panel__head">
                    <span className="panel__label">YOUR EXERCISES</span>
                    {editing === null ? (
                        <button
                            type="button"
                            className="ghost"
                            onClick={() => openForm({ mode: 'new' })}
                            disabled={custom.loading && custom.exercises.length === 0}
                        >
                            + New exercise
                        </button>
                    ) : null}
                </div>
                <p className="panel__note panel__note--wide">
                    {custom.exercises.length === 0
                        ? 'Anything the built-in library does not have. Give it a muscle group and '
                            + 'it counts toward the builder’s sets per group; give it muscles and the '
                            + 'phone suggests it when you need to swap. A name you have only typed '
                            + 'into a picker shows below as CUSTOM, with Describe beside it.'
                        : `${custom.exercises.length} of your own, merged into the library on both `
                            + 'sites. Names are fixed once made — sessions hold them.'}
                </p>
                {editing === null && custom.error ? (
                    <p className="exform__problem">{custom.error}</p>
                ) : null}
            </section>

            {editing !== null ? (
                <ExerciseForm
                    key={editing.mode === 'edit'
                        ? editing.exercise.id
                        : editing.mode === 'describe' ? `describe:${editing.name}` : 'new'}
                    initial={editing.mode === 'edit'
                        ? editing.exercise
                        : { name: editing.mode === 'describe' ? editing.name : '' }}
                    nameFixed={editing.mode !== 'new'}
                    editing={editing.mode === 'edit'}
                    library={library}
                    refuse={refuse}
                    busy={custom.busy}
                    error={custom.error}
                    onSubmit={(input) => (
                        editing.mode === 'edit'
                            ? custom.replace(editing.exercise.id, input)
                            : custom.create(input)
                    )}
                    onCancel={() => setEditing(null)}
                />
            ) : null}

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
                    <button
                        type="button"
                        className={starredOnly ? 'chip chip--on' : 'chip'}
                        aria-pressed={starredOnly}
                        onClick={() => setStarredOnly(!starredOnly)}
                    >
                        {`★ Favorites · ${favorites.favorites.length}`}
                    </button>
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

            <div className="library__starbar">
                <button
                    type="button"
                    className="ghost"
                    disabled={unstarredInBlock.length === 0}
                    onClick={() => favorites.addAll(unstarredInBlock)}
                >
                    {unstarredInBlock.length === 0
                        ? 'Everything this block plans is starred'
                        : `Star the ${unstarredInBlock.length} this block plans`}
                </button>
                {favorites.error ? (
                    <span className="exform__problem">{`The star did not save: ${favorites.error}`}</span>
                ) : null}
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
                    const record = exercise.kind === 'yours' ? recordOf(exercise.name) : undefined;
                    const starred = favorites.isFavorite(exercise.name);

                    return (
                        <div key={`${exercise.name}:${exercise.equipment}`} className="table">
                            <span className="table__name">
                                <button
                                    type="button"
                                    className={starred ? 'pick__star pick__star--on' : 'pick__star'}
                                    aria-pressed={starred}
                                    aria-label={`Favourite ${exercise.name}`}
                                    onClick={() => favorites.toggle(exercise.name)}
                                >
                                    {starred ? '★' : '☆'}
                                </button>
                                <span className="table__label">{exercise.name}</span>
                                {exercise.kind === 'yours' ? <span className="pill">YOURS</span> : null}
                                {exercise.kind === 'typed' ? (
                                    <span className="pill pill--muted">CUSTOM</span>
                                ) : null}

                                {exercise.kind === 'typed' ? (
                                    <button
                                        type="button"
                                        className="table__act"
                                        disabled={custom.busy}
                                        onClick={() => openForm({ mode: 'describe', name: exercise.name })}
                                    >
                                        Describe
                                    </button>
                                ) : null}

                                {record ? (
                                    <>
                                        <button
                                            type="button"
                                            className="table__act"
                                            disabled={custom.busy}
                                            onClick={() => openForm({ mode: 'edit', exercise: record })}
                                        >
                                            Edit
                                        </button>
                                        {/* Two clicks, the second on a button that says
                                            what it does. Nothing cascades — plans and
                                            sessions keep the name — but the description
                                            is gone, and with it the group it counted
                                            toward. */}
                                        {arming === record.id ? (
                                            <button
                                                type="button"
                                                className="table__act table__act--danger"
                                                disabled={custom.busy}
                                                onClick={() => {
                                                    setArming(null);
                                                    void custom.remove(record.id);
                                                }}
                                            >
                                                Delete description?
                                            </button>
                                        ) : (
                                            <button
                                                type="button"
                                                className="table__act"
                                                disabled={custom.busy}
                                                onClick={() => setArming(record.id)}
                                            >
                                                Delete
                                            </button>
                                        )}
                                    </>
                                ) : null}
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
                    Nothing matches. Add it as an exercise of your own above, or type the name
                    into a picker — here or on the phone — and describe it later.
                </p>
            ) : null}

            <p className="panel__note panel__note--wide">
                The built-in half ships with the app and is the same for every account, so it
                stays a static file rather than a route. Your own are records on your account,
                described in the library&rsquo;s terms and merged into it on both sites. Plans
                and sessions still hold exercises by name, so deleting a description leaves every
                workout that used the name exactly as it was.
            </p>
        </div>
    );
}
