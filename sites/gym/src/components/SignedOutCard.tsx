import type { InspectorConfig } from '../lib/config';

export function SignedOutCard({ config }: { config: InspectorConfig }) {
    return (
        <section className="card">
            <div className="card-head"><h2>Not signed in</h2></div>
            <p className="hint">
                Press <strong>Sign in</strong>. The page runs the authorization code flow with
                PKCE against Entra ID and prints the tokens it gets back — the ID token always,
                and an access token for whatever resource scope you ask for.
            </p>
            <p className="hint">
                Signing in as <code>{config.clientId}</code> against tenant{' '}
                <code>{config.tenant}</code>. Both are editable under{' '}
                <strong>Configuration</strong> above.
            </p>
        </section>
    );
}
