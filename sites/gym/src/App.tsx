import { useState } from 'react';

import { AccessTokenCard } from './components/AccessTokenCard';
import { AccountCard } from './components/AccountCard';
import { AuthErrorPanel } from './components/AuthErrorPanel';
import { Footer } from './components/Footer';
import { IconSprite } from './components/Icons';
import { Masthead } from './components/Masthead';
import { SettingsPanel } from './components/SettingsPanel';
import { SignedOutCard } from './components/SignedOutCard';
import { StatusLine } from './components/StatusLine';
import { TokenCard } from './components/TokenCard';
import { TokenWarning } from './components/TokenWarning';
import { useAuth, type Status } from './hooks/useAuth';
import { useTheme } from './hooks/useTheme';
import { loadConfig, saveConfig } from './lib/config';

export function App() {
    // Read once. Saving the configuration reloads the page rather than
    // re-reading it, because MSAL cannot be reconfigured after construction —
    // so this value is fixed for the life of the page and belongs in a state
    // initialiser rather than in an effect.
    const [config] = useState(loadConfig);

    const [theme, toggleTheme] = useTheme();
    const [scope, setScope] = useState(config.apiScope);
    const [localStatus, setLocalStatus] = useState<Status | null>(null);

    const auth = useAuth(config);
    const status = localStatus ?? auth.status;

    function acquire() {
        const trimmed = scope.trim();

        if (!trimmed) {
            setLocalStatus({ message: 'Enter a resource scope first.', kind: 'error' });
            document.getElementById('apiScope')?.focus();

            return;
        }

        setLocalStatus(null);

        // Remembered so a reload lands on the same request. Best-effort: a
        // browser that refuses localStorage still gets the token.
        saveConfig({ ...config, apiScope: trimmed });

        void auth.acquireToken(trimmed);
    }

    const subtitle = auth.account
        ? `Signed in as ${auth.account.username || auth.account.name || 'an account'}.`
        : 'Sign in with Entra ID and read what comes back.';

    return (
        <div className="page">
            <IconSprite />

            <Masthead
                subtitle={subtitle}
                signedIn={Boolean(auth.account)}
                signingIn={auth.signingIn}
                disabled={!auth.ready}
                theme={theme}
                onSignIn={() => { setLocalStatus(null); void auth.signIn(); }}
                onSignOut={() => { setLocalStatus(null); void auth.signOut(); }}
                onToggleTheme={toggleTheme}
            />

            <TokenWarning />
            <StatusLine status={status} />

            {auth.error ? <AuthErrorPanel error={auth.error} /> : null}

            <SettingsPanel
                config={config}
                apiScope={scope}
                onSaveFailed={(message) => setLocalStatus({ message, kind: 'error' })}
            />

            {auth.account ? (
                <>
                    <AccountCard account={auth.account} />

                    {auth.idToken ? (
                        <TokenCard title="ID token" token={auth.idToken} tabsLabel="ID token views" />
                    ) : null}

                    <AccessTokenCard
                        result={auth.accessResult}
                        scope={scope}
                        acquiring={auth.acquiring}
                        onScopeChange={setScope}
                        onAcquire={acquire}
                    />
                </>
            ) : (
                <SignedOutCard config={config} />
            )}

            <Footer />
        </div>
    );
}
