# nygdevweb
https://nygdev.dev, hosted on free tier Azure Static Web App

## Deployment

Deploys run via GitHub Actions on every push to `master`
(`.github/workflows/azure-static-web-apps-brave-cliff-0253fca03.yml`).

Authentication to Azure uses **OIDC federated credentials** — no long-lived
deployment token is stored in GitHub. This matches the standard used by
`NygDev/NygDevAzure`: the workflow signs in with `azure/login@v2` and fetches
the Static Web Apps deployment token just-in-time via the Az CLI.

### Required GitHub configuration

Secrets (Settings → Secrets and variables → Actions → Secrets):

| Name | Value |
| --- | --- |
| `AZURE_CLIENT_ID` | App registration / managed identity client ID with a federated credential for this repo |
| `AZURE_TENANT_ID` | Entra tenant ID |
| `AZURE_SUBSCRIPTION_ID` | Subscription containing the Static Web App |

Variables (Settings → Secrets and variables → Actions → Variables):

| Name | Value |
| --- | --- |
| `AZURE_SWA_NAME` | Azure resource name of the Static Web App |
| `AZURE_SWA_RESOURCE_GROUP` | Resource group containing the Static Web App |

### Required Azure configuration

1. On the app registration (or user-assigned managed identity), add **federated
   credentials** scoped to this repo. At minimum:
   - `repo:TheodorNygard/nygdevweb:ref:refs/heads/master` (push deploys)
   - `repo:TheodorNygard/nygdevweb:pull_request` (PR preview/close deploys)
2. Grant that identity a role on the Static Web App that allows
   `Microsoft.Web/staticSites/listSecrets` (e.g. **Contributor**), so the
   workflow can read the deployment token at runtime.

Once OIDC is confirmed working, delete the old
`AZURE_STATIC_WEB_APPS_API_TOKEN_BRAVE_CLIFF_0253FCA03` secret.
