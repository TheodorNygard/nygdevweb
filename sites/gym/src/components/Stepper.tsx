interface StepperProps {
    label: string;
    value: string;
    onDecrease: () => void;
    onIncrease: () => void;
    canDecrease?: boolean;
    canIncrease?: boolean;
}

/**
 * A −/value/+ control. Four of them in the app: weight, reps, block weeks and
 * days per week.
 *
 * Steppers rather than a number field, and this is the design decision rather
 * than a component detail: a numeric keypad over the bottom half of the screen
 * hides the set list you are logging against, and 2.5 kg is one tap where
 * "72.5" is four plus a dismiss. The buttons are 44px because that is the
 * one-handed reach rule the whole direction is built on.
 */
export function Stepper({
    label,
    value,
    onDecrease,
    onIncrease,
    canDecrease = true,
    canIncrease = true,
}: StepperProps) {
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
                <span className="stepper__value" aria-live="polite">{value}</span>
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
