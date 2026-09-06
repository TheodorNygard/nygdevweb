import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export interface RowProps {
    /** Attach to the row's own ref, so a drag can measure and translate it. */
    ref: (element: HTMLElement | null) => void;
    style: { transform?: string; transition?: string; zIndex?: number };
    className?: string;
}

export interface HandleProps {
    onPointerDown: (event: React.PointerEvent) => void;
    onKeyDown: (event: React.KeyboardEvent) => void;
    'aria-roledescription': string;
}

/**
 * Reordering a vertical list by dragging a handle, with the buttons and
 * steppers inside each row left free to receive their own taps.
 *
 * The technique is the standard one for a short, all-visible list: rows stay
 * put in the DOM and the one being carried is moved with `transform:
 * translateY`, not by re-sorting on every pixel of movement. Re-sorting mid
 * drag would remount whatever the touch started on, including an open logger
 * on this screen, and losing that mid-set is worse than a reorder that
 * visually settles a frame late. `onReorder` fires exactly once, on release,
 * with the two indices the caller already knows how to act on: a local array
 * splice, or an API call, or both.
 *
 * Pointer Events rather than the HTML5 drag API, because HTML5 drag has no
 * touch story and this app has no cursor to speak of. Pointer capture is what
 * keeps a finger that wanders off the handle still driving the drag rather
 * than losing it to whatever it crossed onto.
 *
 * The handle is also a keyboard control: Up and Down move the row one step
 * and commit immediately, Home and End move it to either end. A drag has no
 * keyboard equivalent otherwise, and a reorderable list with no keyboard path
 * is one that screen reader and switch control users cannot use at all.
 */
export function useDragReorder(
    count: number,
    onReorder: (from: number, to: number) => void,
): {
    /** Props for the row at this index. Spread onto the element that moves. */
    rowProps: (index: number) => RowProps;

    /** Props for that row's drag handle. */
    handleProps: (index: number) => HandleProps;

    /** The row currently being carried, or null when nothing is dragging. */
    draggingIndex: number | null;
} {
    const rows = useRef<Map<number, HTMLElement>>(new Map());

    // Everything about the drag in progress, held in a ref rather than state:
    // it is written on every pointermove, and a render on every pixel of
    // finger travel is the stutter this technique exists to avoid. `over` is
    // mirrored into state below, because that only needs to change when the
    // drag crosses a row boundary, a few times a drag rather than every frame.
    const drag = useRef<{
        pointerId: number;
        from: number;
        startY: number;
        rowHeight: number;
    } | null>(null);

    // Which row is being carried and where it is hovering — and deliberately
    // *not* how far the finger has moved. That is what keeps the promise
    // above: the offset changes on every frame, so it is written straight onto
    // the carried element by `carry` below, and this state changes only when
    // the drag crosses a slot boundary. On this screen a render is the whole
    // entry list, open logger and steppers included.
    const [visual, setVisual] = useState<{ from: number; over: number } | null>(null);

    // Where the carried row is hovering, readable from `end` without going
    // through a state updater. Committing from inside `setVisual`'s updater
    // would fire `onReorder` twice under StrictMode, which double-invokes
    // updaters — and the second call would move whatever the first had just
    // put at `from`.
    const over = useRef<number | null>(null);

    const setRow = useCallback((index: number, element: HTMLElement | null) => {
        if (element) rows.current.set(index, element);
        else rows.current.delete(index);
    }, []);

    // `onReorder` is an inline closure at nearly every call site, so it is a
    // fresh identity on every render of the caller. Reading it through a ref
    // instead of closing over the prop directly is what keeps `end` — and
    // everything downstream of it, down to the window listeners `start`
    // registers — stable across a drag. Without this, the first `setVisual`
    // a drag causes re-renders the caller, which mints a new `onReorder`,
    // which changes `end`'s identity, which tears down and re-adds the very
    // listeners that render was still in the middle of using: a drag that
    // dies after one pixel of movement, silently, because the pointermove
    // listener it needs was just removed out from under it.
    const onReorderRef = useRef(onReorder);
    onReorderRef.current = onReorder;

    /**
     * Puts the carried row under the finger, without a render.
     *
     * React never writes a transform onto this row — `rowProps` leaves the
     * property off the active row precisely so this can own it — which is also
     * why it has to be cleared by hand when the drag ends: React only removes
     * style properties it set itself.
     */
    const carry = useCallback((index: number, deltaY: number | null) => {
        const row = rows.current.get(index);

        if (row) row.style.transform = deltaY === null ? '' : `translateY(${deltaY}px)`;
    }, []);

    const end = useCallback((commit: boolean) => {
        const active = drag.current;
        const landed = over.current;

        drag.current = null;
        over.current = null;

        if (active) carry(active.from, null);

        setVisual(null);

        if (commit && active && landed !== null && landed !== active.from) {
            onReorderRef.current(active.from, landed);
        }
    }, [carry]);

    const handlePointerMove = useCallback((event: PointerEvent) => {
        const active = drag.current;

        if (!active || event.pointerId !== active.pointerId || active.rowHeight <= 0) return;

        const deltaY = event.clientY - active.startY;

        carry(active.from, deltaY);

        // Rounding to whole rows is what makes the list feel like slots rather
        // than a free floating stack: the carried row snaps to where it would
        // land, which is the only outcome a release can ever produce.
        const shift = Math.round(deltaY / active.rowHeight);
        const slot = Math.min(count - 1, Math.max(0, active.from + shift));

        if (over.current === slot) return;

        over.current = slot;
        setVisual({ from: active.from, over: slot });
    }, [carry, count]);

    const handlePointerUp = useCallback((event: PointerEvent) => {
        if (drag.current?.pointerId !== event.pointerId) return;

        end(true);
    }, [end]);

    const handlePointerCancel = useCallback((event: PointerEvent) => {
        if (drag.current?.pointerId !== event.pointerId) return;

        end(false);
    }, [end]);

    const stop = useCallback(() => {
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
        window.removeEventListener('pointercancel', handlePointerCancel);
    }, [handlePointerMove, handlePointerUp, handlePointerCancel]);

    const start = useCallback((index: number, event: React.PointerEvent) => {
        const row = rows.current.get(index);

        if (!row) return;

        // Stops a click from firing on release, since this is a drag rather
        // than a tap, and stops the page scrolling under a finger that is
        // already busy carrying a row. `touch-action: none` on the handle
        // covers the CSS half of that; this covers the JS half for a pointer
        // already in flight.
        event.preventDefault();

        const style = window.getComputedStyle(row.parentElement ?? row);
        const gap = Number.parseFloat(style.rowGap || style.gap || '0') || 0;

        drag.current = {
            pointerId: event.pointerId,
            from: index,
            startY: event.clientY,
            rowHeight: row.getBoundingClientRect().height + gap,
        };

        over.current = index;
        setVisual({ from: index, over: index });

        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', handlePointerUp);
        window.addEventListener('pointercancel', handlePointerCancel);
    }, [handlePointerMove, handlePointerUp, handlePointerCancel]);

    const rowProps = useCallback((index: number): RowProps => {
        if (!visual) {
            return { ref: (element) => setRow(index, element), style: {} };
        }

        const { from, over } = visual;

        if (index === from) {
            // No transform here on purpose — `carry` writes it straight onto
            // the element on every pointermove, and naming it in this object
            // too would have React reset it to a stale offset on the next
            // render.
            return {
                ref: (element) => setRow(index, element),
                style: { zIndex: 2 },
                className: 'dragrow--active',
            };
        }

        // A row between the carried one and where it is hovering shifts by one
        // slot, to open the gap the carried row is about to drop into. Rows
        // outside that span do not move at all.
        const between = from < over
            ? index > from && index <= over
            : index < from && index >= over;

        if (!between) {
            return { ref: (element) => setRow(index, element), style: {} };
        }

        const towards = from < over ? -1 : 1;

        return {
            ref: (element) => setRow(index, element),
            style: {
                transform: `translateY(${towards * (drag.current?.rowHeight ?? 0)}px)`,
                transition: 'transform 160ms ease',
            },
        };
    }, [visual, setRow]);

    const handleProps = useCallback((index: number): HandleProps => ({
        onPointerDown: (event) => { start(index, event); },
        onKeyDown: (event) => {
            if (event.key === 'ArrowUp' && index > 0) {
                event.preventDefault();
                onReorder(index, index - 1);
            } else if (event.key === 'ArrowDown' && index < count - 1) {
                event.preventDefault();
                onReorder(index, index + 1);
            } else if (event.key === 'Home' && index > 0) {
                event.preventDefault();
                onReorder(index, 0);
            } else if (event.key === 'End' && index < count - 1) {
                event.preventDefault();
                onReorder(index, count - 1);
            }
        },
        'aria-roledescription': 'draggable',
    }), [count, onReorder, start]);

    // Only reached if this hook's owner unmounts mid drag rather than the
    // pointer ever going up — a screen navigated away from while carrying a
    // row. Without this the window listeners from `start` would outlive it.
    useEffect(() => stop, [stop]);

    return useMemo(() => ({
        rowProps,
        handleProps,
        draggingIndex: visual?.from ?? null,
    }), [rowProps, handleProps, visual]);
}

/**
 * Standard array-move semantics, matching both this hook and the server's own
 * move: `to` is the index the item lands at in the result, so it is spliced
 * out first and spliced back in, not swapped with whatever was at `to`.
 */
export function reordered<T>(items: readonly T[], from: number, to: number): T[] {
    const next = items.slice();
    const [moved] = next.splice(from, 1);

    if (moved === undefined) return next;

    next.splice(to, 0, moved);

    return next;
}
