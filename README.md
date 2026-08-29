# nygdevweb

Source for two static sites, each deployed to its own Azure Static Web App on
the free tier. No framework, no build step, no dependencies — HTML with styles
and SVG icons inlined, one script each, some favicons.

| Site | Folder | What it is |
| --- | --- | --- |
| [nygdev.dev](https://nygdev.dev) | `sites/nygdev/` | One-page personal site: profile links, a link to my LikeC4 architecture diagram, and a live status button for my self-hosted Foundry VTT server that can start the server when it's down |
| [run.nygard.dev](https://run.nygard.dev) | `sites/run/` | A button that calls the spot-read function app and shows the JSON it returns |

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

| Workflow | Deploys | `app_location` |
| --- | --- | --- |
| `.github/workflows/deploy-nygdev.yml` | nygdev.dev | `sites/nygdev` |
| `.github/workflows/deploy-run.yml` | run.nygard.dev | `sites/run` |

Azure auth uses OIDC federated credentials, so no long-lived deployment token
lives in GitHub; each workflow signs in with `azure/login` and fetches its
Static Web Apps token just-in-time. Both read the `AZURE_CLIENT_ID`,
`AZURE_TENANT_ID` and `AZURE_SUBSCRIPTION_ID` secrets, and each reads its own
resource-name variables:

| Variable | Used by |
| --- | --- |
| `AZURE_SWA_NAME`, `AZURE_SWA_RESOURCE_GROUP` | nygdev.dev |
| `AZURE_SWA_NAME_RUN`, `AZURE_SWA_RESOURCE_GROUP_RUN` | run.nygard.dev |

The deploy identity needs a role granting `Microsoft.Web/staticSites/listSecrets`
(e.g. Contributor) on **each** Static Web App. Setting that up from scratch
(federated credential subjects, the role grant) is written out in the history of
this file.

## run.nygard.dev and the function app

The page calls the function app directly from the browser. Free-tier SWA has no
linked-backend support and no proxying, so the call is cross-origin and three
things must name the same origin:

1. `SPOT_URL` in `sites/run/main.js`
2. `connect-src` in `sites/run/staticwebapp.config.json` — otherwise the CSP blocks it
3. the function app's CORS allowed origins, which must list `https://run.nygard.dev`

All three currently say `https://REPLACE-ME.azurewebsites.net` and need the real
hostname once the function app exists.

Use anonymous auth level on the function and rely on CORS. A function key put in
`main.js` is served to every visitor in plain text, so it authenticates nobody.
