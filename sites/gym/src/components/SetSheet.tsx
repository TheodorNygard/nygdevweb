import { useState } from 'react';

import { Sheet } from './Sheet';
import { Stepper } from './Stepper';
import { num, rpeNote } from '../lib/format';
import {
    MAX_REPS,
    MAX_WEIGHT_KG,
    REP_STEP,
    RPE_MAX,
    RPE_MIN,
    WEIGHT_STEP,
    clamp,
} from '../lib/steps';
import type { WorkSet } from '../lib/types';

/** Where the slider sits for a set that was logged without a rating. */
const UNRATED_SLIDER = 7;

interface SetSheetProps {
    exerciseName: string;

    /** `Set 2`, or `Warm-up` — what the row being edited is called on screen. */
    setLabel: string;
    set: WorkSet;
    onSave: (set: WorkSet) => void;
    onClose: () => void;
}

/**
 * Correcting one logged set: the weight that was mistyped, the rep that was
 * miscounted, the RPE that was not what the set felt like.
 *
 * The same three controls the logger composes a set with, stepping the same way
 * and stopping at the same bounds, so a correction cannot store anything a fresh
 * tap could not. It opens on the set as logged, and Save stays disabled until
 * something differs from it.
 *
 * **No confirmation.** An edit is the old values replaced by ones the user is
 * looking at as they choose them, and every total is derived from the sets
 * rather than stored — so there is nothing to warn about and nothing to undo
 * that tapping the row again does not. Deleting is the destructive one, and it
 * is confirmed where it happens, on the row.
 *
 * A set logged without a rating opens unrated, and stays unrated unless the
 * slider is moved: an edit to the weight should not invent an RPE nobody gave.
 */
export function SetSheet({ exerciseName, setLabel, set, onSave, onClose }: SetSheetProps) {
    const [weightKg, setWeightKg] = useState(set.weightKg);
    const [reps, setReps] = useState(set.reps);
    const [rpe, setRpe] = useState<number | null>(set.rpe);

    const changed = weightKg !== set.weightKg || reps !== set.reps || rpe !== set.rpe;

    return (
        <Sheet label={`Edit ${setLabel.toLowerCase()} of ${exerciseName}`} onClose={onClose}>
            <div className="sheet__eyebrow">EDIT {setLabel.toUpperCase()}</div>
            <div className="sheet__title">{exerciseName}</div>
            <p className="day__sub" style={{ marginTop: 8 }}>
                Logged as {num(set.weightKg)} kg × {num(set.reps)}
                {set.rpe === null ? ', no RPE' : ` at RPE ${num(set.rpe)}`}.
            </p>

            <div className="stepper-row stack-18">
                <Stepper
                    label="WEIGHT KG"
                    value={num(weightKg)}
                    onDecrease={() => setWeightKg(Math.max(0, weightKg - WEIGHT_STEP))}
                    onIncrease={() => setWeightKg(Math.min(MAX_WEIGHT_KG, weightKg + WEIGHT_STEP))}
                    canDecrease={weightKg > 0}
                    canIncrease={weightKg < MAX_WEIGHT_KG}
                    onValue={(value) => setWeightKg(clamp(value, 0, MAX_WEIGHT_KG))}
                />
                <Stepper
                    label="REPS"
                    value={num(reps)}
                    onDecrease={() => setReps(Math.max(1, reps - REP_STEP))}
                    onIncrease={() => setReps(Math.min(MAX_REPS, reps + REP_STEP))}
                    canDecrease={reps > 1}
                    canIncrease={reps < MAX_REPS}
                    keypad="numeric"
                    onValue={(value) => setReps(clamp(Math.round(value), 1, MAX_REPS))}
                />
            </div>

            <div className="rpe">
                <div className="rpe__head">
                    <span className="field-label">RPE</span>
                    <span className="rpe__note">{rpe === null ? 'not rated' : rpeNote(rpe)}</span>
                </div>
                <div className="rpe__controls">
                    <input
                        className="slider"
                        type="range"
                        min={RPE_MIN}
                        max={RPE_MAX}
                        step={0.5}
                        value={rpe ?? UNRATED_SLIDER}
                        onChange={(event) => setRpe(Number(event.target.value))}
                        aria-label="Rate of perceived exertion"
                    />
                    <span className="rpe__value">{rpe === null ? '—' : num(rpe)}</span>
                </div>
            </div>

            <button
                type="button"
                className="sheet__action"
                disabled={!changed}
                onClick={() => onSave({ weightKg, reps, rpe })}
            >
                {changed ? `Save ${num(weightKg)} × ${num(reps)}` : 'No changes'}
            </button>
            <button type="button" className="ghost stack-8" onClick={onClose}>
                Cancel
            </button>
        </Sheet>
    );
}
