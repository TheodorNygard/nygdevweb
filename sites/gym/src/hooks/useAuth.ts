import { useCallback, useEffect, useRef, useState } from 'react';
import {
    CacheLookupPolicy,
    InteractionRequiredAuthError,
    type AccountInfo,
    type AuthenticationResult,
    type IPublicClientApplication,
    type SilentRequest,
} from '@azure/msal-browser';

import { API_SCOPE, LOGIN_SCOPES } from '../lib/config';
import { describeAuthError, isIframeRenewalFailure, type AuthErrorDetail } from '../lib/errors';
import { REDIRECT_HANDLING, getMsalInstance } from '../lib/msal';
import {
    claimRenewalRedirect,
    iframeRenewalWorthTrying,
    rememberIframeRenewalFailed,
    releaseRenewalRedirect,
} from '../lib/renewal';

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
     * {@link AuthActions.getToken} now does this by itself for a renewal that
     * failed rather than was refused — a blocked third-party cookie, an iframe
     * that timed out — because top-level is the one place that round trip can
     * work. This is what is left when that has already been spent and the app
     * still has no token: the automatic attempt takes itself out of the way
     * after one try, on purpose, and what remains is a button rather than a
     * page that bounces to Entra and back under a thumb halfway through logging
     * a set.
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

    // Whether a renewal redirect is already taking this page to Entra. Every
    // screen's hooks ask for a token before they read, so a renewal that has
    // come due fails three or four calls at once — and all but the first are
    // reporting something that is already being handled.
    const renewingRef = useRef(false);

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
        releaseRenewalRedirect();

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

        // A sign-in the user asked for supersedes whatever the app tried on its
        // own, so it hands back the automatic attempt rather than spending the
        // cooldown standing between the next expiry and a renewal.
        releaseRenewalRedirect();

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

        // The same ask, either silently or by going there. Named once because
        // the two have to agree: a redirect for different scopes would come
        // back with a token the next silent call does not find.
        const asking = { scopes: [API_SCOPE], account: current };

        const request: SilentRequest = iframeRenewalWorthTrying()
            ? { ...asking }
            : {
                ...asking,
                // The iframe has already failed in this browser, and a cookie
                // policy does not change between two calls. `Default` would
                // spend ten seconds proving that again on every cold start;
                // this policy stops after the cache and the refresh token, so
                // a session with nothing left to redeem fails in milliseconds
                // and the redirect below happens while the app is still
                // loading rather than after it has sat there.
                cacheLookupPolicy: CacheLookupPolicy.AccessTokenAndRefreshToken,
            };

        try {
            const result = await pca.acquireTokenSilent(request);

            // The token layer works, so a failure recorded by an earlier call
            // is stale — and it is read as "this is why nothing loads", ahead
            // of the read failures it causes. React bails out when the value is
            // already null, so this costs nothing on the ordinary path.
            setError(null);

            // The chain that may have redirected to get here ended in a token,
            // so it was a renewal and not a loop. Hand the attempt back for the
            // next expiry.
            releaseRenewalRedirect();

            return result.accessToken;
        } catch (cause) {
            // Two failures are worth answering by going to Entra top-level, and
            // they are worth telling apart.
            //
            // `InteractionRequiredAuthError` is Entra saying *ask the user
            // something* — consent, MFA, Conditional Access — or MSAL saying
            // the refresh token is gone. Entra was asked and answered.
            //
            // An iframe that never reported back was never asked: a blocked
            // third-party cookie for `login.microsoftonline.com` means Entra
            // rendered a sign-in page inside the hidden frame instead of
            // redirecting it home, and nothing reached `/auth.html`. Nothing
            // this app serves can hand that frame a cookie the browser has
            // withheld — but the same round trip taken top-level gets one,
            // because there `login.microsoftonline.com` is first-party, and an
            // account that is still signed in comes back without being shown
            // anything at all. That is the renewal, moved somewhere it works.
            const iframeFailed = isIframeRenewalFailure(cause);

            if (iframeFailed) rememberIframeRenewalFailed();

            // A parallel call is already taking the page to Entra over this
            // same expiry. Reporting it again would put a failure on screen
            // that is being handled, on a page that is navigating away.
            if (renewingRef.current) throw cause;

            // One attempt, then the banner. `claimRenewalRedirect` is what
            // keeps "redirect, come back, fail identically, redirect again"
            // from being a page that bounces to Entra on a loop — the reason
            // this used to be a button for everything but the error above.
            if ((iframeFailed || cause instanceof InteractionRequiredAuthError)
                && claimRenewalRedirect()) {
                renewingRef.current = true;
                setSigningIn(true);

                // Does not return when it works: the browser navigates away and
                // the app reloads into handleRedirectPromise above. When it
                // does not — an interaction already in progress, a navigation
                // blocked — the attempt goes back so the button can use it.
                await pca.acquireTokenRedirect({ ...asking }).catch((failure: unknown) => {
                    renewingRef.current = false;
                    releaseRenewalRedirect();
                    setSigningIn(false);
                    setError(describeAuthError(failure));
                });

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
