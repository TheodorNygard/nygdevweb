# nygdevweb

Source for two static sites, each deployed to its own Azure Static Web App on
the free tier. No framework, no build step, no dependencies — HTML with styles
and SVG icons inlined, one script each, some favicons.

| Site | Folder | What it is |
| --- | --- | --- |
| [nygdev.dev](https://nygdev.dev) | `sites/nygdev/` | One-page personal site: profile links, a link to my LikeC4 architecture diagram, and a live status button for my self-hosted Foundry VTT server that can start the server when it's down |
| [run.nygard.dev](https://run.nygard.dev) | `sites/run/` | Marathon prep dashboard: reads a precomputed JSON feed from public blob storage and charts training load, weekly volume, pace by run type and the easy/hard intensity split |

Both sites live in one repo because the deploy identity is federated to this
repo — a second repo would need its own federated credential subjects. A Static
Web App has one content root and routes on path only, with no host-based
routing, so two subdomains with different content need two SWA resources.

Each site folder is self-contained and holds its own
`staticwebapp.config.json` (security headers: CSP, HSTS, frame options,
referrer policy, cross-origin isolation). SWA serves `app_location` as the site
root, so a site's public paths match its folder contents.

## Deployment

Deploys are **manual** — pick the workflow in the Actions tab and run it. Auto-deploy
on push and PR is intentionally off.

| Workflow | Deploys | `app_location` | Authorized by |
| --- | --- | --- | --- |
| `.github/workflows/azure-static-web-apps-brave-cliff-0253fca03.yml` | nygdev.dev | `sites/nygdev` | GitHub OIDC |
| `.github/workflows/deploy-run.yml` | run.nygard.dev | `sites/run` | deployment token |

**The nygdev.dev workflow file must keep its generated name.** That app's
deployment authorization policy is "GitHub", so the content server identifies
the app by the workflow filename carried in the OIDC token — Azure registered it
at provisioning time (portal: Overview → "Edit workflow"). Renaming the file
breaks deploys with *"Could not determine the Static Web App from the GitHub
OIDC workflow reference"*. The `name:` inside the file is free to change.

run.nygard.dev has no such constraint because it authorizes with the deployment
token instead, which is why its file can be named for what it deploys. That
requires its deployment authorization policy to be **Deployment token** (portal:
Settings → Deployment configuration). Both approaches still keep the token out
of GitHub — it is fetched at runtime over the federated identity either way.

Azure auth uses OIDC federated credentials, so no long-lived deployment token
lives in GitHub; each workflow signs in with `azure/login` and fetches its
Static Web Apps token just-in-time. Both read the `AZURE_CLIENT_ID`,
`AZURE_TENANT_ID` and `AZURE_SUBSCRIPTION_ID` secrets, and each reads its own
resource-name variables:

| Variable | Used by | Required |
| --- | --- | --- |
| `AZURE_SWA_NAME` | nygdev.dev | yes |
| `AZURE_SWA_RESOURCE_GROUP` | nygdev.dev, and run.nygard.dev when no `_RUN` override is set | yes |
| `AZURE_SWA_NAME_RUN` | run.nygard.dev | yes |
| `AZURE_SWA_RESOURCE_GROUP_RUN` | run.nygard.dev | only if the two apps are in different resource groups |

An unset variable expands to an empty string, which the Az CLI reports as a bare
`expected one argument` usage error. Both workflows check first and fail naming
the variable instead.

The deploy identity needs a role granting `Microsoft.Web/staticSites/listSecrets`
(e.g. Contributor) on **each** Static Web App. Setting that up from scratch
(federated credential subjects, the role grant) is written out in the history of
this file.

## run.nygard.dev and the training feed

There is no function app in the request path. A build job computes the
dashboard and writes it to a public blob; the page is a plain cross-origin GET
of that static file. Nothing is computed in the browser beyond formatting and
the reference marks the page labels as such (42.2 km, the 80/20 easy split, the
0.8–1.3 ACWR band) — every measured number on the page comes from the feed.

Free-tier SWA has no linked-backend support and no proxying, so the read is
cross-origin and three things have to agree:

1. `FEED_URL` in `sites/run/main.js`
2. `connect-src` in `sites/run/staticwebapp.config.json` — otherwise the CSP blocks it
3. a **CORS rule on the storage account** allowing `https://run.nygard.dev`

The first two say `https://nygdevcdn.blob.core.windows.net`.

The third is the one that is easy to miss, because the blob being publicly
readable is not the same thing as it being readable *by a page*. Anonymous
access governs whether the bytes are served; CORS governs whether a browser
lets script see them. Without a rule the blob still returns 200 to `curl` and
the browser still fetches it — and then drops the response for having no
`Access-Control-Allow-Origin`, which reaches the page as a bare `TypeError`
indistinguishable from a CSP violation. "It works in curl" is the signature of
this, not evidence against it. Check it the way the browser does:

```sh
curl -sSI -X OPTIONS \
  -H 'Origin: https://run.nygard.dev' \
  -H 'Access-Control-Request-Method: GET' \
  https://nygdevcdn.blob.core.windows.net/data/marathonprep.json
```

`403 CORS not enabled or no matching rule found for this request` means the rule
is missing. Add it once per storage account:

```sh
az storage cors add --account-name nygdevcdn --auth-mode login \
  --services b --methods GET HEAD \
  --origins https://run.nygard.dev \
  --allowed-headers '*' --max-age 3600
```

The page keeps its own side of that bargain by sending no request headers at
all, which keeps the read a CORS *simple* request with no preflight to satisfy.
Adding an `Accept` or auth header would put an `OPTIONS` round trip in front of
every load. The feed is served with `Cache-Control: public, max-age=300`, so the
refresh button appends a cache-busting query parameter rather than a
`Cache-Control` request header, which would cost a preflight for the same
reason.

Keep the feed anonymous-readable and rely on CORS. A SAS token in `main.js` is
served to every visitor in plain text, so it authenticates nobody.

## The dashboard

The feed is sparse and stays sparse early in a training block: whole weeks have
no runs, three of the five run types have no points, and aerobic efficiency has
none at all until an easy run is logged. Every card therefore has an empty state
and keeps its shape when its section is missing, and a payload with nothing in
it but `asOf` renders six cards of empty states rather than throwing.

Charts are inline SVG built with `createElementNS`, no library — the CSP allows
scripts from `'self'` only, and a CDN would be blocked. Feed strings reach the
DOM through `textContent`, never `innerHTML`; the payload is remote and is not
markup.

Two conventions in `sites/run/` are load-bearing rather than cosmetic:

- **The `--series-N` slot order is the colour-blind-safety mechanism.** The
  three slots were validated against both card surfaces (`#ffffff` and
  `#1e1e1e`) for lightness band, chroma, CVD separation and contrast.
  Reordering them or adding a fourth invalidates that. Slot 3 sits below 3:1 on
  white, which is why the legend and the table view are not optional.
- **Charts are drawn at measured pixel widths, not scaled from a fixed
  viewBox**, so axis text is the size it was designed at on every screen. That
  makes measurement load-bearing: a chart drawn inside a `display: none`
  container measures zero and falls back to a default width, so the dashboard
  is made visible before any card is drawn, and the table toggle redraws rather
  than just unhiding. A width change redraws on a debounce; a height change
  does not, because mobile browsers change the height on every scroll.

Every chart ships a table view, and every mark answers to keyboard focus with
the same readout it gives on hover.

## Inline scripts and the CSP

Neither site has ever had an inline `<script>`; each loads one `main.js` from
its own origin, which is all `script-src 'self'` needs. A browser reporting an
inline script blocked on one of these pages, with a hash to add, is reporting
something that is not served from here — almost always an extension injecting
into the page. Reproduce in a clean profile (Firefox: Help → Troubleshoot Mode)
before touching the policy. Never paste a suggested hash into the CSP without
knowing which script it belongs to: a hash is a permanent allow for whatever
code produces it.

The one inline script Azure did serve on these domains was its stock 404 page,
which comes from Microsoft's edge without the headers in
`staticwebapp.config.json`. `sites/run/` now ships its own `404.html`, wired up
through `responseOverrides`, so 404s are first-party and carry the same
policy as the rest of the site.
