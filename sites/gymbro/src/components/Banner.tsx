export interface BannerAction {
    label: string;
    busy: boolean;
    onClick: () => void;
}

interface BannerProps {
    kind: 'error' | 'notice';
    label: string;
    message: string;

    /**
     * Offered under the message when the failure has an answer that is one tap
     * rather than a paragraph. Most do not, and a button that only re-runs what
     * just failed is worse than none.
     */
    action?: BannerAction | null;
    onDismiss: () => void;
}

/**
 * The one place a failure is reported.
 *
 * Sticky at the top of the window rather than floating over the middle of it:
 * on a desk the thing that just failed is usually still on screen, and covering
 * it to say so is how you lose the context that makes the message readable.
 */
export function Banner({ kind, label, message, action, onDismiss }: BannerProps) {
    return (
        <div className={kind === 'notice' ? 'banner banner--notice' : 'banner'} role="status">
            <div className="banner__body">
                <p className="banner__text">
                    <span className="banner__code">{label}</span>
                    {message}
                </p>

                {action ? (
                    <button
                        type="button"
                        className="banner__action"
                        onClick={action.onClick}
                        disabled={action.busy}
                    >
                        {action.label}
                    </button>
                ) : null}
            </div>
            <button type="button" className="banner__close" onClick={onDismiss} aria-label="Dismiss">
                ×
            </button>
        </div>
    );
}
