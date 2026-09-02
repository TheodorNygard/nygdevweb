import { useEffect, useRef, useState, type RefObject } from 'react';

interface CopyButtonProps {
    label?: string;
    value: string;
    // What to select when the clipboard is unavailable, so "Press Ctrl/Cmd+C"
    // is an instruction the reader can actually follow rather than a shrug.
    fallbackTarget?: RefObject<HTMLElement | null>;
}

function selectContents(node: HTMLElement): void {
    if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) {
        node.select();

        return;
    }

    const range = document.createRange();

    range.selectNodeContents(node);

    const selection = window.getSelection();

    selection?.removeAllRanges();
    selection?.addRange(range);
}

// The clipboard API needs a secure context and a user gesture; both hold here.
// The fallback selects rather than calling the deprecated document.execCommand,
// which on a token this long was never reliable anyway.
export function CopyButton({ label = 'Copy', value, fallbackTarget }: CopyButtonProps) {
    const [feedback, setFeedback] = useState<string | null>(null);
    const timer = useRef<number | null>(null);

    useEffect(() => () => {
        if (timer.current !== null) window.clearTimeout(timer.current);
    }, []);

    async function copy() {
        try {
            await navigator.clipboard.writeText(value);
            setFeedback('Copied');
        } catch {
            setFeedback('Press Ctrl/Cmd+C');

            const target = fallbackTarget?.current;

            if (target) selectContents(target);
        }

        if (timer.current !== null) window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setFeedback(null), 1800);
    }

    return (
        <button className="ghost" type="button" onClick={() => void copy()}>
            {feedback ?? label}
        </button>
    );
}
