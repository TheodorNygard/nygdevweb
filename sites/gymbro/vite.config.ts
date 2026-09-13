import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

import { bridgeChunks } from '../gym/vite.bridge-chunks';

// `dist/` is uploaded to Azure Static Web Apps as-is. `public/` carries what has
// to reach the site root untouched: favicons, the first-party 404 page, and
// staticwebapp.config.json — the security headers are read from the *deployed*
// root, so a copy left outside dist/ would silently stop applying.

/**
 * The logger's source tree, imported as `@gym/…`.
 *
 * The two sites talk to the same API with the same identity, so the wire types,
 * the block maths and the MSAL wiring are one thing rather than two. Reading
 * them from `sites/gym/src` is what keeps that true: a route that changes shape
 * breaks both builds at once, which is the whole reason `lib/types.ts` is
 * written as a transcription of the API in the first place. See
 * `src/lib/gym.ts` for what is imported and what deliberately is not.
 *
 * Absolute, because `resolve.alias` hands its value to the resolver unchanged
 * and a relative one would be resolved against whatever imported it.
 */
const GYM_SRC = fileURLToPath(new URL('../gym/src', import.meta.url));

export default defineConfig({
    plugins: [react()],

    resolve: {
        alias: { '@gym': GYM_SRC },

        // One copy of each of these in the bundle, whichever tree asks for it.
        //
        // The `@gym` alias hands Rollup files that live under `sites/gym/src`,
        // and a bare `import 'react'` inside one of them resolves by walking up
        // from *that* file — so it finds `sites/gym/node_modules/react` while
        // this app's own files find `sites/gymbro/node_modules/react`. Both get
        // bundled, and the two halves of the app then hold different React
        // instances.
        //
        // That reaches the browser as `Cannot read properties of null (reading
        // 'useState')` from inside the vendor chunk: hooks are dispatched
        // through a module-level current-dispatcher that only the rendering copy
        // sets, so a component from the other copy reads null. It names neither
        // React nor the duplication, and it cannot happen in `sites/gym`, which
        // has only one tree — it is specific to this build.
        //
        // MSAL is here for a related but separate reason. Two module copies mean
        // two PublicClientApplications, because the memoisation in
        // `@gym/lib/msal` is per module — which is precisely the race its own
        // comment exists to prevent, arriving by a different route.
        //
        // Not a substitute for installing both trees: tsc still resolves the
        // logger's imports from its own node_modules for the type check. This
        // governs what ships, that governs what compiles.
        dedupe: ['react', 'react-dom', '@azure/msal-browser'],
    },

    server: {
        port: 5174,

        // The alias points outside this project root, and Vite's dev server
        // refuses to serve a file it has not been told about. The build does
        // not need this — Rollup reads from disk directly.
        fs: { allow: ['..'] },
    },

    build: {
        // A data: URI would need the CSP widened to admit `data:`, and nothing
        // here is small enough for that to buy a request.
        assetsInlineLimit: 0,

        rollupOptions: {
            // Two pages, not one. `auth.html` is MSAL's redirect URI: the
            // hidden renewal iframe lands there, and it has ten seconds to load
            // and broadcast before the renewal gives up. A separate entry is
            // what keeps the app — React and all — off it. Paths are relative
            // to `root`, which is this directory.
            input: {
                main: 'index.html',
                auth: 'auth.html',
            },

            output: {
                // Splits MSAL's redirect bridge out of `vendor` so auth.html
                // downloads the few modules it reaches rather than all of
                // React. See `../gym/vite.bridge-chunks.ts`, shared with the
                // logger for the same reason `src/lib/gym.ts` reads its domain
                // layer: both sites have the same two entries and the same
                // reason to keep the second one small.
                manualChunks: bridgeChunks(),
            },
        },
    },
});
