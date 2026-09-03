import { useCallback, useEffect, useRef, useState } from 'react';
import {
    InteractionRequiredAuthError,
    type AccountInfo,
    type AuthenticationResult,
    type IPublicClientApplication,
} from '@azure/msal-browser';

import { API_SCOPE, LOGIN_SCOPES } from '../lib/config';
import { describeAuthError, type AuthErrorDetail } from '../lib/errors';
import { REDIRECT_HANDLING, getMsalInstance } from '../lib/msal';

export interface AuthState {
    /** MSAL has initialised and any redirect response has been consumed. */
    ready: boolean;
    account: AccountInfo | null;
    error: AuthErrorDetail | null;
    signingIn: boolean;
}

export interface AuthActions {
    signIn: () => void;
    signOut: () => void;

    /**
     * An access token for the API, from the MSAL cache when it can be. Stable
     * across renders, so the API client can be constructed once.
     */
    getToken: () => Promise<string>;
    dismissError: () => void;
}

export function useAuth(): AuthState & AuthActions {
    const [ready, setReady] = useState(false);
    const [account, setAccount] = useState<AccountInfo | null>(null);
    const [error, setError] = useState<AuthErrorDetail | null>(null);
    const [signingIn, setSigningIn] = useState(false);

    // Not state: it never changes for the life of the page, and state would
    // re-render every consumer the moment it resolved.
    const pcaRef = useRef<IPublicClientApplication | null>(null);

    // Read inside getToken, which has to keep a stable identity — depending on
    // the account value would rebuild the API client on every sign-in and
    // restart every screen's data load with it.
    const accountRef = useRef<AccountInfo | null>(null);

    const adopt = useCallback((pca: IPublicClientApplication, next: AccountInfo) => {
        pca.setActiveAccount(next);
        accountRef.current = next;
        setAccount(next);
    }, []);

    useEffect(() => {
        let cancelled = false;

        void (async () => {
            try {
                const pca = await getMsalInstance();

                if (cancelled) return;

                pcaRef.current = pca;

                // Must run before anything reads the account list: coming back
                // from a redirect, this is what consumes the response in the
                // URL fragment. Skipping it leaves the token in the address bar
                // and the app looking signed out.
                const redirected: AuthenticationResult | null =
                    await pca.handleRedirectPromise(REDIRECT_HANDLING);

                if (cancelled) return;

                const next = redirected?.account
                    ?? pca.getActiveAccount()
                    ?? pca.getAllAccounts()[0]
                    ?? null;

                if (next) adopt(pca, next);
            } catch (cause) {
                if (!cancelled) setError(describeAuthError(cause));
            } finally {
                if (!cancelled) setReady(true);
            }
        })();

        return () => { cancelled = true; };
    }, [adopt]);

    const signIn = useCallback(() => {
        const pca = pcaRef.current;

        if (!pca) return;

        setError(null);
        setSigningIn(true);

        // Redirect rather than popup: an iOS home-screen app has no popup to
        // open. The API scope rides along with the sign-in scopes so one round
        // trip produces both the session and a token for the API.
        void pca
            .loginRedirect({ scopes: [...LOGIN_SCOPES, API_SCOPE] })
            .catch((cause: unknown) => {
                setError(describeAuthError(cause));
                setSigningIn(false);
            });
    }, []);

    const signOut = useCallback(() => {
        const pca = pcaRef.current;

        if (!pca) return;

        const active = accountRef.current;

        accountRef.current = null;
        setAccount(null);

        void pca
            .logoutRedirect(active ? { account: active } : {})
            .catch((cause: unknown) => setError(describeAuthError(cause)));
    }, []);

    const getToken = useCallback(async (): Promise<string> => {
        const pca = pcaRef.current;

        if (!pca) throw new Error('Sign-in is not ready yet.');

        const current = accountRef.current;

        if (!current) throw new Error('No signed-in account.');

        const request = { scopes: [API_SCOPE], account: current };

        try {
            const result = await pca.acquireTokenSilent(request);

            return result.accessToken;
        } catch (cause) {
            // InteractionRequiredAuthError is how Entra says "ask the user
            // something" — consent, MFA, Conditional Access, or an expired
            // refresh token. It is the one failure worth answering with a
            // redirect; anything else would put a sign-in screen in front of
            // the same error.
            if (cause instanceof InteractionRequiredAuthError) {
                // Does not return: the browser navigates away and the app
                // reloads into handleRedirectPromise above.
                await pca.acquireTokenRedirect(request);

                throw cause;
            }

            setError(describeAuthError(cause));

            throw cause;
        }
    }, []);

    const dismissError = useCallback(() => setError(null), []);

    return { ready, account, error, signingIn, signIn, signOut, getToken, dismissError };
}
