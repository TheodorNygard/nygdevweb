# nygdevweb

Source for three static sites, each deployed to its own Azure Static Web App on
the free tier.

Two of them — nygdev.dev and run.nygard.dev — have no framework and no build
step: HTML with styles and SVG icons inlined, one script each, some favicons.
gym.nygard.dev is a React + TypeScript app built with Vite, because MSAL and
two self-hosted typefaces are more than a hand-vendored `vendor/` folder is
worth maintaining.
All three still ship as plain static files; only one of them has a step that
produces those files.

| Site | Folder | What it is |
| --- | --- | --- |
| [nygdev.dev](https://nygdev.dev) | `sites/nygdev/` | One-page personal site: profile links, a link to my LikeC4 architecture diagram, and a live status button for my self-hosted Foundry VTT server that can start the server when it's down |
| [run.nygard.dev](https://run.nygard.dev) | `sites/run/` | Marathon prep dashboard: reads a precomputed JSON feed from public blob storage and charts training load, weekly volume, pace by run type and the easy/hard intensity split |
| [gym.nygard.dev](https://gym.nygard.dev) | `sites/gym/` | GymLog: a mesocycle training logger, React + Vite + TypeScript. Signs in with MSAL against Entra ID and logs sets one tap at a time against `func-nygdev-api` |

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

## gym.nygard.dev and GymLog

A training logger built around **mesocycles**: a block of 3–8 weeks, each week
holding 2–6 labelled workout days. Three tabs — **Today** (the current week of
the block), **Plan** (the block's length, days and labels, a block map, and the
list of every block you have planned) and **History** (submitted sessions
grouped by week) — plus the session screen that everything else exists to get
you to.

The session screen has one rule, and it is the whole design: **after the first
set the primary button becomes “Log same again”**, so a working set is one tap
and an adjustment is a delta from what you just did. Weight moves in 2.5 kg
steps, reps in 1, RPE on a 5–10 slider in halves with a plain-language note
(“2 reps left”). Every control is at least 44px and the ones you use mid-set
are in the lower half of the screen, because the premise is a phone held in one
hand with a bar in the other.

The set that **meets an exercise's target moves the logger on** to the next
exercise that still owes sets, scrolling it into view. That is the shape of a
workout — finish one thing, start the next — and doing it on the tap means the
common case costs no thought and no scrolling. It is not a limit: a fourth set
against a three-set plan is one tap on that exercise's header to reopen it,
because the plan is a plan and not a contract. Only the set that *crosses* the
target advances, so the fourth set does not throw you off the exercise you just
chose to add to.

Advancing is forward-only. An exercise left unfinished higher up the list stays
where it is rather than pulling the page backwards under a thumb that expects to
move down; going back to it is deliberate, the same as skipping it was.

**Warm-ups do not count toward the target.** A set logged at RPE 5 or 5.5 — the
two values the slider itself labels "warm-up" — is recorded like any other set
and shows in the volume and the header's set count, but it is numbered `W`
rather than 1, 2, 3, and an exercise cannot be finished by ramping up to the
working weight. The two numbers disagreeing is the point rather than a bug:
"3 of 3" is progress against a plan, and the header's "9 sets" is the record of
what was lifted. A set with *no* RPE is not a warm-up — the rating is optional,
and an unrated set is a working set whose rating was not given.

The rule lives in `completesTarget` and `workingSetCount` in `src/lib/block.ts`,
reading its idea of a warm-up off `isWarmUpRpe` in `src/lib/format.ts`, which is
derived from the same table that writes the slider's labels so the two cannot
drift.

It is dark only. Graphite is the "gym-at-night" direction of the three the
design offered — near-black, acid-lime accent, mono digits — and it was chosen
because a bright screen between sets is the thing that makes a logbook go
unused. A light variant would be a different design, not a preference.

### Planned sessions

A day can carry a plan: which exercises, and how many sets of how many reps.
Tapping the handle beside a day label on the Plan tab opens it.

**The plan hangs off the day, not off a cell of the block**, so every week's
"Upper A" shares it. That follows from the app's own premise — days are
labelled, not scheduled — and it keeps a block one small document instead of up
to 48 planned ones. Planning a single week differently, a deload week most of
all, is what it gives up; that would be a plan per cell, and it is the change
to make if per-week progression is ever wanted.

**Targets are sets and reps, and deliberately not weight.** Sets and reps are
what a programme prescribes; the weight is what the session discovers, and a
prescribed one is wrong the moment it is beaten — it would need rewriting every
block or it becomes noise on the screen.

Starting a planned day opens the session with those exercises already on it and
no sets against them. The seeding happens **server-side**, in `POST
/gym/workouts`, which keeps Start one round trip rather than an entry POST per
planned exercise and means the entry indexes the client logs against are the
ones it was just handed. A resumed draft is not re-seeded — it already has what
the plan gave it, and seeding again would duplicate every exercise each time
Start was tapped twice.

The targets themselves are **not copied onto the session**. They stay on the
block, which the front end already holds, so editing a plan cannot leave a
stale number on a logged workout. `SessionScreen` matches an entry to its
target by position first — a seeded session's entries are the plan in order,
and exercises are only ever appended — with a name check so an exercise added
by hand before the planned ones cannot borrow a target belonging to something
else.

None of it is enforced. Nothing stops you logging four sets against a
three-set plan or ignoring an exercise entirely; the plan opens the session and
shows a target beside each exercise, and the previous set is what fills the
steppers after that. An exercise whose target set count is met turns its
counter to the accent — the same signal a completed day gets in the week list.

The draft on the Plan tab carries whole days rather than labels, and that is
load-bearing: `days` is replaced wholesale by the PATCH, so a draft holding
only labels is how a rename would silently clear every plan in the block.

### The block list, and the one destructive button in the app

The Plan tab lists every block, newest first, marks the one being trained and
opens each into a sheet with three actions.

**Switch** is a `PUT /gym/mesocycles/current`. It exists because creating a
block already switched to it, so until there was a list to switch *from* there
was nothing to add — and a block you can see but cannot open is worse than one
you cannot see. Switching resets the displayed week to null so Today re-derives
it: week 4 of the block you left is not week 4 of this one.

**Copy** is not a route. `POST /gym/mesocycles` already takes a name, a week
count and the days, so copying is the client sending back the shape it is
looking at, and creating is also switching. Plans come with it — a copy that
kept the labels and dropped what each day prescribes would keep the least
interesting half. The sessions stay where they were logged. The app then stays on Plan rather than
jumping to Today, because a copy is almost always renamed straight afterwards
and the field to do it in is at the top of that screen.

**Delete cascades**, and it is the one call in this app that can destroy
training history. Everywhere else the API goes out of its way not to lose a
logged workout — re-logging a day files a second session rather than
overwriting the first. This is the deliberate exception, because refusing while
a block holds anything would make clearing a mis-created block a
session-by-session chore. There is no undo and no soft delete on the other end,
so the confirmation *is* the safety mechanism:

- two taps, the second a different button;
- the button names the count (`sessionCount` comes down with the list);
- and it stays **disabled until the volume has been read**, through
  `GET /gym/workouts?mesoId=`, so the confirmation can never understate what it
  is about to take. A failed volume read leaves it disabled, which is the right
  failure — a cascade should not be confirmable against a number nobody could
  read.

The list is its own hook rather than part of `useBlock`. That one reloads after
every submitted session and every back-out of the logging screen; sharing a
reload would put the list's cost on the app's hottest path for data no screen
there shows.

### Where the screens came from

The app is a build of a Claude Design handoff bundle
(`gym-session-logger-app/`, alongside this repo): HTML/CSS/JS prototypes plus
`DATA-MODEL.md` and `API-CHANGES.md`. `GymLog Graphite v2.dc.html` turn **2a**
is what is implemented here — the palette, radii, type ramp and step sizes in
`src/styles.css` are transcribed from it rather than approximated.

Two things in the prototype are deliberately *not* reproduced, because the
backend that was modelled after it cannot support them honestly:

- **Duration.** The prototype shows a per-session duration everywhere. The API
  stores no timestamp finer than the day, so there is nothing to show on a
  session opened tomorrow. The stopwatch survives on the live session and on
  the "Workout logged" screen — where it is genuinely known — and History shows
  the session's **date** in its place.
- **Equipment on a logged exercise.** The API stores an entry's name and
  nothing else, on purpose. The chip under an exercise name is a lookup into
  the shipped library, and reads `CUSTOM` for a name the user typed.

One screen exists that the prototype does not have: the **duplicate list** on
the day sheet. See below.

### The API, and the three behaviours built around

Everything but the exercise library comes from `func-nygdev-api`, documented in
`apifunctionapp/Gym/README.md` in the NygDevAzure repo. Three of its properties
shape the front end rather than just its request bodies:

**`alreadyRecorded` is success, not a failure.** Every write carries the count
the client believes the session holds — `expectedSetCount`, `expectedEntryCount`
— and applies only while that is still true. A request whose response was lost
and was retried comes back `200 {alreadyRecorded: true}` instead of logging the
set twice. `useSession` treats that as the success it is, which is what makes
"Log same again" safe to hammer on gym wifi. A `409 count_mismatch` is the
other outcome: nothing was written, the local copy is stale, and the hook
re-reads the workout and says so in a banner.

That guard is also what lets every write apply **locally first**. The row
appears on the tap rather than 300 ms later, and the only thing that makes that
safe rather than optimistic is the count the server checks.

**A cell can hold more than one session.** Sessions are keyed on the calendar
date, not on `(meso, week, dayIndex)`, so tapping Start on a day already logged
files a *second* session rather than overwriting the first — the API relaxed
the prototype's overwrite rule because losing a logged workout to a mistyped
tap is worse than showing two. The front end's half of that bargain is the day
sheet: the cell shows the most recent session, the others are listed under it,
and each carries a delete. Without that screen the relaxation would just be a
leak.

**The date comes from the phone.** `POST /gym/workouts` takes `date` as
`YYYY-MM-DD` in the *device's* timezone. The API runs in UTC and a 21:00
session in Oslo is already tomorrow there for half the year, so a server-derived
date would file evening workouts under the wrong day. `localDate()` in
`src/lib/format.ts` builds it from the local date parts and specifically not
from `toISOString()`, which is the same bug wearing a different hat.

### The exercise library is a blob, not a route

`GET /exercises` does not exist. The built-in library is identical for every
user and changes when the app ships, so it is a static file on the CDN —
`https://nygdevcdn.blob.core.windows.net/data/gym-exercises.json`, anonymous
read, cached for a day. The front end fetches it once with no token and no
function invocation; `gym/exercises.json` in NygDevAzure is the source and
`gym_exercise_library_url` the authority on the URL.

The fetch sends **no** `Authorization` header, deliberately: adding one would
turn a simple cross-origin GET into a preflight the blob endpoint has no CORS
rule for. If it fails anyway — offline, or a missing CORS rule, which fail
identically as a bare `TypeError` — `src/lib/library.ts` answers with a bundled
copy of the same twenty names, because a picker with nothing in it would block
logging entirely. Custom names are typed inline and post with the entry, so
nothing about a session depends on the library being reachable.

### Day templates come from both places at once

A **template** is a named plan — Push, Lower A — that the Plan tab drops into a
day of a block. There are two kinds and they arrive by different routes, which
is the whole design rather than an accident of history:

| | Built-in | Saved |
| --- | --- | --- |
| Where it lives | `gym-templates.json` on the CDN, beside the exercise library | `type = "template"` documents in `db/gym` |
| Id | `builtin_push` | `template_01k4…` |
| Costs | no token, no function call, no RU | a call and a few RU, on one screen |
| Editable | no — it ships with the app | yes: `POST`/`PUT`/`DELETE /gym/templates` |

The split falls out of who owns them. The built-in list is identical for every
user and changes when the app ships, so serving it per account would be a
function invocation and an RU spent handing back the same ten objects; the saved
ones are somebody's, so they cannot be a blob. `src/lib/templates.ts` fetches the
first, `GymApi.templates()` the second, and `useTemplates` hands the sheet both
lists separately — separately, because only one of them has a delete on its rows.

Unlike the exercise library, the CDN half has **no bundled fallback** and falls
back to an empty list. The difference is deliberate: a picker with no exercises
in it blocks logging, and logging happens in a basement with no signal, but
planning happens at a desk and a day with no template offered is still a day you
can plan by hand in the same sheet. A second copy of a shipped file that can
drift from the one on the CDN is the worse trade here.

**Applying a template is not an API call.** It assigns the day's `plan` in the
Plan tab's local draft, which then saves with the block through the PATCH that
was going to happen anyway — so a template is a *copy*, never a link. Nothing on
a block records which template filled a day, which is what makes renaming or
deleting one safe with no confirmation and no cascade: what is destroyed is the
shortcut, never a plan or a workout. It also means applying one is undone by
leaving the Plan tab without saving, the same as every other edit on that screen.

Saving works the other way round: the sheet captures the day as it stands, named
after the day by default. Typing a name you already have turns Save into
`Replace “…”`, so re-saving a template keeps its id instead of filing a
near-duplicate beside it. That is the *client's* reading — the API allows two
templates to share a name, because the id is the identity.

### Two registrations, and which is which

The same GUID means different things in different fields, so this is the thing
to get straight before touching the portal.

| | Front end (this app) | API (`func-nygdev-api`) |
| --- | --- | --- |
| Registration | **GymLog**, `f6922f08-…` | its own, eventually |
| Platform | Single-page application | — |
| Role in the token | `appid` / `azp` — who *obtained* it | `aud` — who it is *for* |
| Secret | none, and must not have one | — |

The app signs in **as** GymLog and asks for a scope whose audience the function
app accepts. Easy Auth checks both halves: `allowed_audiences` is who the token
was minted for, `allowed_applications` is who obtained it.

> **As applied today, both halves are GymLog.**
> `terraform/consumption.tf` in NygDevAzure points `client_id` and
> `allowed_audiences` at `var.gymlog_client_id`, from when GymLog was going to
> be both. So `API_SCOPE` in `src/lib/config.ts` asks GymLog for a scope on
> GymLog. Once a separate API registration exists, those two terraform fields
> name it instead, `allowed_applications` stays as it is, and the only change
> here is the scope string.

### The one value that has to be created by hand

`API_SCOPE` in `src/lib/config.ts` defaults to
`api://f6922f08-…/user_impersonation`. **The scope name has to exist on the
registration's *Expose an API* blade and match this string exactly.** Nothing
in this repo can create it — neither registration is managed by terraform,
because that would mean granting the apply workflow Microsoft Graph application
permissions.

`VITE_GYM_API_SCOPE` overrides it at build time, so a different scope name (or
a separate API registration later) is an environment change rather than a code
change. `VITE_GYM_API_BASE` and `VITE_GYM_LIBRARY_URL` exist for the same
reason. Getting the scope wrong surfaces as **`AADSTS650053`** on the sign-in
screen, with the fix printed next to it.

### Portal setup

On **GymLog**, once:

1. **Authentication → Add a platform → Single-page application.**
2. Redirect URI: `https://gym.nygard.dev/` and the Static Web App's own
   hostname, both with the trailing slash. Entra matches it as a string, and a
   slash that disagrees is `AADSTS50011`. The
   `gymlog_spa_redirect_uri` terraform output prints both.
3. Leave it with no client secret. The SPA platform means authorization code
   with PKCE, and a SPA that sends a secret is a SPA that has leaked one.
4. **Expose an API → Add a scope**, named to match `API_SCOPE` above.

The SPA platform is the load-bearing choice. Registering the same URI under
**Web** looks identical in the portal and fails at sign-in with
`AADSTS9002326`, because a Web redirect URI makes Entra treat the caller as a
confidential client and demand the secret a browser cannot keep.

### The build, and working on it locally

React 19, TypeScript 7 and Vite 8. `@azure/msal-browser` 5 is the only runtime
dependency with logic in it; `@fontsource/space-grotesk` and
`@fontsource/jetbrains-mono` are the two typefaces the design specifies, self-
hosted rather than pulled from Google Fonts so the CSP still names no
third-party origin.

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
| `index.html` | The shell. One `<div id="root">`, the module script Vite rewrites at build time, and the `viewport-fit=cover` that makes `env(safe-area-inset-*)` report real numbers |
| `auth.html` | MSAL's redirect URI. Loads `src/auth.ts` and nothing else — the hidden renewal iframe lands here on a ten-second clock, so the app must stay off it |
| `src/lib/` | No React: the typed API client and its wire types, the block/session maths, formatting, the exercise library and the built-in day templates, the identity config, the AADSTS error map |
| `src/hooks/` | `useAuth` (all MSAL interaction), `useResource` (one API read with its loading/error state, shared by `useBlock` and `useBlocks`), `useSession` (the guarded writes), `useTemplates` (the two template lists and their writes), `useLibrary`, `useElapsed` |
| `src/screens/` | Today, Plan, History, Session, Done |
| `src/components/` | The tab bar, the bottom sheets — day, block, day plan, templates, exercise picker, finish — the stepper, the drag handle, the banner, the sign-in gate |
| `public/` | Copied to the deployed root untouched: favicons, the web manifest, `404.html` and its stylesheet, and `staticwebapp.config.json` |
| `dist/` | Build output. Gitignored; produced in CI and uploaded as-is |

`npm run build` runs `tsc --build` before Vite, so a type error fails the
deploy rather than reaching the browser. The compiler options are strict, and
deliberately include `noUncheckedIndexedAccess` and
`exactOptionalPropertyTypes` — the first is what forces every array index off
the API's arrays to be checked, which is most of what this app does.

Two build settings are there for what ships rather than for what compiles.
`node_modules` is split in two: whatever `auth.html` reaches becomes the
`bridge` chunk (~115 kB), and the rest — React, and the MSAL the app alone
uses — becomes `vendor` (~325 kB). So an app edit reships ~70 kB instead of
invalidating either, and the renewal iframe downloads the bridge rather than
all of React. Left unassigned those shared modules fold back into `vendor`,
which is why `manualChunks` names the chunk rather than returning `undefined`.
And `/assets/*` is served `immutable` for a year from
`staticwebapp.config.json`, which is safe because every file under it is
content-hashed. `index.html` and `auth.html` are `no-cache` for the same
reason — they are the files that name the hashes.

**Neither `npm run dev` nor `npm run preview` carries the CSP.** Those headers
come from `staticwebapp.config.json`, and only Azure reads that file — Vite
serves `dist/` without them, and the dev server additionally injects inline
scripts for hot reload that the policy would reject. Checking a change against
the real policy means serving `dist/` with those headers attached.

### MSAL is bundled, not loaded from a CDN

`script-src 'self'` blocks a CDN `<script>` outright, so `@azure/msal-browser`
has to be served same-origin. Before the React rewrite that meant committing
the UMD build under `sites/gym/vendor/` and keeping its version and digest in a
table by hand. It now comes from npm, pinned by `package-lock.json`, and Vite
emits it inside the same hashed, same-origin bundle as the rest of the app.

That is the same security property arrived at with less ceremony: the lockfile
is the record the vendor README used to be, `npm ci` is what checks it, and
there is no hand-maintained digest to go stale. Loosening the policy to admit a
CDN is still the thing not to do — it would mean trusting a third-party origin
with script execution on the one page in this repo that handles access tokens.

The fonts are the same argument in a smaller key. Google Fonts would cost two
more origins in `style-src` and `font-src`; `@fontsource` costs a handful of
woff2 files served from `'self'`, on a page that has to work on gym wifi
anyway. `styles.css` imports the **latin** subsets only — the app is English,
and the full imports shipped 60 font files where 14 are ever asked for.

`skip_app_build: true` stays in the deploy workflow, and matters for a
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

| Header | Here | Elsewhere | Why |
| --- | --- | --- | --- |
| `connect-src` | `login.microsoftonline.com`, `func-nygdev-api.azurewebsites.net`, `nygdevcdn.blob.core.windows.net` | the blob endpoint | Sign-in, the API, and the two CDN files — the exercise library and the built-in day templates. Three origins and no more; an exfiltration path would have to change this file to exist. |
| `frame-src` | `login.microsoftonline.com` | absent | MSAL's hidden-iframe path for silent renewal. Without it, silent renewal fails with a timeout that names nothing. |
| `frame-ancestors` | `'none'`, but `'self'` on `/auth.html` | `'none'` | The other half of that iframe. Entra redirects it back to the redirect URI, and a blanket `'none'` — with `X-Frame-Options: DENY` alongside it — blocks that even same-origin, which is the same nameless timeout. Relaxed on the bridge page only; the app itself stays unframeable. |
| `font-src` | `'self'` | absent | The two self-hosted typefaces. `default-src 'none'` means an unlisted `font-src` is `none`, and the app would silently fall back to system fonts. |
| `Cross-Origin-Opener-Policy` | `same-origin-allow-popups` | `same-origin` | `same-origin` severs the handle between opener and popup. The app signs in by redirect, so this is not load-bearing today — it is what keeps a popup flow from being a trap if one is ever added. |

The API's CORS list has to agree with the origin, and that list lives in
terraform (`site_config.cors` in `terraform/consumption.tf`) rather than in the
function code — the platform stamps the header and the function never sees the
preflight. Both `https://gym.nygard.dev` and the Static Web App's own hostname
are on it.

`style-src` is plain `'self'` here, where the other two sites need
`'unsafe-inline'` for their inlined `<style>` block. Vite emits the stylesheet
as a hashed same-origin file, and `404.html` links `404.css` rather than
carrying its own. The handful of inline `style` attributes in the app are
attributes, not blocks, and CSP does not govern them without
`style-src-attr` — MSAL's hidden renewal iframe relies on the same thing, since
it sets `element.style.visibility` through the CSSOM.

`Cross-Origin-Embedder-Policy` is **omitted** here, where the other two sites
set `credentialless`. It buys this page nothing — there is no
`SharedArrayBuffer` and no cross-origin isolation to earn — and it costs
something real: `credentialless` strips cookies from the sign-in iframe, so
silent renewal fails on a session that would otherwise have worked. A header
that only breaks a working path is not a security control.

### When sign-in fails

`SignInGate` pulls the `AADSTS` code out of the error and shows it on its own
line, with the fix for the ones that mean something specific about this setup.
The `ERROR_FIXES` table in `src/lib/errors.ts` is that list; the codes worth
knowing on sight are `AADSTS50011` (redirect URI not registered),
`AADSTS9002326` (registered under Web instead of SPA) and `AADSTS650053` (the
scope does not exist on the registration — see above).

An API failure is a different banner, and it prints the API's own `message`
unedited: those messages are written to be shown or logged as-is, and they name
the field, what arrived and what was expected.

### Tokens, storage, and what is on screen

MSAL caches in **`localStorage`** here. The token inspector this app replaced
chose `sessionStorage` for a good reason — it existed to *display* credentials,
so leaving them on disk was the cost rather than the point — and that reason no
longer applies: this is a logbook opened between sets on a phone that
backgrounds the tab, and a cache that dies with the tab means a redirect to
Entra in the middle of a workout. No token is rendered anywhere.

MSAL's logger stays **silenced**. Its verbose levels print tokens, and a token
in a console someone screen-shares from a gym floor is a token leaked to
everyone watching.

Everything the API returns reaches the DOM as JSX text, which React escapes —
never through `dangerouslySetInnerHTML`, which is not used anywhere in this
app. Exercise names are user input by design (a custom name is whatever its
owner typed), so they are rendered as data rather than markup.

**The user is the token.** No route, query string or body in this app carries a
user id; the Entra object id off the validated principal is the Cosmos
partition key, and it is the only thing that decides whose log you are reading.

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
