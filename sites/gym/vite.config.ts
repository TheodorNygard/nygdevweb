import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

import { bridgeChunks } from './vite.bridge-chunks';

// `dist/` is uploaded to Azure Static Web Apps as-is. `public/` carries what has
// to reach the site root untouched: favicons, the first-party 404 page, and
// staticwebapp.config.json — the security headers are read from the *deployed*
// root, so a copy left outside dist/ would silently stop applying.

export default defineConfig({
    plugins: [react()],

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
                // React. See `vite.bridge-chunks.ts`, which gymbro shares.
                manualChunks: bridgeChunks(),
            },
        },
    },

    server: {
        port: 5173,
    },
});
