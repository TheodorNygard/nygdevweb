import {
    BrowserCacheLocation,
    createStandardPublicClientApplication,
    type Configuration,
    type HandleRedirectPromiseOptions,
    type IPublicClientApplication,
} from '@azure/msal-browser';

import { AUTHORITY, CLIENT_ID, REDIRECT_URI } from './config';

const MSAL_CONFIG: Configuration = {
    auth: {
        clientId: CLIENT_ID,
        authority: AUTHORITY,
        redirectUri: REDIRECT_URI,
        postLogoutRedirectUri: REDIRECT_URI,
    },
    cache: {
        // localStorage, not sessionStorage: this is a logbook opened between
        // sets on a phone that backgrounds the tab, and a cache that dies with
        // the tab means a redirect to Entra mid-workout.
        cacheLocation: BrowserCacheLocation.LocalStorage,
    },
    system: {
        loggerOptions: {
            // MSAL's verbose logging prints tokens. Nothing here needs them in
            // a console someone might screen-share from a gym floor.
            loggerCallback: () => {},
            piiLoggingEnabled: false,
        },
    },
};

// Land back on this page rather than on whatever URL started the sign-in. MSAL
// v5 moved this off the configuration object and onto the call that consumes
// the redirect response.
export const REDIRECT_HANDLING: HandleRedirectPromiseOptions = {
    navigateToLoginRequestUrl: false,
};

// One instance per page load, memoised as a *promise*. React 19 runs effects
// twice in development StrictMode, and this app's first effect consumes the
// redirect response; two PublicClientApplications racing over the same storage
// is how you get an interaction_in_progress error that names nothing.
let instance: Promise<IPublicClientApplication> | null = null;

export function getMsalInstance(): Promise<IPublicClientApplication> {
    // Constructs and initialises in one call. Since MSAL v3 the constructor no
    // longer does the async setup and every other call throws until it has run.
    instance ??= createStandardPublicClientApplication(MSAL_CONFIG);

    return instance;
}
