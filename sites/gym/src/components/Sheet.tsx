import { useRef, type ReactNode } from 'react';

import { useDialog } from '../hooks/useDialog';

interface SheetProps {
    /** Named for assistive technology; the visible title is inside `children`. */
    label: string;
    onClose: () => void;

    /**
     * For a sheet that lays out its own scrolling: no padding, nothing clipped
     * to scroll, and `children` bring a fixed head and a list that scrolls
     * under it (the exercise picker). Flat content passed with this set has no
     * scroll at all — whatever is past the bottom is simply cut off.
     */
    tall?: boolean;
    children: ReactNode;
}

/**
 * The bottom sheet every modal is built from. It rises from the bottom because
 * that is where the thumb is. The scrim is a button rather than a div with an
 * onClick: a tap-to-dismiss target a keyboard cannot reach is a modal a
 * keyboard cannot leave.
 *
 * Focus opens on the sheet itself rather than its first control. On a phone the
 * first control is often a search field, and focusing it would throw the
 * keyboard up over the list before anything was asked of it; elsewhere it is a
 * button, and Enter on a sheet just opened should not press something unread.
 * The next Tab from the sheet reaches its first control anyway.
 */
export function Sheet({ label, onClose, tall = false, children }: SheetProps) {
    const sheet = useRef<HTMLDivElement>(null);

    // Escape closes the top sheet only, focus moves in and comes back, and Tab
    // stays inside; see `useDialog`.
    const root = useDialog<HTMLDivElement>(onClose, sheet);

    return (
        <div className="scrim" role="dialog" aria-modal="true" aria-label={label} ref={root}>
            <button
                type="button"
                className="scrim__dismiss"
                onClick={onClose}
                aria-label={`Close ${label.toLowerCase()}`}
            />
            <div className={tall ? 'sheet sheet--tall' : 'sheet'} ref={sheet} tabIndex={-1}>
                {children}
            </div>
        </div>
    );
}
