import type { HandleProps } from '../hooks/useDragReorder';

interface DragHandleProps extends HandleProps {
    label: string;
}

/**
 * The grip a row is picked up by. Six dots rather than a hamburger or an
 * arrow pair, because it is the shape a thumb already reads as "drag this"
 * on a phone, and it draws in CSS rather than as an icon font dependency.
 *
 * `touch-action: none` is load-bearing: without it, the first pointermove of
 * a drag is also interpreted as a scroll gesture by the browser, and the row
 * follows the finger for one frame before the page yanks it back.
 */
export function DragHandle({ label, ...handle }: DragHandleProps) {
    return (
        <button
            type="button"
            className="draghandle"
            aria-label={`Reorder ${label}. Drag, or use the arrow keys.`}
            {...handle}
        >
            <span className="draghandle__grid">
                <span />
                <span />
                <span />
                <span />
                <span />
                <span />
            </span>
        </button>
    );
}
