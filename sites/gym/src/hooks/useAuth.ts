import { useCallback, useEffect, useRef, useState } from 'react';
import {
    InteractionRequiredAuthError,
    type AccountInfo,
    type AuthenticationResult,
    type IPublicClientApplication,
} from '@azure/msal-browser';

import { describeAuthError, type AuthErrorDetail } from '../lib/errors';
import { REDIRECT_HANDLING, getMsalInstance } from '../lib/msal';
import { scopeList, type InspectorConfig } from '../lib/config';

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

    // Not state: it never changes for the life of the page (saving the
    // configuration reloads instead), and state would re-render every consumer
    // the moment it resolved.
    const pcaRef = useRef<IPublicClientApplication | null>(null);

    // One place that turns an AuthenticationResult into what is on screen, so
    // the redirect and popup paths cannot drift apart.
    const handleResult = useCallback((pca: IPublicClientApplication, result: AuthenticationResult) => {
        if (result.account) {
            pca.setActiveAccount(result.account);
            setAccount(result.account);
        }

        if (result.idToken) setIdToken(result.idToken);

        // A login response carries an access token too, but for the sign-in
        // scopes rather than for an API. Rendering it would make both token
        // panels two views of the same uninteresting thing.
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

                // Must run before anything reads the account list: coming back
                // from a redirect, this is what consumes the response in the
                // URL fragment. Skipping it leaves the token in the address bar
                // and the page looking signed out.
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

                // Only the claims are on the account object, not the raw JWT,
                // and re-deriving it would mean a network call. The panel stays
                // closed until a sign-in produces one from *this* session.
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

            // Always show the picker: on a page for comparing tokens, silently
            // reattaching to an hour-old account is the wrong default, and
            // "Switch account" has to actually switch.
            prompt: 'select_account',
        };

        try {
            if (config.interaction === 'popup') {
                handleResult(pca, await pca.loginPopup(request));
                setStatus({ message: 'Signed in.', kind: 'success' });
            } else {
                // Does not return: the browser navigates away. Anything below
                // runs only if the redirect failed to start.
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
            // InteractionRequiredAuthError is expected: it is how Entra says
            // "ask the user something". Anything else is a real failure, and
            // retrying it interactively would only put a login screen in front
            // of the same error.
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
