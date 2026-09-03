import { useEffect, type ReactNode } from 'react';

interface SheetProps {
    /** Named for assistive technology; the visible title is inside `children`. */
    label: string;
    onClose: () => void;
    tall?: boolean;
    children: ReactNode;
}

/**
 * The bottom sheet every modal is built from. It rises from the bottom because
 * that is where the thumb is. The scrim is a button rather than a div with an
 * onClick: a tap-to-dismiss target a keyboard cannot reach is a modal a
 * keyboard cannot leave.
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
