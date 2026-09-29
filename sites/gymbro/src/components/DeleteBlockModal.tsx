import { useEffect } from 'react';

import { kg, type MesocycleSummary } from '../lib/gym';

interface DeleteBlockModalProps {
    block: MesocycleSummary;

    /**
     * Total volume logged in this block. Null while its sessions are still being
     * read — the button stays disabled until it arrives, so the confirmation
     * never understates what it is about to take.
     */
    volumeKg: number | null;

    busy: boolean;
    onDelete: () => void;
    onClose: () => void;
}

/**
 * The one write on this site that destroys training history.
 *
 * `DELETE /gym/mesocycles/{id}` takes the block **and every session logged in
 * it**, with no undo on the other end, so it is a modal of its own that names
 * the count and the volume before the button arms — the same rule the logger's
 * block sheet follows. Everything else here edits a draft or is retried safely;
 * this is guarded only by the confirmation in front of it.
 */
export function DeleteBlockModal({
    block,
    volumeKg,
    busy,
    onDelete,
    onClose,
}: DeleteBlockModalProps) {
    useEffect(() => {
        function onKey(event: KeyboardEvent) {
            if (event.key === 'Escape') onClose();
        }

        window.addEventListener('keydown', onKey);

        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    const sessions = block.sessionCount === 1
        ? '1 logged session'
        : `${block.sessionCount} logged sessions`;

    return (
        <div className="modal" role="dialog" aria-modal="true" aria-label="Delete block">
            <button
                type="button"
                className="modal__scrim"
                aria-label="Close"
                onClick={onClose}
            />
            <section className="modal__panel modal__panel--narrow">
                <div className="modal__head">
                    <div className="modal__eyebrow modal__eyebrow--danger">DELETE BLOCK</div>
                    <div className="modal__title">{block.name}</div>
                    <p className="modal__lede">
                        {`${block.weeks} weeks · ${block.days.length} days. This also deletes `}
                        {sessions}
                        {volumeKg === null ? '' : `, ${kg(volumeKg)} of recorded volume`}
                        {block.isCurrent
                            ? '. It is the block the phone opens on, which will move to the newest '
                                + 'one left'
                            : ''}
                        . This cannot be undone.
                    </p>
                </div>
                <div className="modal__actions">
                    <button type="button" className="ghost" onClick={onClose}>
                        Keep it
                    </button>
                    <button
                        type="button"
                        className="danger"
                        disabled={busy || volumeKg === null}
                        onClick={onDelete}
                    >
                        {busy
                            ? 'Deleting…'
                            : volumeKg === null
                                ? 'Reading what is in it…'
                                : `Delete block and ${block.sessionCount} sessions`}
                    </button>
                </div>
            </section>
        </div>
    );
}
