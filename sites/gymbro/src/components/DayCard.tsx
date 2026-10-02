import { groupOf } from '../lib/groups';
import {
    equipmentFor,
    reordered,
    useDragReorder,
    type DayInput,
    type ExerciseLibrary,
} from '../lib/gym';
import { MAX_PLANNED_PER_DAY, MAX_SETS } from '../lib/limits';

interface DayCardProps {
    day: DayInput;
    index: number;
    library: ExerciseLibrary | null;
    onChange: (day: DayInput) => void;
    onAdd: () => void;
    onTemplates: () => void;
}

/**
 * One day of the block: its name, and the exercises it prescribes with how many
 * sets of each.
 *
 * A component of its own rather than a map body in `BlockScreen` because the
 * reorder hook is per list — it holds the row being carried — and a hook cannot
 * be called inside a loop.
 *
 * The order is not cosmetic. A session started from this day opens with its
 * exercises in exactly this order, so dragging a row here is choosing what the
 * phone shows first. Like every other edit on this screen it reorders the
 * *draft*: it saves with the block, not on release.
 */
export function DayCard({ day, index, library, onChange, onAdd, onTemplates }: DayCardProps) {
    const { rowProps, handleProps } = useDragReorder(day.plan.length, (from, to) => {
        onChange({ ...day, plan: reordered(day.plan, from, to) });
    });

    function editPlan(change: (plan: DayInput['plan']) => DayInput['plan']) {
        onChange({ ...day, plan: change(day.plan) });
    }

    const full = day.plan.length >= MAX_PLANNED_PER_DAY;

    return (
        <section className="day">
            <div className="day__head">
                <span className="day__n">{`D${index + 1}`}</span>
                <input
                    className={
                        day.label.trim().length === 0 ? 'day__name day__name--empty' : 'day__name'
                    }
                    value={day.label}
                    placeholder="Name this day"
                    onChange={(event) => onChange({ ...day, label: event.target.value })}
                    aria-label={`Label for day ${index + 1}`}
                    maxLength={40}
                />
            </div>

            <div className="day__counts">
                <span>{`${day.plan.length} EXERCISES`}</span>
                <span>{`${day.plan.reduce((total, planned) => total + planned.sets, 0)} SETS`}</span>
            </div>

            <div className="day__plan">
                {day.plan.map((planned, position) => {
                    const row = rowProps(position);

                    return (
                        <div
                            key={`${planned.exerciseName}:${position}`}
                            ref={row.ref}
                            style={row.style}
                            className={row.className ? `plan-item ${row.className}` : 'plan-item'}
                        >
                            <div className="plan-item__head">
                                <button
                                    type="button"
                                    className="grip"
                                    aria-label={`Reorder ${planned.exerciseName}. Drag, or use the arrow keys.`}
                                    {...handleProps(position)}
                                >
                                    <span className="grip__grid">
                                        <span />
                                        <span />
                                        <span />
                                        <span />
                                        <span />
                                        <span />
                                    </span>
                                </button>
                                <span className="plan-item__text">
                                    <span className="plan-item__name">{planned.exerciseName}</span>
                                    <span className="plan-item__meta">
                                        {equipmentFor(library, planned.exerciseName)}
                                        {` · ${groupOf(planned.exerciseName, library)}`}
                                    </span>
                                </span>
                                <button
                                    type="button"
                                    className="icon-button"
                                    aria-label={`Remove ${planned.exerciseName}`}
                                    onClick={() => editPlan((plan) => (
                                        plan.filter((_, at) => at !== position)
                                    ))}
                                >
                                    ×
                                </button>
                            </div>

                            <div className="plan-item__sets">
                                <button
                                    type="button"
                                    className="tick tick--small"
                                    aria-label={`One fewer set of ${planned.exerciseName}`}
                                    disabled={planned.sets <= 1}
                                    onClick={() => editPlan((plan) => plan.map((one, at) => (
                                        at === position ? { ...one, sets: one.sets - 1 } : one
                                    )))}
                                >
                                    −
                                </button>
                                <span className="plan-item__count">
                                    {planned.sets}
                                    <span className="plan-item__unit"> SETS</span>
                                </span>
                                <button
                                    type="button"
                                    className="tick tick--small"
                                    aria-label={`One more set of ${planned.exerciseName}`}
                                    disabled={planned.sets >= MAX_SETS}
                                    onClick={() => editPlan((plan) => plan.map((one, at) => (
                                        at === position ? { ...one, sets: one.sets + 1 } : one
                                    )))}
                                >
                                    +
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>

            <button type="button" className="day__add" disabled={full} onClick={onAdd}>
                {full ? `${MAX_PLANNED_PER_DAY} is the most a day can plan` : '+ Add exercise'}
            </button>
            <button type="button" className="day__tpl" onClick={onTemplates}>
                {day.plan.length === 0 ? 'Start from a template' : 'Templates'}
            </button>
        </section>
    );
}
