import { type AuthErrorDetail } from '../lib/gym';

interface SignInGateProps {
    signingIn: boolean;
    error: AuthErrorDetail | null;
    onSignIn: () => void;
}

/**
 * The user *is* the token: nothing takes a user id, and the Entra object id off
 * the validated principal is the Cosmos partition key. So there is nothing to
 * show before sign-in, and no preview pretends otherwise.
 *
 * The error block is why this is a screen rather than a button. These are setup
 * failures — and on this site most often the one setup failure specific to it,
 * a redirect URI that was registered for the logger's origin and not this one.
 * Printing the AADSTS code with its fix is the difference between a five-minute
 * problem and an afternoon.
 */
export function SignInGate({ signingIn, error, onSignIn }: SignInGateProps) {
    return (
        <div className="gate">
            <span className="gate__mark">
                <span className="rail__glyph">G</span>
                gymbro
            </span>
            <h1 className="gate__title">Plan the block here. Log it on the phone.</h1>
            <p className="gate__body">
                Sign in with the Entra ID account the log belongs to — the same one gym.nygard.dev
                uses, because it is the same training and the same store behind it.
            </p>

            {error ? (
                <div className="gate__error">
                    <span className="gate__error-code">{error.code}</span>
                    <p className="gate__error-text">{error.message}</p>
                    {error.fix ? <p className="gate__error-fix">{error.fix}</p> : null}
                </div>
            ) : null}

            <div className="gate__actions">
                <button
                    type="button"
                    className="primary primary--tall"
                    onClick={onSignIn}
                    disabled={signingIn}
                >
                    {signingIn ? 'Opening Entra ID…' : 'Sign in'}
                </button>
            </div>
        </div>
    );
}
