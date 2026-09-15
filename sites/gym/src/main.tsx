import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import { API_BASE } from './lib/config';
import './styles.css';

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
// No token, and none is needed *today*. Easy Auth is enabled on the function
// app — `auth_enabled = true` in `terraform/consumption.tf` — but it is not
// enforcing: `require_authentication = false` with `AllowAnonymous` means a
// request carrying no token is passed through to the function rather than
// bounced to a login. It then fails the principal check in `GymEndpoint` and
// comes back 401 `not_signed_in`: one invocation, refused before the Cosmos
// budget is opened, so it costs no RU. The response is never read, which is
// also why a CORS rule that would not admit it changes nothing — the request
// still reached the worker, which is the whole point.
//
// **This stops working the day that gate closes.** That same terraform comment
// plans it: flipping `require_authentication` to true and
// `unauthenticated_action` to `"Return401"` has the platform reject this ahead
// of the worker, so it would warm nothing — silently, since a ping whose answer
// is discarded cannot tell the difference. When that day comes this needs an
// Easy Auth exclusion path, which is the same answer the WHOOP callback and the
// GPS upload already need at that moment. Delete these lines instead if that is
// not worth an exclusion; the cache below is what carries the app-open case.
//
// `warm=1` is ignored by the route and is there for the other end: this puts a
// 401 in Application Insights on every app open, and the query string is what
// tells those apart from a real expired-token failure worth looking at.
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
