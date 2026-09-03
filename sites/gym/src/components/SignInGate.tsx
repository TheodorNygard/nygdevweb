import type { AuthErrorDetail } from '../lib/errors';

interface SignInGateProps {
    signingIn: boolean;
    error: AuthErrorDetail | null;
    onSignIn: () => void;
}

/**
 * Everything in this app is one user's training log, and the user *is* the
 * token — nothing takes a user id, and the Entra object id off the validated
 * principal is the Cosmos partition key. So there is nothing to show before
 * sign-in, and this screen does not pretend otherwise with a preview.
 *
 * The error block is the reason this is a screen rather than a button. The
 * failures here are setup failures, and each one has a fix that is a specific
 * thing to do in the portal; printing the AADSTS code with that fix next to it
 * is the difference between a five-minute problem and an afternoon.
 */
export function SignInGate({ signingIn, error, onSignIn }: SignInGateProps) {
    return (
        <div className="gate">
            <span className="gate__mark">GYMLOG</span>
            <h1 className="gate__title">Your training block, one tap per set.</h1>
            <p className="gate__body">
                Sign in with the Entra ID account the log belongs to. Everything you log is stored
                against that account and nothing else identifies you.
            </p>

            {error ? (
                <div className="gate__error">
                    <span className="gate__error-code">{error.code}</span>
                    <p className="gate__error-text">{error.message}</p>
                    {error.fix ? <p className="gate__error-fix">{error.fix}</p> : null}
                </div>
            ) : null}

            <div className="gate__actions">
                <button type="button" className="primary" onClick={onSignIn} disabled={signingIn}>
                    {signingIn ? 'Opening Entra ID…' : 'Sign in'}
                </button>
            </div>
        </div>
    );
}
