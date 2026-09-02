import type { AuthErrorDetail } from '../lib/errors';

// An auth failure explains itself in place, the way the run dashboard's load
// error does: the AADSTS code is the only part worth searching for, so it is
// shown on its own line rather than buried in the sentence.
export function AuthErrorPanel({ error }: { error: AuthErrorDetail }) {
    return (
        <section className="auth-error" aria-live="polite">
            <h2>Sign-in failed</h2>
            <dl>
                <dt>Error</dt>
                <dd className="mono">{error.code}</dd>

                <dt>Message</dt>
                <dd>{error.message}</dd>

                {error.correlationId ? (
                    <>
                        <dt>Correlation ID</dt>
                        <dd className="mono">{error.correlationId}</dd>
                    </>
                ) : null}
            </dl>
            {error.fix ? <p className="fix">{error.fix}</p> : null}
        </section>
    );
}
