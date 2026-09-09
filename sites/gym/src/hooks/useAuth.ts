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
     * Get a token by going to Entra, for a session that is already signed in.
     *
     * The way out of a silent renewal that cannot work rather than one that was
     * refused: a third-party cookie blocked for `login.microsoftonline.com`, a
     * CSP that will not let the renewal iframe land back on `/auth.html`, an
     * iframe that timed out. None of those are `InteractionRequiredAuthError`,
     * so {@link AuthActions.getToken} does not answer them with a redirect of
     * its own — and repeating the same silent call is the one thing certain not
     * to help.
     */
    reauthenticate: () => void;

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

    const reauthenticate = useCallback(() => {
        const pca = pcaRef.current;

        if (!pca) return;

        const current = accountRef.current;

        setError(null);
        setSigningIn(true);

        const scopes = [...LOGIN_SCOPES, API_SCOPE];

        // Not a sign-out and back in, which is what the Plan tab's button does
        // and is the wrong shape for this: the *session* is fine, and only this
        // page's ability to turn it into a token is not. Naming the account
        // keeps Entra from asking which one it belongs to, so a session that
        // still holds usually comes back without a single prompt.
        //
        // Neither call returns — the browser navigates away, and the app
        // reloads into handleRedirectPromise above.
        void (current
            ? pca.acquireTokenRedirect({ scopes, account: current })
            : pca.loginRedirect({ scopes })
        ).catch((cause: unknown) => {
            setError(describeAuthError(cause));
            setSigningIn(false);
        });
    }, []);

    const getToken = useCallback(async (): Promise<string> => {
        const pca = pcaRef.current;

        if (!pca) throw new Error('Sign-in is not ready yet.');

        const current = accountRef.current;

        if (!current) throw new Error('No signed-in account.');

        const request = { scopes: [API_SCOPE], account: current };

        try {
            const result = await pca.acquireTokenSilent(request);

            // The token layer works, so a failure recorded by an earlier call
            // is stale — and it is read as "this is why nothing loads", ahead
            // of the read failures it causes. React bails out when the value is
            // already null, so this costs nothing on the ordinary path.
            setError(null);

            return result.accessToken;
        } catch (cause) {
            // InteractionRequiredAuthError is how Entra says "ask the user
            // something" — consent, MFA, Conditional Access, or an expired
            // refresh token. It is the one failure worth answering with a
            // redirect *of its own*: the server asked, so going there answers
            // it. Anything else is recorded and shown, and the redirect is
            // offered as a button instead — see `reauthenticate`. A failure
            // that repeats would otherwise navigate to Entra and back on a
            // loop, and it would do it under a thumb halfway through logging a
            // set.
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

    return {
        ready,
        account,
        error,
        signingIn,
        signIn,
        signOut,
        reauthenticate,
        getToken,
        dismissError,
    };
}
