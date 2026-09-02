import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The output of this build is uploaded to Azure Static Web Apps as-is, from
// `dist/`. `public/` carries the files that have to reach the site root
// untouched: the favicons, the first-party 404 page, and
// staticwebapp.config.json — the security headers are read from the *deployed*
// root, so a copy left outside dist/ would silently stop applying.
export default defineConfig({
    plugins: [react()],

    build: {
        // The page prints tokens, and the CSP is what makes "nothing is sent
        // anywhere but Entra ID" checkable rather than a promise. A sourcemap
        // costs nothing at runtime and makes the shipped bundle auditable
        // against this source.
        sourcemap: true,

        // Anything inlined as a data: URI would need the CSP widened to admit
        // `data:` for that directive. Nothing here is small enough for it to
        // buy a request, so the threshold goes to zero and every asset stays a
        // same-origin file that `'self'` already covers.
        assetsInlineLimit: 0,
    },

    server: {
        port: 5173,
    },
});
