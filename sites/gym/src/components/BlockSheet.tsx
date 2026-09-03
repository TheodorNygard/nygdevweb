import { useState } from 'react';

import { Sheet } from './Sheet';
import { kg } from '../lib/format';
import type { MesocycleSummary } from '../lib/types';

interface BlockSheetProps {
    block: MesocycleSummary;

    /**
     * Total volume logged in this block, summed from its sessions. Null while
     * it is still being read — the delete stays disabled until it arrives, so
     * the confirmation never understates what it is about to take.
     */
    volumeKg: number | null;

    busy: boolean;
    onSwitch: (mesoId: string) => void;
    onCopy: (block: MesocycleSummary) => void;
    onDelete: (mesoId: string) => void;
    onClose: () => void;
}

/**
 * One block, and the three things you can do to it.
 *
 * The delete is why this is a sheet rather than a row of buttons. It cascades —
 * the block and every session in it, with no undo and no soft delete on the
 * other end — so it is two taps, the second one a different button, and it
 * cannot be armed until the count and the volume it would destroy are on
 * screen. Everywhere else this app goes out of its way not to lose a logged
 * workout; this is the one place that can, so the confirmation is the whole
 * safety mechanism rather than a formality.
 *
 * Copy is the cheap half of the same screen: `POST /gym/mesocycles` already
 * takes a name, a week count and day labels, so copying is sending back the
 * shape you are looking at. There is no copy route and does not need to be one.
 */
export function BlockSheet({
    block,
    volumeKg,
    busy,
    onSwitch,
    onCopy,
    onDelete,
    onClose,
}: BlockSheetProps) {
    const [confirming, setConfirming] = useState(false);

    const shape = `${block.weeks} weeks · ${block.days.length} days`;
    const logged = block.submittedCount === 1 ? '1 logged' : `${block.submittedCount} logged`;
    const drafts = block.sessionCount - block.submittedCount;

    return (
        <Sheet label={block.name} onClose={onClose}>
            <div className="sheet__eyebrow">
                {block.isCurrent ? 'CURRENT BLOCK' : 'BLOCK'}
            </div>
            <div className="sheet__title">{block.name}</div>
            <p className="day__sub" style={{ marginTop: 8 }}>
                {shape} · {logged}
                {drafts > 0 ? ` · ${drafts} unfinished` : ''}
            </p>

            <div className="lines">
                {block.days.map((day) => (
                    <div className="line" key={day.dayIndex}>
                        <span className="line__name">{day.label}</span>
                        <span className="line__detail">D{day.dayIndex + 1}</span>
                    </div>
                ))}
            </div>

            {confirming ? (
                <>
                    <p className="lede">
                        This also deletes {block.sessionCount === 1
                            ? '1 logged session'
                            : `${block.sessionCount} logged sessions`}
                        {volumeKg === null ? '' : `, ${kg(volumeKg)} of recorded volume`}. This
                        cannot be undone.
                    </p>
                    <button
                        type="button"
                        className="sheet__danger stack-18"
                        disabled={busy || volumeKg === null}
                        onClick={() => onDelete(block.id)}
                    >
                        {busy
                            ? 'Deleting…'
                            : volumeKg === null
                                ? 'Reading what is in it…'
                                : `Delete block and ${block.sessionCount} sessions`}
                    </button>
                    <button
                        type="button"
                        className="ghost stack-8"
                        onClick={() => setConfirming(false)}
                    >
                        Keep it
                    </button>
                </>
            ) : (
                <>
                    {block.isCurrent ? null : (
                        <button
                            type="button"
                            className="sheet__action"
                            disabled={busy}
                            onClick={() => onSwitch(block.id)}
                        >
                            Make this the current block
                        </button>
                    )}

                    <button
                        type="button"
                        className={block.isCurrent ? 'sheet__action' : 'secondary stack-8'}
                        disabled={busy}
                        onClick={() => onCopy(block)}
                    >
                        Copy its shape to a new block
                    </button>

                    <button
                        type="button"
                        className="sheet__danger"
                        disabled={busy}
                        onClick={() => setConfirming(true)}
                    >
                        Delete this block
                    </button>

                    <button type="button" className="ghost stack-8" onClick={onClose}>
                        Close
                    </button>
                </>
            )}
        </Sheet>
    );
}
