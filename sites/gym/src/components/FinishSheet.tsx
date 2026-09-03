import { Sheet } from './Sheet';
import { kg, rpeLabel } from '../lib/format';
import type { SessionTotals } from '../lib/types';

interface FinishSheetProps {
    label: string;
    totals: SessionTotals;
    busy: boolean;
    onSubmit: () => void;
    onClose: () => void;
}

/**
 * The confirmation between the last set and a submitted workout.
 *
 * It exists to show the four numbers rather than to ask permission: submit is
 * idempotent and reversible enough — a session can be deleted, and the sets
 * are already stored either way — so the sheet is a last look at what the
 * session added up to, not a warning.
 */
export function FinishSheet({ label, totals, busy, onSubmit, onClose }: FinishSheetProps) {
    const stats = [
        { key: 'EXERCISES', value: String(totals.exerciseCount) },
        { key: 'SETS', value: String(totals.setCount) },
        { key: 'VOLUME', value: kg(totals.volumeKg) },
        { key: 'AVG RPE', value: rpeLabel(totals.avgRpe) },
    ];

    return (
        <Sheet label={`Submit ${label}`} onClose={onClose}>
            <div className="sheet__question">Submit {label}?</div>
            <div className="tiles">
                {stats.map((stat) => (
                    <div className="tile" key={stat.key}>
                        <div className="tile__key">{stat.key}</div>
                        <div className="tile__value">{stat.value}</div>
                    </div>
                ))}
            </div>
            <button type="button" className="sheet__action" onClick={onSubmit} disabled={busy}>
                {busy ? 'Submitting…' : 'Submit workout'}
            </button>
            <button type="button" className="ghost stack-8" onClick={onClose}>
                Keep logging
            </button>
        </Sheet>
    );
}
