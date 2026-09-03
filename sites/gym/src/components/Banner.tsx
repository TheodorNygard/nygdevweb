interface BannerProps {
    kind: 'error' | 'notice';
    label: string;
    message: string;
    onDismiss: () => void;
}

/**
 * The one place a failure or a resync is reported.
 *
 * It floats over the screen rather than pushing it down: the message usually
 * arrives while a thumb is on the Log button, and reflowing the page under it
 * is how you log a set you did not mean to.
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
