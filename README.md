# nygdevweb

Source for three static sites, each deployed to its own Azure Static Web App on
the free tier.

Two of them — nygdev.dev and run.nygard.dev — have no framework and no build
step: HTML with styles and SVG icons inlined, one script each, some favicons.
gym.nygard.dev is a React + TypeScript app built with Vite, because its one
dependency (MSAL) is large enough that bundling it beats vendoring it by hand.
All three still ship as plain static files; only one of them has a step that
produces those files.

| Site | Folder | What it is |
| --- | --- | --- |
| [nygdev.dev](https://nygdev.dev) | `sites/nygdev/` | One-page personal site: profile links, a link to my LikeC4 architecture diagram, and a live status button for my self-hosted Foundry VTT server that can start the server when it's down |
| [run.nygard.dev](https://run.nygard.dev) | `sites/run/` | Marathon prep dashboard: reads a precomputed JSON feed from public blob storage and charts training load, weekly volume, pace by run type and the easy/hard intensity split |
| [gym.nygard.dev](https://gym.nygard.dev) | `sites/gym/` | GymLog's front end, a React + Vite + TypeScript app. Today it is a token inspector: signs in with MSAL against Entra ID and prints the resulting tokens decoded, the way jwt.ms does for one you paste in |

All three sites live in one repo because the deploy identity is federated to
this repo — a second repo would need its own federated credential subjects. A
Static Web App has one content root and routes on path only, with no host-based
routing, so three subdomains with different content need three SWA resources.

Each site folder is self-contained and holds its own
`staticwebapp.config.json` (security headers: CSP, HSTS, frame options,
referrer policy, cross-origin isolation). SWA serves `app_location` as the site
root, so a site's public paths match its folder contents — for `sites/gym/`
that root is `dist/`, and the config file lives in `public/` so the build
copies it there.

## Deployment

Deploys are **manual** — pick the workflow in the Actions tab and run it. Auto-deploy
on push and PR is intentionally off.

| Workflow | Deploys | `app_location` | Authorized by |
| --- | --- | --- | --- |
| `.github/workflows/azure-static-web-apps-brave-cliff-0253fca03.yml` | nygdev.dev | `sites/nygdev` | GitHub OIDC |
| `.github/workflows/deploy-run.yml` | run.nygard.dev | `sites/run` | deployment token |
| `.github/workflows/deploy-gym.yml` | gym.nygard.dev | `sites/gym/dist` | deployment token |

**The nygdev.dev workflow file must keep its generated name.** That app's
deployment authorization policy is "GitHub", so the content server identifies
the app by the workflow filename carried in the OIDC token — Azure registered it
at provisioning time (portal: Overview → "Edit workflow"). Renaming the file
breaks deploys with *"Could not determine the Static Web App from the GitHub
OIDC workflow reference"*. The `name:` inside the file is free to change.

run.nygard.dev and gym.nygard.dev have no such constraint because they
authorize with the deployment token instead, which is why their files can be
named for what they deploy. That
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
| `AZURE_SWA_RESOURCE_GROUP` | nygdev.dev, and the other two when no `_RUN`/`_GYM` override is set | yes |
| `AZURE_SWA_NAME_RUN` | run.nygard.dev | yes |
| `AZURE_SWA_RESOURCE_GROUP_RUN` | run.nygard.dev | only if it sits in a different resource group |
| `AZURE_SWA_NAME_GYM` | gym.nygard.dev | yes |
| `AZURE_SWA_RESOURCE_GROUP_GYM` | gym.nygard.dev | only if it sits in a different resource group |

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

## gym.nygard.dev and the token inspector

The page signs in against Entra ID with MSAL and prints what comes back: the
ID token always, and an access token for whatever resource scope you ask it
for. Each is shown raw, split into its three segments, then decoded into a
claims table with the timestamps resolved and a one-line note on what each
claim is for. It is jwt.ms with the sign-in attached, so the request that
produced a token is visible next to the token.

There is no backend. Nothing is sent anywhere except to Entra ID, and the CSP
is what makes that checkable rather than a promise — `connect-src` names
exactly one origin, so an exfiltration path would have to change a file in this
repo to exist at all.

### Two registrations, and which is which

This is the thing to get straight before touching the portal, because the same
GUID means different things in different fields.

| | Front end (this page) | API (`func-nygdev-api`) |
| --- | --- | --- |
| Registration | **GymLog**, `f6922f08-…` | its own, separate |
| Platform | Single-page application | — |
| Role in the token | `appid` / `azp` — who *obtained* it | `aud` — who it is *for* |
| Secret | none, and must not have one | — |

The front end signs in **as** GymLog and asks for a scope **on** the API
registration. That is what makes the resulting access token satisfy both halves
of the Easy Auth check on the function app: `allowed_audiences` matches the API
registration, and `allowed_applications` matches GymLog.

> **The terraform in NygDevAzure does not describe this split yet.**
> `terraform/consumption.tf` currently points `client_id` and
> `allowed_audiences` at `var.gymlog_client_id`, from when GymLog was going to
> be both halves. Once the API registration exists, those two need to name it
> instead — `allowed_applications` is the one field that stays as it is, since
> GymLog really is the calling client. Until that change is applied, a token
> minted for the new API registration is rejected by the function app with a
> 401, and the inspector will happily show you the perfectly valid token that
> is being rejected.

### Portal setup

Neither registration is managed by terraform — granting the apply workflow's
identity Microsoft Graph application permissions is a far wider grant than a
couple of app registrations is worth — so this is a manual checklist.

On **GymLog**, once:

1. **Authentication → Add a platform → Single-page application.**
2. Redirect URI: the exact string the Configuration panel on the page shows.
   Copy it from there rather than typing it — Entra matches it as a string, and
   a trailing slash that disagrees is `AADSTS50011`.
3. Leave it with no client secret. The SPA platform means authorization code
   with PKCE, and a SPA that sends a secret is a SPA that has leaked one.

The SPA platform is the load-bearing choice. Registering the same URI under
**Web** instead looks identical in the portal and fails at sign-in with
`AADSTS9002326`, because a Web redirect URI makes Entra treat the caller as a
confidential client and demand the secret a browser cannot keep.

On the **API registration**: expose a scope under **Expose an API**, and put
`api://<api-client-id>/<scope-name>` in the resource-scope box on the page.
Both halves have to match what the blade says.

### Signing in without a scope

The page works before any of the API side exists. Sign in with the default
scopes and you get an ID token, which is enough to confirm the registration,
the redirect URI and the tenant are right. The resource-scope box is the part
that needs the API registration, and it is separate for that reason — a broken
scope produces an error next to a working sign-in rather than one failure that
could be either.

### The build, and working on it locally

React 19, TypeScript 7 and Vite 8, with `@azure/msal-browser` 5 as the only
runtime dependency. `package.json` is the record of what is pinned; the majors
are named here because each decides something that shows up elsewhere in this
repo: React 19 for the hooks the app is written in, TypeScript 7 for the strict
options the port leaned on, Vite 8 for the Node version the deploy workflow
pins.

Everything is in `sites/gym/`:

```sh
cd sites/gym
npm ci            # exactly what package-lock.json pins
npm run dev       # Vite dev server on http://localhost:5173
npm run typecheck # tsc alone, without producing a bundle
npm run build     # tsc --build, then vite build, into dist/
npm run preview   # serve the built dist/ over HTTP
```

| Path | What it holds |
| --- | --- |
| `index.html` | The shell. One `<div id="root">` and the module script Vite rewrites at build time |
| `src/lib/` | No React: config storage, JWT decoding, the claim reference table, formatting, the AADSTS error map |
| `src/hooks/` | `useAuth` (all MSAL interaction), `useTheme`, `useNow` |
| `src/components/` | The cards, tabs, tables and the SVG sprite |
| `public/` | Copied to the deployed root untouched: favicons, `404.html` and its stylesheet, and `staticwebapp.config.json` |
| `dist/` | Build output. Gitignored; produced in CI and uploaded as-is |

`npm run build` runs `tsc --build` before Vite, so a type error fails the
deploy rather than reaching the browser. The compiler options are strict, and
deliberately include `noUncheckedIndexedAccess` and
`exactOptionalPropertyTypes` — both of them caught real things during the port,
the second because MSAL's request types will not accept an explicit
`account: undefined` where the pre-TypeScript code passed a possibly-null one.

**Neither `npm run dev` nor `npm run preview` carries the CSP.** Those headers
come from `staticwebapp.config.json`, and only Azure reads that file — Vite
serves `dist/` without them, and the dev server additionally injects inline
scripts for hot reload that the policy would reject. Checking a change against
the real policy means serving `dist/` with those headers attached, which is
what the deployed site does and what a local check has to imitate.

### MSAL is bundled, not loaded from a CDN

`script-src 'self'` blocks a CDN `<script>` outright, so `@azure/msal-browser`
has to be served same-origin. Before the React rewrite that meant committing
the UMD build under `sites/gym/vendor/` and keeping its version and digest in a
table by hand. It now comes from npm, pinned by `package-lock.json`, and Vite
emits it inside the same hashed, same-origin bundle as the rest of the app.

That is the same security property arrived at with less ceremony: the lockfile
is the record the vendor README used to be, `npm ci` is what checks it, and
there is no hand-maintained digest to go stale. Loosening the policy to admit
a CDN is still the thing not to do — it would mean trusting a third-party
origin with script execution on the one page in this repo that handles access
tokens, which is the worst page to make that trade on.

`skip_app_build: true` stays in the deploy workflow, and now matters for a
different reason. The workflow builds on a Node version it pins, then uploads
`sites/gym/dist` exactly as built; letting Azure's Oryx builder run instead
would put a second, unpinned toolchain in charge of what ships.

Read the upstream changelog before bumping MSAL's major. Its breaking changes
are usually in the configuration object — v5 moved `navigateToLoginRequestUrl`
out of the config and onto `handleRedirectPromise`, and dropped
`storeAuthStateInCookie` entirely. Under TypeScript those surface as build
errors, which is a real improvement on the pre-build behaviour, where the same
change was a silently ignored property and a sign-in that failed at runtime.

### Where this site's CSP differs from the other two

Three deltas, all of them forced by the sign-in:

| Header | Here | Elsewhere | Why |
| --- | --- | --- | --- |
| `connect-src` | `login.microsoftonline.com` | the blob endpoint | Where MSAL fetches OIDC metadata and redeems the code for tokens. |
| `frame-src` | `login.microsoftonline.com` | absent | MSAL's hidden-iframe path for silent renewal. Without it, silent renewal fails with a timeout that names nothing. |
| `Cross-Origin-Opener-Policy` | `same-origin-allow-popups` | `same-origin` | `same-origin` severs the handle between opener and popup, which is exactly what MSAL's popup flow polls. Redirect is the default here and is unaffected; this is what keeps the popup option from being a trap. |

`style-src` is also different, and that one is not forced by anything — it is
plain `'self'` here, where the other two sites need `'unsafe-inline'` for their
inlined `<style>` block. Vite emits the stylesheet as a hashed same-origin
file, so nothing on this site needs inline styles: the SVG sprite is hidden by
a class rather than a `style` attribute, and `404.html` links `404.css` instead
of carrying its own `<style>`. MSAL's hidden renewal iframe is unaffected — it
sets `element.style.visibility` through the CSSOM, which CSP does not govern.

`Cross-Origin-Embedder-Policy` is **omitted** here, where the other two sites
set `credentialless`. It buys this page nothing — there is no
`SharedArrayBuffer` and no cross-origin isolation to earn — and it costs
something real: `credentialless` strips cookies from the sign-in iframe, so
silent renewal fails on a session that would otherwise have worked. A header
that only breaks a working path is not a security control.

### When sign-in fails

The page pulls the `AADSTS` code out of the error and shows it on its own line,
with the fix for the ones that mean something specific about this setup. The
`ERROR_FIXES` table in `src/lib/errors.ts` is that list; the codes worth knowing on sight
are `AADSTS50011` (redirect URI not registered), `AADSTS9002326` (registered
under Web instead of SPA) and `AADSTS650053` (the scope is not what the API
registration exposes).

### Tokens on screen

The page prints live credentials, which is its job and also its main hazard. A
token shown here can be replayed by anyone who reads it until it expires, so a
screenshot of this page is a password. Two things keep the blast radius small
and both are deliberate:

- MSAL caches in **`sessionStorage`**, not `localStorage`. Tokens die with the
  tab rather than sitting on disk after the window is closed.
- MSAL's logger is **silenced**. Its verbose levels print tokens, and a token
  in a console someone screen-shares is a token leaked to everyone watching.

Claim values reach the DOM as JSX text, which React escapes — never through
`dangerouslySetInnerHTML`, which is not used anywhere in this app. A JWT is
attacker-influenced input — anyone can sign in, and a display name is whatever
its owner set it to — so it is rendered as data, not markup. That was
`textContent` before the rewrite and is the same property by a different
mechanism.

Stored configuration is treated the same way. `localStorage` holds whatever a
previous version of the page or a typo in devtools left there, so `loadConfig`
takes each field only when it is the type the rest of the code assumes and
falls back to the default otherwise.

## Inline scripts and the CSP

No site here has ever had an inline `<script>`. nygdev.dev and run.nygard.dev
each load their `main.js` from their own origin; gym.nygard.dev loads one
hashed module bundle, with MSAL inside it, from its own origin. Either way that
is all `script-src 'self'` needs. A browser
reporting an inline script blocked on one of these pages, with a hash to add, is
reporting
something that is not served from here — almost always an extension injecting
into the page. Reproduce in a clean profile (Firefox: Help → Troubleshoot Mode)
before touching the policy. Never paste a suggested hash into the CSP without
knowing which script it belongs to: a hash is a permanent allow for whatever
code produces it.

The one inline script Azure did serve on these domains was its stock 404 page,
which comes from Microsoft's edge without the headers in
`staticwebapp.config.json`. `sites/run/` and `sites/gym/` now ship their own
`404.html`, wired up through `responseOverrides`, so 404s are first-party and
carry the same policy as the rest of the site. Those pages are deliberately
script-free — the theme follows the OS instead of a toggle — so there is
nothing on them for the policy to have an opinion about. gym.nygard.dev's also
links its stylesheet instead of inlining it, which is what lets that site's
`style-src` be plain `'self'`.
