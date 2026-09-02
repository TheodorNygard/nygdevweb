import type { AuthErrorDetail } from '../lib/errors';

// An auth failure explains itself in place. The AADSTS code is the only part
// worth searching for, so it gets its own line.
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
