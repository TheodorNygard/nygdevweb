import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `dist/` is uploaded to Azure Static Web Apps as-is. `public/` carries what
// has to reach the site root untouched: the favicons, the first-party 404 page,
// and staticwebapp.config.json — the security headers are read from the
// *deployed* root, so a copy left outside dist/ would silently stop applying.
export default defineConfig({
    plugins: [react()],

    build: {
        // The page prints tokens, so "nothing is sent anywhere but Entra ID"
        // should be checkable rather than promised. A sourcemap costs nothing
        // at runtime and makes the shipped bundle auditable against this source.
        sourcemap: true,

        // A data: URI would need the CSP widened to admit `data:`, and nothing
        // here is small enough for that to buy a request. Every asset stays a
        // same-origin file that `'self'` already covers.
        assetsInlineLimit: 0,
    },

    server: {
        port: 5173,
    },
});
