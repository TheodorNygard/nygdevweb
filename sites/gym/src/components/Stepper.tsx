import { useRef, useState } from 'react';

interface StepperProps {
    label: string;
    value: string;
    onDecrease: () => void;
    onIncrease: () => void;
    canDecrease?: boolean;
    canIncrease?: boolean;

    /**
     * Makes the number itself tappable, opening a keypad on it. Optional, and
     * the steppers that leave it out stay read-only: a block is 3 to 8 weeks,
     * so there is nothing to type there that two taps do not say faster.
     *
     * The value arrives parsed and unclamped — the caller owns the bounds it
     * already owns for the buttons.
     */
    onValue?: (value: number) => void;

    /** Which keypad to open. Decimal for a weight, numeric for a rep count. */
    keypad?: 'decimal' | 'numeric';
}

/**
 * A minus/value/plus control: weight, reps, block weeks, days per week.
 *
 * Steppers rather than a number field, and that is a design decision rather
 * than a component detail: a numeric keypad over the bottom half of the screen
 * hides the set list you are logging against, and 2.5 kg is one tap where
 * "72.5" is four plus a dismiss. 44px buttons, the one-handed reach rule.
 *
 * The keypad is still there for the case the steps are wrong for — the first
 * set of the day, where the bar is 80 kg away from whatever the field opens on
 * and stepping to it is thirty taps. It is behind a tap on the number rather
 * than in front of it, so the common path is unchanged and the escape hatch is
 * where you would guess.
 */
export function Stepper({
    label,
    value,
    onDecrease,
    onIncrease,
    canDecrease = true,
    canIncrease = true,
    onValue,
    keypad = 'decimal',
}: StepperProps) {
    // What is in the field while it is open, as typed. Null is closed, and it
    // is deliberately not the same as an empty string: clearing the field to
    // type a fresh number has to be allowed to leave it momentarily empty.
    const [typed, setTyped] = useState<string | null>(null);

    // Escape closes the keypad by blurring the field, and blurring is also how
    // it commits — so the abandon has to be recorded before the blur lands.
    const abandoned = useRef(false);

    function commit(raw: string) {
        setTyped(null);

        // A comma is what a Norwegian keypad puts under the thumb, and
        // `Number('72,5')` is NaN. Nothing else about the string is repaired:
        // a value that does not parse leaves the number as it was, which is
        // what closing the keypad on a half-typed entry should do.
        const parsed = Number(raw.trim().replace(',', '.'));

        if (raw.trim().length > 0 && Number.isFinite(parsed)) onValue?.(parsed);
    }

    return (
        <div className="stepper">
            <div className="stepper__label">{label}</div>
            <div className="stepper__controls">
                <button
                    type="button"
                    className="stepper__button"
                    onClick={onDecrease}
                    disabled={!canDecrease}
                    aria-label={`Decrease ${label.toLowerCase()}`}
                >
                    −
                </button>

                {typed !== null ? (
                    <input
                        className="stepper__input"
                        // `decimal` rather than `number`: a number input on iOS
                        // still shows the full keyboard's top row and adds
                        // spinners nothing here wants.
                        inputMode={keypad}
                        value={typed}
                        autoFocus
                        onFocus={(event) => event.target.select()}
                        onChange={(event) => setTyped(event.target.value)}
                        onBlur={(event) => {
                            if (abandoned.current) {
                                abandoned.current = false;
                                setTyped(null);
                                return;
                            }

                            commit(event.target.value);
                        }}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter') event.currentTarget.blur();

                            if (event.key === 'Escape') {
                                abandoned.current = true;
                                event.currentTarget.blur();
                            }
                        }}
                        aria-label={`${label.toLowerCase()}, type a value`}
                    />
                ) : onValue ? (
                    <button
                        type="button"
                        className="stepper__value stepper__value--typable"
                        onClick={() => setTyped(value)}
                        aria-label={`${label.toLowerCase()} ${value}, tap to type a value`}
                    >
                        {value}
                    </button>
                ) : (
                    <span className="stepper__value" aria-live="polite">{value}</span>
                )}

                <button
                    type="button"
                    className="stepper__button"
                    onClick={onIncrease}
                    disabled={!canIncrease}
                    aria-label={`Increase ${label.toLowerCase()}`}
                >
                    +
                </button>
            </div>
        </div>
    );
}
