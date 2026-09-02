# Vendored dependencies

One file, committed rather than fetched.

| File | Package | Version | Upstream |
| --- | --- | --- | --- |
| `msal-browser.min.js` | `@azure/msal-browser` | 5.20.0 | [AzureAD/microsoft-authentication-library-for-js](https://github.com/AzureAD/microsoft-authentication-library-for-js) (MIT) |

## Why it is committed instead of loaded from a CDN

`staticwebapp.config.json` sets `script-src 'self'`. A `<script>` pointing at
jsDelivr or the Microsoft CDN is blocked by that policy before it executes, and
the page fails with a bare "msal is not defined". Loosening the policy to admit
a CDN would mean trusting a third-party origin with script execution on a page
whose entire job is handling access tokens — exactly the page where that trade
is worst. So the bundle lives here and is served same-origin like `main.js`.

The UMD build is the one to take: it defines a `msal` global and needs no
bundler, which keeps the repo's no-build-step property intact.

## Verifying this file

The bytes came from the npm tarball, not from a CDN mirror:

```sh
curl -sSL https://registry.npmjs.org/@azure/msal-browser/-/msal-browser-5.20.0.tgz \
  | tar xzO package/lib/msal-browser.min.js \
  | sha256sum
```

Expected: `a55c19225885ae20c32780589ec23ed31990ce0c5ec56f7bc0a03d9f350c822e`

The file's first line carries its own version banner, so
`head -1 msal-browser.min.js` is the quick check that the table above still
describes what is on disk.

## Updating

Re-run the command above with the new version, replace the file, and update the
version, the digest and the banner check in this table together. There is no
lockfile and no `npm install` in the deploy path — this table is the record, so
an update that leaves it stale leaves nothing else to catch it.

Read the upstream changelog before bumping a major: MSAL's breaking changes are
usually in the configuration object and surface at runtime as a silent failure
to sign in, not as a build error, because there is no build.
