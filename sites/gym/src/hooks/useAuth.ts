import { useCallback, useEffect, useRef, useState } from 'react';
import {
    InteractionRequiredAuthError,
    type AccountInfo,
    type AuthenticationResult,
    type IPublicClientApplication,
} from '@azure/msal-browser';

import { describeAuthError, type AuthErrorDetail } from '../lib/errors';
import { REDIRECT_HANDLING, getMsalInstance } from '../lib/msal';
import { saveConfig, scopeList, type InspectorConfig } from '../lib/config';

export type StatusKind = 'working' | 'success' | 'error';

export interface Status {
    message: string;
    kind: StatusKind;
}

export interface AuthState {
    ready: boolean;
    account: AccountInfo | null;
    idToken: string | null;
    accessResult: AuthenticationResult | null;
    status: Status | null;
    error: AuthErrorDetail | null;
    signingIn: boolean;
    acquiring: boolean;
}

export interface AuthActions {
    signIn: () => Promise<void>;
    signOut: () => Promise<void>;
    acquireToken: (scope: string) => Promise<void>;
}

export function useAuth(config: InspectorConfig): AuthState & AuthActions {
    const [ready, setReady] = useState(false);
    const [account, setAccount] = useState<AccountInfo | null>(null);
    const [idToken, setIdToken] = useState<string | null>(null);
    const [accessResult, setAccessResult] = useState<AuthenticationResult | null>(null);
    const [status, setStatus] = useState<Status | null>(null);
    const [error, setError] = useState<AuthErrorDetail | null>(null);
    const [signingIn, setSigningIn] = useState(false);
    const [acquiring, setAcquiring] = useState(false);

    // The instance itself is not state: it never changes for the life of the
    // page (saving the configuration reloads instead), and putting it in state
    // would re-render every consumer the moment it resolved.
    const pcaRef = useRef<IPublicClientApplication | null>(null);

    // One place that turns an AuthenticationResult into what is on screen, so
    // a result arriving from a redirect and one arriving from a popup are
    // rendered by the same code rather than by two that drift.
    const handleResult = useCallback((pca: IPublicClientApplication, result: AuthenticationResult) => {
        if (result.account) {
            pca.setActiveAccount(result.account);
            setAccount(result.account);
        }

        if (result.idToken) setIdToken(result.idToken);

        // A login response carries an access token too, but for the sign-in
        // scopes rather than for an API. Only render it when the scopes asked
        // for are the resource scopes, or the ID token panel and the access
        // token panel end up showing two views of the same uninteresting thing.
        const scopes = result.scopes ?? [];
        const isResourceToken = scopes.some((scope) => scope.includes('/') || scope.startsWith('api://'));

        if (result.accessToken && isResourceToken) setAccessResult(result);
    }, []);

    const fail = useCallback((cause: unknown, message: string) => {
        setError(describeAuthError(cause));
        setStatus({ message, kind: 'error' });
    }, []);

    useEffect(() => {
        let cancelled = false;

        void (async () => {
            try {
                const pca = await getMsalInstance(config);

                if (cancelled) return;

                pcaRef.current = pca;
                setReady(true);

                // Must run before anything reads the account list. Coming back
                // from a redirect, this is the call that consumes the response
                // in the URL fragment and turns it into an
                // AuthenticationResult; skipping it leaves the token in the
                // address bar and the page looking signed out.
                const redirectResult = await pca.handleRedirectPromise(REDIRECT_HANDLING);

                if (cancelled) return;

                if (redirectResult) {
                    handleResult(pca, redirectResult);
                    setStatus({ message: 'Signed in.', kind: 'success' });

                    return;
                }

                const accounts = pca.getAllAccounts();
                const restored = pca.getActiveAccount() ?? accounts[0] ?? null;

                if (!restored) return;

                pca.setActiveAccount(restored);
                setAccount(restored);

                // The ID token is not on the account object, only its claims
                // are. Re-deriving the raw JWT would mean a network call, so
                // the panel stays closed until a sign-in produces one — which
                // is the honest state: this is the token from *this* session.
                setStatus({
                    message: 'Restored a session from this tab. Sign in again to see a fresh ID token.',
                    kind: 'success',
                });
            } catch (cause) {
                if (!cancelled) fail(cause, 'Could not start MSAL.');
            }
        })();

        return () => { cancelled = true; };
    }, [config, handleResult, fail]);

    const signIn = useCallback(async () => {
        const pca = pcaRef.current;

        if (!pca) return;

        setError(null);
        setStatus({
            message: config.interaction === 'popup'
                ? 'Opening the Entra ID sign-in window…'
                : 'Redirecting to Entra ID…',
            kind: 'working',
        });
        setSigningIn(true);

        const request = {
            scopes: scopeList(config.loginScopes),

            // Always show the account picker. On a page whose job is comparing
            // tokens, being silently reattached to the account from an hour
            // ago is the wrong default — "Switch account" has to actually
            // switch.
            prompt: 'select_account',
        };

        try {
            if (config.interaction === 'popup') {
                handleResult(pca, await pca.loginPopup(request));
                setStatus({ message: 'Signed in.', kind: 'success' });
            } else {
                // Does not return: the browser navigates away. Anything after
                // this line runs only if the redirect failed to start.
                await pca.loginRedirect(request);
            }
        } catch (cause) {
            fail(cause, 'Sign-in failed.');
        } finally {
            setSigningIn(false);
        }
    }, [config, handleResult, fail]);

    const signOut = useCallback(async () => {
        const pca = pcaRef.current;

        if (!pca) return;

        setError(null);
        setStatus({ message: 'Signing out…', kind: 'working' });

        const request = account ? { account } : {};

        try {
            if (config.interaction === 'popup') {
                await pca.logoutPopup(request);
                setAccount(null);
                setIdToken(null);
                setAccessResult(null);
                setStatus({ message: 'Signed out.', kind: 'success' });
            } else {
                await pca.logoutRedirect(request);
            }
        } catch (cause) {
            fail(cause, 'Sign-out failed.');
        }
    }, [account, config.interaction, fail]);

    const acquireToken = useCallback(async (scope: string) => {
        const pca = pcaRef.current;

        if (!pca) return;

        setError(null);
        setAcquiring(true);
        setStatus({ message: `Requesting a token for ${scope}…`, kind: 'working' });

        const request = { scopes: [scope], ...(account ? { account } : {}) };

        try {
            const result = await pca.acquireTokenSilent(request);

            setAccessResult(result);
            setStatus({
                message: result.fromCache
                    ? 'Token served from the MSAL cache — no network call.'
                    : 'Token acquired silently.',
                kind: 'success',
            });
        } catch (cause) {
            // InteractionRequiredAuthError is the expected failure, not an
            // exceptional one: it is how Entra says "ask the user something".
            // Any other error is a real problem and is reported rather than
            // retried, because retrying interactively would just show the same
            // failure with a login screen in front of it.
            if (!(cause instanceof InteractionRequiredAuthError)) {
                fail(cause, 'Could not get a token.');
                setAcquiring(false);

                return;
            }

            setStatus({ message: 'Silent request needs interaction — prompting…', kind: 'working' });

            try {
                if (config.interaction === 'popup') {
                    setAccessResult(await pca.acquireTokenPopup(request));
                    setStatus({ message: 'Token acquired interactively.', kind: 'success' });
                } else {
                    await pca.acquireTokenRedirect(request);
                }
            } catch (interactiveCause) {
                fail(interactiveCause, 'Could not get a token.');
            }
        } finally {
            setAcquiring(false);
        }
    }, [account, config.interaction, fail]);

    return {
        ready,
        account,
        idToken,
        accessResult,
        status,
        error,
        signingIn,
        acquiring,
        signIn,
        signOut,
        acquireToken,
    };
}

// The scope the page last asked for is remembered so a reload lands on the
// same request. It is the one setting the page writes outside the settings
// form, which is why it is here rather than in the form's own handler.
export function rememberScope(config: InspectorConfig, scope: string): void {
    saveConfig({ ...config, apiScope: scope });
}
