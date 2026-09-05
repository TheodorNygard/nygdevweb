import { useState } from 'react';

import { Sheet } from './Sheet';
import type { TemplatesState } from '../hooks/useTemplates';
import { setsIn } from '../lib/templates';
import type { DayTemplate, PlannedExercise } from '../lib/types';

interface TemplateSheetProps {
    /** The day being planned, which is also what a new template is named after. */
    dayLabel: string;

    /** What the day plans right now — what "save this day" would capture. */
    plan: PlannedExercise[];

    templates: TemplatesState;
    onApply: (plan: PlannedExercise[]) => void;
    onClose: () => void;
}

/**
 * The template picker: drop a saved plan into the day being edited, or save the
 * day as one.
 *
 * Applying **replaces** what the day plans rather than appending to it. A
 * template is a whole day's worth of exercises, so appending one to a day that
 * already has some is the rarer intent and the harder one to undo — and
 * replacing is not destructive here anyway: the Plan tab's draft is local until
 * its Save, so leaving the tab without saving puts the old plan back.
 *
 * The two lists are kept apart because only one of them can be edited. A
 * built-in template ships with the app and is the same for everybody; a saved
 * one is the user's, and re-saving or deleting it changes no block that was
 * filled from it, because applying copied the exercises rather than linking to
 * them.
 */
export function TemplateSheet({
    dayLabel,
    plan,
    templates,
    onApply,
    onClose,
}: TemplateSheetProps) {
    const [name, setName] = useState(dayLabel);

    // Which saved template a delete is waiting on. The confirmation is inline
    // rather than a second sheet: what is being destroyed is a shortcut, not a
    // workout, so it needs a moment's pause rather than a screen of prose.
    const [confirming, setConfirming] = useState<string | null>(null);

    const typed = name.trim();

    // Saving under a name that is already yours re-saves that one instead of
    // filing a near-duplicate beside it. The API allows two templates to share
    // a name — the id is the identity — so this is the client choosing the
    // reading a person means by it, not a rule the server enforces.
    const existing = templates.saved.find((template) => (
        template.name.toLowerCase() === typed.toLowerCase()
    ));

    const canSave = typed.length > 0 && plan.length > 0 && !templates.busy;

    function apply(template: DayTemplate) {
        // A copy, not the list's own array. Every edit on the day plan sheet
        // replaces the array rather than mutating it, so sharing it would be
        // safe today — and it is the kind of safe that stops being true
        // quietly, one `push` at a time.
        onApply(template.plan.map((exercise) => ({ ...exercise })));
        onClose();
    }

    function row(template: DayTemplate, savedByUser: boolean) {
        if (confirming === template.id) {
            return (
                <div className="tpl tpl--confirming" key={template.id}>
                    <span className="tpl__sub">Delete “{template.name}”?</span>
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
            <div className="tpl" key={template.id}>
                <button
                    type="button"
                    className="tpl__apply"
                    onClick={() => apply(template)}
                >
                    <span className="tpl__name">{template.name}</span>
                    <span className="tpl__sub">
                        {template.plan.length} exercises · {setsIn(template.plan)} sets
                    </span>
                </button>
                {savedByUser ? (
                    <button
                        type="button"
                        className="set__del"
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
        <Sheet label={`Templates for ${dayLabel}`} onClose={onClose} tall>
            <div className="sheet__eyebrow">TEMPLATES</div>
            <div className="sheet__title">{dayLabel}</div>
            <p className="day__sub" style={{ marginTop: 8 }}>
                Tapping one fills this day with its exercises, replacing what the day plans now.
                Nothing is written until you save the block, so it is undone by leaving the Plan tab
                without saving.
            </p>

            {templates.error ? <p className="tpl__error">{templates.error}</p> : null}

            <span className="section-label">SAVE THIS DAY</span>
            {plan.length === 0 ? (
                <p className="empty">
                    Nothing planned yet, so there is nothing to save. Add exercises to {dayLabel}
                    {' '}first, or start it from one of the templates below.
                </p>
            ) : (
                <>
                    <input
                        className="text-input"
                        style={{ marginTop: 12 }}
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        aria-label="Template name"
                        maxLength={80}
                    />
                    <button
                        type="button"
                        className="sheet__action"
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
                </>
            )}

            <span className="section-label">YOURS</span>
            {templates.loading && templates.saved.length === 0 ? (
                <p className="empty">Reading your templates…</p>
            ) : templates.saved.length === 0 ? (
                <p className="empty">
                    Nothing saved yet. A day you have planned can be saved above and dropped into
                    any day of any block afterwards.
                </p>
            ) : (
                <div className="rows" style={{ marginTop: 12 }}>
                    {templates.saved.map((template) => row(template, true))}
                </div>
            )}

            <span className="section-label">BUILT IN</span>
            {templates.builtIn.length === 0 ? (
                <p className="empty">
                    The built-in templates are not here. They load from the CDN, so this is being
                    offline or the file not being where the app looks — the browser console says
                    which. Your own templates are unaffected, and a day can still be planned by
                    hand.
                </p>
            ) : (
                <div className="rows" style={{ marginTop: 12 }}>
                    {templates.builtIn.map((template) => row(template, false))}
                </div>
            )}

            <button type="button" className="ghost stack-18" onClick={onClose}>
                Done
            </button>
        </Sheet>
    );
}
