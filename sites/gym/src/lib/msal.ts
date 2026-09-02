import {
    BrowserCacheLocation,
    createStandardPublicClientApplication,
    type Configuration,
    type HandleRedirectPromiseOptions,
    type IPublicClientApplication,
} from '@azure/msal-browser';

import { REDIRECT_URI, type InspectorConfig } from './config';

function buildMsalConfig(config: InspectorConfig): Configuration {
    return {
        auth: {
            clientId: config.clientId,
            authority: `https://login.microsoftonline.com/${config.tenant}`,
            redirectUri: REDIRECT_URI,
            postLogoutRedirectUri: REDIRECT_URI,
        },
        cache: {
            // sessionStorage, not localStorage: tokens die with the tab. A
            // token inspector that leaves live credentials on disk after the
            // window closes is the worse tool.
            cacheLocation: BrowserCacheLocation.SessionStorage,
        },
        system: {
            loggerOptions: {
                // MSAL's verbose logging prints tokens, and this page already
                // shows them somewhere they are read deliberately rather than
                // left in a console someone screen-shares.
                loggerCallback: () => {},
                piiLoggingEnabled: false,
            },
        },
    };
}

// Land back on this page rather than on whatever URL started the sign-in. With
// one page those are the same thing; saying so keeps them from drifting apart
// if a second page is ever added. MSAL v5 moved this off the configuration
// object and onto the call that consumes the redirect response, which is why it
// is not a line in buildMsalConfig.
export const REDIRECT_HANDLING: HandleRedirectPromiseOptions = {
    navigateToLoginRequestUrl: false,
};

// One instance per page load, memoised as a *promise*. React 19 runs effects
// twice in development StrictMode, and this page's first effect is the one that
// consumes a redirect response. Two PublicClientApplications racing over the
// same sessionStorage is how you get an interaction_in_progress error that
// names nothing; awaiting the same promise twice cannot.
let instance: Promise<IPublicClientApplication> | null = null;

export function getMsalInstance(config: InspectorConfig): Promise<IPublicClientApplication> {
    // Constructs and initialises in one call. Since MSAL v3 the constructor no
    // longer does the async setup and every other call throws until it has run,
    // so the two belong together.
    instance ??= createStandardPublicClientApplication(buildMsalConfig(config));

    return instance;
}
