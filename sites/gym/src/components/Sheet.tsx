import { useEffect, type ReactNode } from 'react';

interface SheetProps {
    /** Named for assistive technology; the visible title is inside `children`. */
    label: string;
    onClose: () => void;
    tall?: boolean;
    children: ReactNode;
}

/**
 * The bottom sheet all three modals are built from — the day card, the
 * exercise picker and the submit confirmation.
 *
 * It rises from the bottom because that is where the thumb is. The scrim above
 * it is a button rather than a div with an onClick: a tap-to-dismiss target
 * that a keyboard cannot reach is a modal a keyboard cannot leave, and Escape
 * alone is not enough for a touch device with a hardware keyboard attached.
 */
export function Sheet({ label, onClose, tall = false, children }: SheetProps) {
    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };

        window.addEventListener('keydown', onKey);

        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    return (
        <div className="scrim" role="dialog" aria-modal="true" aria-label={label}>
            <button
                type="button"
                className="scrim__dismiss"
                onClick={onClose}
                aria-label={`Close ${label.toLowerCase()}`}
            />
            <div className={tall ? 'sheet sheet--tall' : 'sheet'}>{children}</div>
        </div>
    );
}
