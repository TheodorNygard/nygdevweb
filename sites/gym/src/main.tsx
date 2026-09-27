import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import { API_BASE } from './lib/config';
import { applyTheme, readTheme } from './lib/theme';
import './styles.css';

// Before anything renders, so the first paint is already in the chosen theme
// rather than Graphite for a frame. Not an inline script in index.html: the
// CSP admits no inline scripts, and this module runs before the root is
// populated anyway, which is as early as the page has anything to paint.
applyTheme(readTheme());

// Wakes the function app now, rather than when the first real call needs it.
//
// The API runs on Flex Consumption and scales to zero, so the first request
// after an idle spell waits for a worker to start. That request is normally
// `GET /gym/mesocycles/current`, which cannot be sent until MSAL has
// initialised and produced a token — and when the cached access token has
// expired, producing one is a hidden-iframe round trip to Entra through
// `auth.html`. An access token lasts about an hour and so does a training
// session, so that is the ordinary way this app is opened rather than the
// unlucky one. Firing here puts the cold start alongside all of it instead of
// after it.
//
// No token, and none needed. Easy Auth on the function app enforces sign-in —
// `require_authentication = true` with `Return401` in
// `terraform/consumption.tf` — so this is answered by the platform with an
// empty 401 and never reaches a function: no invocation, no Cosmos read, no
// RU. It still warms the app, because on Flex Consumption that auth module
// runs on the app's own instance, so answering even a refusal means scaling
// one up from zero. Measured with the gate on, in September 2026: about 1.7 s
// for the first ping after an idle spell, about 0.1 s for the ones behind it. The response
// is never read; the instance starting is the whole point.
//
// If that ever stops being true — Easy Auth answering from somewhere in front
// of the instance — this would warm nothing, silently, since a ping whose
// answer is discarded cannot tell the difference. Delete these lines then; the
// cache below is what carries the app-open case.
//
// `warm=1` is ignored by the route and is there for anyone reading the
// platform's HTTP logs, where every app open now leaves a 401: the query
// string is what tells those apart from a real expired-token failure.
void fetch(`${API_BASE}/gym/mesocycles/current?warm=1`, { credentials: 'omit' })
    .catch(() => {
        // Offline, blocked, or refused. The app is about to find that out
        // properly through a call whose answer it actually reads.
    });

const container = document.getElementById('root');

if (!container) throw new Error('#root is missing from index.html');

createRoot(container).render(
    <StrictMode>
        <App />
    </StrictMode>,
);
