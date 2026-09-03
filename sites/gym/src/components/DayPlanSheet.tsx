import { useState } from 'react';

import { ExercisePicker } from './ExercisePicker';
import { Sheet } from './Sheet';
import { Stepper } from './Stepper';
import { equipmentFor } from '../lib/library';
import type { ExerciseLibrary, PlannedExercise } from '../lib/types';

/** What a newly planned exercise prescribes before it is adjusted. */
const OPENING = { sets: 3 };

/** The API's bounds, so the editor cannot compose a plan the API refuses. */
const MAX_PLANNED = 20;
const MAX_SETS = 60;

interface DayPlanSheetProps {
    label: string;
    dayIndex: number;
    plan: PlannedExercise[];
    library: ExerciseLibrary | null;
    onChange: (plan: PlannedExercise[]) => void;
    onClose: () => void;
}

/**
 * What a day prescribes: which exercises, and how many sets of each.
 *
 * Editing is local to the Plan tab's draft — nothing writes until Save. That
 * matters more than usual here, because `days` is replaced wholesale by the
 * PATCH: a write per stepper tap would be a write per tap on a number.
 *
 * No target weight and no target reps, by design: a programme prescribes how
 * much work, the session discovers the rest. How hard each set should be is the
 * week's business rather than the plan's — the logger reads a reps-in-the-tank
 * target off the position in the block. The plan is not a contract either: it
 * seeds a session's exercises and shows a target, and nothing stops you logging
 * four sets against a three-set plan.
 */
export function DayPlanSheet({
    label,
    dayIndex,
    plan,
    library,
    onChange,
    onClose,
}: DayPlanSheetProps) {
    const [picking, setPicking] = useState(false);

    function replace(index: number, patch: Partial<PlannedExercise>) {
        onChange(plan.map((entry, position) => (
            position === index ? { ...entry, ...patch } : entry
        )));
    }

    function remove(index: number) {
        onChange(plan.filter((_, position) => position !== index));
    }

    function add(exerciseName: string) {
        setPicking(false);

        if (plan.length >= MAX_PLANNED) return;

        onChange([...plan, { exerciseName, ...OPENING }]);
    }

    return (
        <>
            <Sheet label={`Plan for ${label}`} onClose={onClose}>
                <div className="sheet__eyebrow">PLAN · DAY {dayIndex + 1}</div>
                <div className="sheet__title">{label}</div>
                <p className="day__sub" style={{ marginTop: 8 }}>
                    Applies to {label} in every week of this block. Sets only — how hard each one
                    should be comes from the week you are in.
                </p>

                {plan.length === 0 ? (
                    <p className="empty">
                        Nothing planned. Add exercises and this day starts with them already on
                        it — you still log what you actually lift, for as many reps as it takes.
                    </p>
                ) : (
                    <div className="planned">
                        {plan.map((entry, index) => (
                            <div className="planned__item" key={`${entry.exerciseName}-${index}`}>
                                <div className="planned__head">
                                    <div>
                                        <div className="planned__name">{entry.exerciseName}</div>
                                        <div className="planned__eq">
                                            {equipmentFor(library, entry.exerciseName)}
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        className="set__del"
                                        onClick={() => remove(index)}
                                        aria-label={`Remove ${entry.exerciseName} from the plan`}
                                    >
                                        ×
                                    </button>
                                </div>
                                <div
                                    className="stepper-row stepper-row--single"
                                    style={{ marginTop: 10 }}
                                >
                                    <Stepper
                                        label="SETS"
                                        value={String(entry.sets)}
                                        onDecrease={() => replace(index, { sets: entry.sets - 1 })}
                                        onIncrease={() => replace(index, { sets: entry.sets + 1 })}
                                        canDecrease={entry.sets > 1}
                                        canIncrease={entry.sets < MAX_SETS}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                <button
                    type="button"
                    className="add-exercise stack-18"
                    style={{ width: '100%' }}
                    onClick={() => setPicking(true)}
                    disabled={plan.length >= MAX_PLANNED}
                >
                    {plan.length >= MAX_PLANNED
                        ? `${MAX_PLANNED} is the most a day can plan`
                        : '+ Add exercise'}
                </button>

                <button type="button" className="ghost stack-8" onClick={onClose}>
                    Done
                </button>
            </Sheet>

            {picking ? (
                <ExercisePicker
                    library={library}
                    busy={false}
                    onPick={add}
                    onClose={() => setPicking(false)}
                />
            ) : null}
        </>
    );
}
