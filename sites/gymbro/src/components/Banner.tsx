interface BannerProps {
    kind: 'error' | 'notice';
    label: string;
    message: string;
    onDismiss: () => void;
}

/**
 * The one place a failure is reported.
 *
 * Sticky at the top of the window rather than floating over the middle of it:
 * on a desk the thing that just failed is usually still on screen, and covering
 * it to say so is how you lose the context that makes the message readable.
 */
export function Banner({ kind, label, message, onDismiss }: BannerProps) {
    return (
        <div className={kind === 'notice' ? 'banner banner--notice' : 'banner'} role="status">
            <p className="banner__text">
                <span className="banner__code">{label}</span>
                {message}
            </p>
            <button type="button" className="banner__close" onClick={onDismiss} aria-label="Dismiss">
                ×
            </button>
        </div>
    );
}
