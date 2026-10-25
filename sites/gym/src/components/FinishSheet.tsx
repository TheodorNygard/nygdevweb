import { Sheet } from './Sheet';
import { kg, rpeLabel } from '../lib/format';
import type { SessionTotals } from '../lib/types';

interface FinishSheetProps {
    label: string;
    totals: SessionTotals;

    /**
     * Whether the session is a day of a block. An empty one there can be
     * submitted as a skipped day; an empty one in no block has no day to skip,
     * so the only thing to do with it is throw it away.
     */
    inBlock: boolean;
    busy: boolean;
    onSubmit: () => void;
    onDiscard: () => void;
    onClose: () => void;
}

/**
 * The confirmation between the last set and a submitted workout. It shows the
 * four numbers rather than asking permission: submit is idempotent and the sets
 * are already stored either way, so this is a last look, not a warning.
 *
 * With nothing logged there are no numbers to look at, and Submit would file a
 * workout that never happened — so it asks what was meant instead. In a block
 * that is either a day being skipped (submitted empty, which `isSkipped` reads
 * as exactly that) or a session opened on the wrong day (discarded, leaving the
 * day where it was). Nothing is lost either way, so neither takes a second tap.
 */
export function FinishSheet({
    label,
    totals,
    inBlock,
    busy,
    onSubmit,
    onDiscard,
    onClose,
}: FinishSheetProps) {
    if (totals.setCount === 0) {
        return (
            <Sheet label={`Nothing logged in ${label}`} onClose={onClose}>
                <div className="sheet__question">Nothing logged in {label}.</div>
                <p className="lede">
                    {inBlock
                        ? 'Skip the day to move on to the next one — it will not count as a workout. '
                            + 'Or discard this, and the day stays as it was.'
                        : 'A workout with no sets in it is not one to keep.'}
                </p>
                {inBlock ? (
                    <>
                        <button type="button" className="sheet__action" onClick={onSubmit} disabled={busy}>
                            {busy ? 'Working…' : 'Skip this day'}
                        </button>
                        <button type="button" className="sheet__danger" onClick={onDiscard} disabled={busy}>
                            Discard it
                        </button>
                    </>
                ) : (
                    <button type="button" className="sheet__action" onClick={onDiscard} disabled={busy}>
                        {busy ? 'Working…' : 'Discard this workout'}
                    </button>
                )}
                <button type="button" className="ghost stack-8" onClick={onClose}>
                    Keep logging
                </button>
            </Sheet>
        );
    }

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
