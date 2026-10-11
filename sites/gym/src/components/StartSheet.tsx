import { Sheet } from './Sheet';
import type { TemplatesState } from '../hooks/useTemplates';
import type { DayTemplate } from '../lib/types';

interface StartSheetProps {
    templates: TemplatesState;
    busy: boolean;

    /** Starts today's workout with these exercises in it — none for an empty one. */
    onStart: (exercises: string[]) => void;
    onClose: () => void;
}

/**
 * Start, for a workout in no block: empty, or opened on a template.
 *
 * The templates are the same ones the Plan tab drops into a day, and starting
 * from one is the same kind of copy — the names go into today's session with no
 * sets against them, and nothing links the session back to the template. Set
 * counts are left behind on purpose: a planned count is something a block
 * prescribes week by week, and there is no week here to prescribe against.
 */
export function StartSheet({ templates, busy, onStart, onClose }: StartSheetProps) {
    const groups: { label: string; list: DayTemplate[] }[] = [
        { label: 'YOUR TEMPLATES', list: templates.saved },
        { label: 'BUILT IN', list: templates.builtIn },
    ];

    return (
        <Sheet label="Start a workout" onClose={onClose}>
            <div className="sheet__eyebrow">TODAY · NO BLOCK</div>
            <div className="sheet__title">Start a workout</div>
            <p className="day__sub" style={{ marginTop: 8 }}>
                Logged on its own: no weeks, no ramp, no deload. Every set saves as you
                log it.
            </p>

            <button
                type="button"
                className="sheet__action"
                disabled={busy}
                onClick={() => onStart([])}
            >
                {busy ? 'Working…' : 'Empty workout — add exercises as you go'}
            </button>

            {groups.map((group) => (group.list.length > 0 ? (
                <div key={group.label}>
                    <span className="section-label">{group.label}</span>
                    <div className="rows" style={{ marginTop: 10 }}>
                        {group.list.map((template) => (
                            <button
                                key={template.id}
                                type="button"
                                className="row"
                                disabled={busy}
                                onClick={() => onStart(template.plan.map((one) => one.exerciseName))}
                            >
                                <span>
                                    <span className="row__label">{template.name}</span>
                                    <span className="row__sub">
                                        {template.plan.map((one) => one.exerciseName).join(' · ')}
                                    </span>
                                </span>
                                <span className="row__right">
                                    <span className="row__value">{template.plan.length}</span>
                                    <span className="row__unit">exercises</span>
                                </span>
                            </button>
                        ))}
                    </div>
                </div>
            ) : null))}

            {templates.loading ? <p className="empty">Reading your templates…</p> : null}
            {templates.error ? <p className="empty">{templates.error}</p> : null}

            <button type="button" className="ghost stack-8" onClick={onClose}>
                Close
            </button>
        </Sheet>
    );
}
