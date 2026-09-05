interface StepperProps {
    label: string;
    value: number;
    min: number;
    max: number;
    onChange: (value: number) => void;
}

/**
 * A − / + pair with the number between them. Weeks, and days per week.
 *
 * Bounded rather than free: `min` and `max` are the API's, so the arrows go
 * grey at the edge instead of letting a block be built that Save would reject.
 */
export function Stepper({ label, value, min, max, onChange }: StepperProps) {
    return (
        <div className="stepper">
            <div className="stepper__label">{label}</div>
            <div className="stepper__row">
                <button
                    type="button"
                    className="tick"
                    onClick={() => onChange(value - 1)}
                    disabled={value <= min}
                    aria-label={`One fewer — ${label.toLowerCase()}`}
                >
                    −
                </button>
                <span className="stepper__value" aria-live="polite">{value}</span>
                <button
                    type="button"
                    className="tick"
                    onClick={() => onChange(value + 1)}
                    disabled={value >= max}
                    aria-label={`One more — ${label.toLowerCase()}`}
                >
                    +
                </button>
            </div>
        </div>
    );
}
