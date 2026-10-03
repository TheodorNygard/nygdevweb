import { useRef, useState } from 'react';

import { num, useDialog, type Experience, type LifterProfile } from '../lib/gym';
import { MAX_BODYWEIGHT_KG, MAX_PROFILE_TEXT, MIN_BODYWEIGHT_KG } from '../lib/limits';

interface ProfileModalProps {
    /** What the form opens on — the profile as the server last confirmed it. */
    initial: LifterProfile;
    busy: boolean;
    error: string | null;
    onSave: (profile: LifterProfile) => Promise<boolean>;
    onClose: () => void;
}

/** The experience levels, in the order they are offered, with how each reads. */
const EXPERIENCES: readonly { value: Experience; label: string; note: string }[] = [
    { value: 'beginner', label: 'Beginner', note: 'under a year of lifting' },
    { value: 'intermediate', label: 'Intermediate', note: 'a few years; progress is week to week' },
    { value: 'advanced', label: 'Advanced', note: 'many years; progress is block to block' },
];

/** `82`, `82.5` — a bodyweight as the field shows it, or blank for none. */
function weightText(weightKg: number | undefined): string {
    return weightKg === undefined ? '' : num(weightKg);
}

/**
 * The lifter's profile: experience, bodyweight, goal, injuries.
 *
 * Four optional fields and nothing else, because it exists for one reader —
 * the coaching export, whose *Goals and context* section it fills in. It is a
 * modal off that export rather than a view of its own for the same reason: it
 * is read in exactly one place, and that place is where somebody notices it is
 * empty.
 *
 * Experience is chips, not text, so the export says `intermediate` and never
 * `intermedaite`; bodyweight is a number in kilograms, the unit the whole log
 * is in. Save sends all four fields whole, so a cleared field is cleared on
 * the server too.
 */
export function ProfileModal({ initial, busy, error, onSave, onClose }: ProfileModalProps) {
    const [experience, setExperience] = useState<Experience | null>(initial.experience ?? null);
    const [weight, setWeight] = useState(weightText(initial.bodyweightKg));
    const [goal, setGoal] = useState(initial.goal ?? '');
    const [injuries, setInjuries] = useState(initial.injuries ?? '');

    const panel = useRef<HTMLElement>(null);
    const root = useDialog<HTMLDivElement>(onClose, panel);

    // Blank is "not given"; anything else has to be a weight the API accepts,
    // and the form says so rather than sending it to be refused.
    const weightTrimmed = weight.trim().replace(',', '.');
    const weightKg = weightTrimmed === '' ? undefined : Number(weightTrimmed);
    const weightProblem = weightKg === undefined
        ? null
        : !Number.isFinite(weightKg) || weightKg < MIN_BODYWEIGHT_KG || weightKg > MAX_BODYWEIGHT_KG
            ? `Bodyweight is kilograms, ${MIN_BODYWEIGHT_KG} to ${MAX_BODYWEIGHT_KG}.`
            : null;
    const canSave = weightProblem === null && !busy;

    async function save() {
        if (!canSave) return;

        const next: LifterProfile = {};

        if (experience) next.experience = experience;
        if (weightKg !== undefined) next.bodyweightKg = weightKg;
        if (goal.trim()) next.goal = goal.trim();
        if (injuries.trim()) next.injuries = injuries.trim();

        if (await onSave(next)) onClose();
    }

    return (
        <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Your profile"
            ref={root}
        >
            <button
                type="button"
                className="modal__scrim"
                aria-label="Close"
                onClick={onClose}
            />
            <section className="modal__panel" ref={panel} tabIndex={-1}>
                <form
                    className="profile"
                    onSubmit={(event) => {
                        event.preventDefault();
                        void save();
                    }}
                >
                    <div className="modal__head">
                        <div className="modal__eyebrow">YOUR PROFILE</div>
                        <div className="modal__title">What a coach should know</div>
                        <p className="modal__lede">
                            Every field is optional. What is filled in opens the export&rsquo;s
                            <em> Goals and context</em> section, so the reader starts from it instead
                            of from a blank.
                        </p>
                    </div>

                    <div className="modal__body profile__body">
                        <div className="profile__group">
                            <span className="field__label">EXPERIENCE</span>
                            <div className="exform__chips" role="group" aria-label="Experience">
                                {EXPERIENCES.map((option) => (
                                    <button
                                        key={option.value}
                                        type="button"
                                        className={option.value === experience
                                            ? 'chip chip--small chip--on'
                                            : 'chip chip--small'}
                                        aria-pressed={option.value === experience}
                                        title={option.note}
                                        onClick={() => setExperience(
                                            option.value === experience ? null : option.value,
                                        )}
                                    >
                                        {option.label}
                                    </button>
                                ))}
                            </div>
                            <p className="panel__note">
                                {EXPERIENCES.find((option) => option.value === experience)?.note
                                    ?? 'Beginner: under a year. Intermediate: a few years. Advanced: many.'}
                            </p>
                        </div>

                        <label className="field profile__group profile__weight">
                            <span className="field__label">BODYWEIGHT · KG</span>
                            <input
                                className="text-input"
                                inputMode="decimal"
                                value={weight}
                                onChange={(event) => setWeight(event.target.value)}
                                placeholder="82.5"
                                autoComplete="off"
                            />
                        </label>
                        {weightProblem ? <p className="exform__problem">{weightProblem}</p> : null}

                        <label className="field profile__group">
                            <span className="field__label">GOAL</span>
                            <textarea
                                className="text-area"
                                value={goal}
                                onChange={(event) => setGoal(event.target.value)}
                                maxLength={MAX_PROFILE_TEXT}
                                rows={3}
                                placeholder="What this block is for — add 10 kg to the squat, keep the bench moving while cutting…"
                            />
                        </label>

                        <label className="field profile__group">
                            <span className="field__label">INJURIES AND LIMITS</span>
                            <textarea
                                className="text-area"
                                value={injuries}
                                onChange={(event) => setInjuries(event.target.value)}
                                maxLength={MAX_PROFILE_TEXT}
                                rows={3}
                                placeholder="What hurts, what to avoid — left knee: no deep leg press…"
                            />
                        </label>

                        {error ? <p className="exform__problem">{error}</p> : null}
                    </div>

                    <div className="modal__actions">
                        <button type="button" className="ghost" onClick={onClose}>
                            Cancel
                        </button>
                        <button type="submit" className="primary" disabled={!canSave}>
                            {busy ? 'Saving…' : 'Save profile'}
                        </button>
                    </div>
                </form>
            </section>
        </div>
    );
}
