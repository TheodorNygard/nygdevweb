import { useEffect, useRef } from 'react';

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

/**
 * What every modal on both sites shares about the keyboard: Escape closes it,
 * and only it — never the dialog underneath.
 *
 * `onClose` is read through a ref and the registration happens once, on mount.
 * Re-registering whenever the callback changed identity — which an inline
 * arrow does on every render — would move a dialog to the top of the stack
 * each time its parent re-rendered, and the wrong one would close.
 */
export function useDialog(onClose: () => void): void {
    const close = useRef(onClose);

    useEffect(() => { close.current = onClose; });

    useEffect(() => {
        const self = {};

        stack.push(self);

        function onKey(event: KeyboardEvent) {
            if (stack[stack.length - 1] !== self) return;

            // A control inside that already used the key — the stepper's
            // keypad, which Escape closes — has said so by preventing it.
            if (event.key === 'Escape' && !event.defaultPrevented) close.current();
        }

        window.addEventListener('keydown', onKey);

        return () => {
            window.removeEventListener('keydown', onKey);
            stack.splice(stack.indexOf(self), 1);
        };
    }, []);
}
