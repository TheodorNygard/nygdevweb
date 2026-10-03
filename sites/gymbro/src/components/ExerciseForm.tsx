import { useId, useState } from 'react';

import { GROUPS, MUSCLES } from '../lib/groups';
import { type CustomExerciseInput, type ExerciseLibrary } from '../lib/gym';
import { MAX_EXERCISE_NAME, MAX_MUSCLES, MAX_TAG } from '../lib/limits';

interface ExerciseFormProps {
    /** What the form opens on: blank for a new one, the record for an edit. */
    initial: CustomExerciseInput;

    /**
     * Whether the name is settled. It is for an edit — sessions hold the name,
     * so it cannot change — and for describing a name a plan already uses,
     * where changing it would describe a different exercise from the one the
     * plan means.
     */
    nameFixed: boolean;
    editing: boolean;

    /** The merged library, for the equipment and family suggestions. */
    library: ExerciseLibrary | null;

    /** Why a name cannot be used, or null when it can. */
    refuse: (name: string) => string | null;

    busy: boolean;
    error: string | null;
    onSubmit: (input: CustomExerciseInput) => Promise<boolean>;
    onCancel: () => void;
}

/**
 * Describing an exercise of your own, in the shipped library's terms.
 *
 * Everything but the name is optional, as it is in the library — but the group
 * is the field this exists for. A name with no group counts toward nothing in
 * the builder's sets-per-group panel, which is the gap between a typed name and
 * a described one, and the form says so while it is empty.
 *
 * Group and muscles are choices rather than text: the tally and the logger's
 * swap sheet match them by spelling, so a typed "Delts" would be a description
 * that matched nothing. Equipment and the family are typed with suggestions,
 * because a kettlebell is a reasonable thing to own that the library has never
 * listed.
 */
export function ExerciseForm({
    initial,
    nameFixed,
    editing,
    library,
    refuse,
    busy,
    error,
    onSubmit,
    onCancel,
}: ExerciseFormProps) {
    const [name, setName] = useState(initial.name);
    const [equipment, setEquipment] = useState(initial.equipment ?? '');
    const [group, setGroup] = useState<string | null>(initial.group ?? null);
    const [muscles, setMuscles] = useState<string[]>(initial.muscles ?? []);
    const [variationOf, setVariationOf] = useState(initial.variationOf ?? '');

    const equipmentList = useId();
    const familyList = useId();

    const trimmed = name.trim();

    // Not asked of a fixed name: it is already the one this describes.
    const refusal = nameFixed ? null : trimmed.length === 0 ? null : refuse(trimmed);
    const family = variationOf.trim();
    const selfFamily = family.length > 0 && family.toLowerCase() === trimmed.toLowerCase();
    const canSubmit = trimmed.length > 0 && refusal === null && !selfFamily && !busy;

    // Clicking a muscle adds it after the ones already chosen, so the order
    // of the taps is the order of the list — main muscle first, the way the
    // library writes it — and clicking one again takes it out.
    function toggleMuscle(muscle: string) {
        setMuscles((current) => (
            current.includes(muscle)
                ? current.filter((one) => one !== muscle)
                : current.length >= MAX_MUSCLES ? current : [...current, muscle]
        ));
    }

    async function submit() {
        if (!canSubmit) return;

        const input: CustomExerciseInput = { name: trimmed };

        if (equipment.trim()) input.equipment = equipment.trim();
        if (group) input.group = group;
        if (muscles.length > 0) input.muscles = muscles;
        if (family) input.variationOf = family;

        if (await onSubmit(input)) onCancel();
    }

    return (
        <form
            className="panel exform"
            onSubmit={(event) => {
                event.preventDefault();
                void submit();
            }}
        >
            <div className="panel__head">
                <span className="panel__label panel__label--accent">
                    {editing ? 'EDIT EXERCISE' : 'NEW EXERCISE'}
                </span>
            </div>

            <div className="exform__row">
                <label className="field">
                    <span className="field__label">NAME</span>
                    <input
                        className="text-input"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        readOnly={nameFixed}
                        maxLength={MAX_EXERCISE_NAME}
                        placeholder="Landmine Press"
                        autoComplete="off"
                        autoFocus={!nameFixed}
                    />
                </label>
                <label className="field">
                    <span className="field__label">EQUIPMENT</span>
                    <input
                        className="text-input"
                        value={equipment}
                        onChange={(event) => setEquipment(event.target.value)}
                        list={equipmentList}
                        maxLength={MAX_TAG}
                        placeholder="Bar, Cable, Kettlebell…"
                        autoComplete="off"
                    />
                    <datalist id={equipmentList}>
                        {(library?.equipment ?? []).map((option) => (
                            <option key={option} value={option} />
                        ))}
                    </datalist>
                </label>
            </div>

            {nameFixed ? (
                <p className="panel__note">
                    {editing
                        ? 'The name is fixed: every plan and session that used it holds the name, '
                            + 'so a new name is a new exercise.'
                        : 'Describing a name your plans already use — every session logged under '
                            + 'it gets this description too.'}
                </p>
            ) : refusal ? (
                <p className="exform__problem">{refusal}</p>
            ) : null}

            <div className="exform__group">
                <span className="field__label">MUSCLE GROUP</span>
                <div className="exform__chips" role="group" aria-label="Muscle group">
                    {GROUPS.map((option) => (
                        <button
                            key={option}
                            type="button"
                            className={option === group ? 'chip chip--small chip--on' : 'chip chip--small'}
                            aria-pressed={option === group}
                            onClick={() => setGroup(option === group ? null : option)}
                        >
                            {option}
                        </button>
                    ))}
                </div>
                {group === null ? (
                    <p className="panel__note">
                        Without a group it counts toward nothing in the builder&rsquo;s sets per
                        group — which is most of the reason to describe it.
                    </p>
                ) : null}
            </div>

            <div className="exform__group">
                <span className="field__label">
                    {`TRAINS · UP TO ${MAX_MUSCLES}, MAIN ONE FIRST`}
                </span>
                <div className="exform__chips" role="group" aria-label="Muscles trained">
                    {MUSCLES.map((muscle) => {
                        const at = muscles.indexOf(muscle);

                        return (
                            <button
                                key={muscle}
                                type="button"
                                className={at >= 0 ? 'chip chip--small chip--on' : 'chip chip--small'}
                                aria-pressed={at >= 0}
                                disabled={at < 0 && muscles.length >= MAX_MUSCLES}
                                onClick={() => toggleMuscle(muscle)}
                            >
                                {at >= 0 ? `${at + 1} · ${muscle}` : muscle}
                            </button>
                        );
                    })}
                </div>
            </div>

            <label className="field exform__group">
                <span className="field__label">A VARIATION OF · OPTIONAL</span>
                <input
                    className="text-input"
                    value={variationOf}
                    onChange={(event) => setVariationOf(event.target.value)}
                    list={familyList}
                    maxLength={MAX_EXERCISE_NAME}
                    placeholder="Overhead Press"
                    autoComplete="off"
                />
                <datalist id={familyList}>
                    {(library?.exercises ?? [])
                        .filter((exercise) => exercise.variationOf === undefined)
                        .map((exercise) => <option key={exercise.name} value={exercise.name} />)}
                </datalist>
            </label>
            {selfFamily ? (
                <p className="exform__problem">An exercise cannot be a variation of itself.</p>
            ) : null}

            {error ? <p className="exform__problem">{error}</p> : null}

            <div className="exform__actions">
                <button type="button" className="ghost" onClick={onCancel}>
                    Cancel
                </button>
                <button type="submit" className="primary" disabled={!canSubmit}>
                    {busy ? 'Saving…' : editing ? 'Save changes' : 'Add exercise'}
                </button>
            </div>
        </form>
    );
}
