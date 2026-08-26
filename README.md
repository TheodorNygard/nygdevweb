# nygdevweb

The source for [nygdev.dev](https://nygdev.dev) — a one-page personal site: a
couple of profile links, a link to my LikeC4 architecture diagram, plus a live
status button for my self-hosted Foundry VTT server that can start the server
when it's down.

No framework, no build step, no dependencies. One HTML file with its styles and
SVG icons inlined, one script, some favicons. Hosted as an Azure Static Web App
on the free tier.

| Path | What it is |
| --- | --- |
| `index.html` | The page — markup, styles, inline SVG icon sprites |
| `main.js` | Light/dark theme toggle, Foundry status polling, start-server webhook |
| `staticwebapp.config.json` | Security headers (CSP, HSTS, frame options, referrer policy, cross-origin isolation) |
| `.github/workflows/` | Azure Static Web Apps deploy |

## Deployment

Deploys are **manual** — run the workflow from the Actions tab. Auto-deploy on
push and PR is intentionally off.

Azure auth uses OIDC federated credentials, so no long-lived deployment token
lives in GitHub; the workflow signs in with `azure/login` and fetches the Static
Web Apps token just-in-time. It reads the `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`
and `AZURE_SUBSCRIPTION_ID` secrets and the `AZURE_SWA_NAME` and
`AZURE_SWA_RESOURCE_GROUP` variables.

Setting that up from scratch (federated credential subjects, the role granting
`listSecrets`) is written out in the history of this file.
