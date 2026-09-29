import { useEffect, useState } from 'react';

import {
    setsIn,
    type DayTemplate,
    type PlannedExercise,
    type TemplatesState,
} from '../lib/gym';

interface TemplateModalProps {
    /** The day being planned, which is also what a new template is named after. */
    dayLabel: string;

    /** What the day plans right now — what "save this day" would capture. */
    plan: PlannedExercise[];

    templates: TemplatesState;
    onApply: (plan: PlannedExercise[]) => void;
    onClose: () => void;
}

/**
 * The template picker, as the phone's is: drop a saved plan into the day being
 * edited, or save the day as one.
 *
 * Applying **replaces** what the day plans rather than appending to it — a
 * template is a whole day, so appending one to a day that already has exercises
 * is the rarer intent and the harder one to undo. It is not destructive either:
 * the builder holds a draft until Save, so discarding it puts the old plan back.
 *
 * The two lists stay apart because only one of them can be edited. A built-in
 * template ships on the CDN and is the same for everybody; a saved one is the
 * user's, and re-saving or deleting it changes no block that was filled from it,
 * because applying copied the exercises rather than linking to them. The same
 * saved list is what the logger's Plan tab reads, so a template made here is
 * there on the phone.
 */
export function TemplateModal({
    dayLabel,
    plan,
    templates,
    onApply,
    onClose,
}: TemplateModalProps) {
    const [name, setName] = useState(dayLabel);

    // Which saved template a delete is waiting on. Inline rather than a second
    // modal: what is being destroyed is a shortcut, not a workout.
    const [confirming, setConfirming] = useState<string | null>(null);

    useEffect(() => {
        function onKey(event: KeyboardEvent) {
            if (event.key === 'Escape') onClose();
        }

        window.addEventListener('keydown', onKey);

        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    const typed = name.trim();

    // Saving under a name that is already yours re-saves that one instead of
    // filing a near-duplicate beside it. The API lets two templates share a
    // name — the id is the identity — so this is the client choosing the reading
    // a person means by it, not a rule the server enforces.
    const existing = templates.saved.find((template) => (
        template.name.toLowerCase() === typed.toLowerCase()
    ));

    const canSave = typed.length > 0 && plan.length > 0 && !templates.busy;

    function apply(template: DayTemplate) {
        // A copy, not the list's own array: every edit replaces a plan rather
        // than mutating it, so sharing would be safe today — and it is the kind
        // of safe that stops being true quietly, one `push` at a time.
        onApply(template.plan.map((exercise) => ({ ...exercise })));
        onClose();
    }

    function row(template: DayTemplate, savedByUser: boolean, index: number) {
        if (confirming === template.id) {
            return (
                <div className="tpl tpl--confirming" key={template.id}>
                    <span className="tpl__sub">{`Delete “${template.name}”?`}</span>
                    <span className="tpl__actions">
                        <button
                            type="button"
                            className="tpl__keep"
                            onClick={() => setConfirming(null)}
                        >
                            Keep
                        </button>
                        <button
                            type="button"
                            className="tpl__delete"
                            disabled={templates.busy}
                            onClick={() => {
                                setConfirming(null);
                                void templates.remove(template.id);
                            }}
                        >
                            Delete
                        </button>
                    </span>
                </div>
            );
        }

        return (
            <div className={index % 2 === 0 ? 'tpl' : 'tpl tpl--alt'} key={template.id}>
                <button type="button" className="tpl__apply" onClick={() => apply(template)}>
                    <span className="tpl__name">{template.name}</span>
                    <span className="tpl__sub">
                        {`${template.plan.length} exercises · ${setsIn(template.plan)} sets`}
                    </span>
                </button>
                {savedByUser ? (
                    <button
                        type="button"
                        className="icon-button"
                        disabled={templates.busy}
                        onClick={() => setConfirming(template.id)}
                        aria-label={`Delete the ${template.name} template`}
                    >
                        ×
                    </button>
                ) : null}
            </div>
        );
    }

    return (
        <div className="modal" role="dialog" aria-modal="true" aria-label="Templates">
            <button
                type="button"
                className="modal__scrim"
                aria-label="Close"
                onClick={onClose}
            />
            <section className="modal__panel">
                <div className="modal__head">
                    <div className="modal__title-row">
                        <div>
                            <div className="modal__eyebrow">
                                {`TEMPLATES · ${dayLabel.toUpperCase()}`}
                            </div>
                            <div className="modal__title">Day templates</div>
                        </div>
                        <button type="button" className="modal__done" onClick={onClose}>
                            Done
                        </button>
                    </div>
                    <p className="modal__lede">
                        Choosing one fills this day with its exercises, replacing what it plans
                        now. Nothing is written until the block is saved.
                    </p>
                    {templates.error ? <p className="tpl__error">{templates.error}</p> : null}
                </div>

                <div className="modal__body modal__body--sections">
                    <div className="modal__section">SAVE THIS DAY</div>
                    {plan.length === 0 ? (
                        <p className="empty">
                            Nothing planned yet, so there is nothing to save. Add exercises to{' '}
                            {dayLabel || 'this day'} first, or start it from a template below.
                        </p>
                    ) : (
                        <div className="tpl__save">
                            <input
                                className="tpl__name-input"
                                value={name}
                                onChange={(event) => setName(event.target.value)}
                                aria-label="Template name"
                                maxLength={80}
                            />
                            <button
                                type="button"
                                className="primary"
                                disabled={!canSave}
                                onClick={() => {
                                    if (existing) void templates.replace(existing.id, typed, plan);
                                    else void templates.save(typed, plan);
                                }}
                            >
                                {templates.busy
                                    ? 'Saving…'
                                    : existing
                                        ? `Replace “${existing.name}”`
                                        : 'Save as template'}
                            </button>
                        </div>
                    )}

                    <div className="modal__section">YOURS</div>
                    {templates.loading && templates.saved.length === 0 ? (
                        <p className="empty">Reading your templates…</p>
                    ) : templates.saved.length === 0 ? (
                        <p className="empty">
                            Nothing saved yet. A day you have planned can be saved above and
                            dropped into any day of any block afterwards — here or on the phone.
                        </p>
                    ) : (
                        <div className="tpl__list">
                            {templates.saved.map((template, index) => row(template, true, index))}
                        </div>
                    )}

                    <div className="modal__section">BUILT IN</div>
                    {templates.builtIn.length === 0 ? (
                        <p className="empty">
                            The built-in templates are not here. They load from the CDN, so this is
                            being offline or the file not being where the app looks — the browser
                            console says which. Your own templates are unaffected.
                        </p>
                    ) : (
                        <div className="tpl__list">
                            {templates.builtIn.map((template, index) => row(template, false, index))}
                        </div>
                    )}
                </div>
            </section>
        </div>
    );
}
