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
 * The one place a failure or a resync is reported. It floats over the screen
 * rather than pushing it down: the message usually arrives while a thumb is on
 * the Log button, and reflowing under it is how you log a set you did not mean
 * to.
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
