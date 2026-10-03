import { useEffect, useRef, type RefObject } from 'react';

/**
 * The dialogs open right now, oldest first. Only the last one answers the
 * keyboard.
 *
 * Module-level rather than in context, because what it describes is the page:
 * sheets stack as siblings — the exercise picker over the day's plan, the
 * template sheet over the same — and none of them is the other's parent. A
 * listener per dialog that closed on every Escape was one key press closing the
 * picker *and* the plan under it.
 */
const stack: object[] = [];

/** What Tab can land on. Disabled controls and `tabindex="-1"` are skipped, as the browser skips them. */
const FOCUSABLE = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
].join(', ');

function focusablesIn(root: HTMLElement): HTMLElement[] {
    return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE))
        .filter((element) => element.getClientRects().length > 0);
}

/**
 * What every modal on both sites shares about the keyboard and focus.
 *
 * - **Escape** closes it, and only it — never the dialog underneath.
 * - **Focus moves in** on open, to `initial`: the sheet itself, or the field
 *   the next keystroke belongs in. Left behind on the page, the next Tab walks
 *   the screen the dialog is covering.
 * - **Tab stays inside** while it is the top dialog, wrapping at either end.
 *   `aria-modal` tells a screen reader the rest is inert; this is the half a
 *   keyboard needs.
 * - **Focus goes back** on close to whatever opened it, when that is still on
 *   the page, so closing a picker does not drop a keyboard user at the top of
 *   the document.
 *
 * Returns the ref for the dialog's root — the element whose controls Tab cycles
 * through, scrim included, since the scrim is a way out.
 *
 * `onClose` is read through a ref and everything registers once, on mount.
 * Re-registering whenever the callback changed identity — which an inline
 * arrow does on every render — would move a dialog to the top of the stack
 * each time its parent re-rendered, and the wrong one would close.
 */
export function useDialog<T extends HTMLElement>(
    onClose: () => void,
    initial: RefObject<HTMLElement | null>,
): RefObject<T | null> {
    const root = useRef<T | null>(null);
    const close = useRef(onClose);

    useEffect(() => { close.current = onClose; });

    useEffect(() => {
        const self = {};
        const opener = document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;

        stack.push(self);

        // Without scrolling: the sheet is already where it belongs, and a
        // focus that scrolls would jolt a list the user is about to read.
        initial.current?.focus({ preventScroll: true });

        function onKey(event: KeyboardEvent) {
            if (stack[stack.length - 1] !== self) return;

            // A control inside that already used the key — the stepper's
            // keypad, which Escape closes — has said so by preventing it.
            if (event.key === 'Escape' && !event.defaultPrevented) {
                close.current();

                return;
            }

            if (event.key !== 'Tab' || !root.current) return;

            const controls = focusablesIn(root.current);
            const first = controls[0];
            const last = controls[controls.length - 1];
            const active = document.activeElement;
            const inside = active instanceof Node && root.current.contains(active);

            if (!first || !last) {
                event.preventDefault();

                return;
            }

            // Only the ends need help: between them the browser's own order is
            // already the dialog's. Focus that somehow got outside comes back.
            if (event.shiftKey && (active === first || !inside)) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && (active === last || !inside)) {
                event.preventDefault();
                first.focus();
            }
        }

        window.addEventListener('keydown', onKey);

        return () => {
            window.removeEventListener('keydown', onKey);
            stack.splice(stack.indexOf(self), 1);

            // Not to an opener that went with the dialog — a row re-keyed by
            // the edit just saved, or a screen that changed under it.
            if (opener?.isConnected) opener.focus({ preventScroll: true });
        };
    // `initial` is a ref, read once on open; see above for `onClose`.
    }, []);

    return root;
}
