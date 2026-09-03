import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

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
            output: {
                // MSAL and React are most of the bundle and change only when a
                // dependency is bumped. Splitting them out means an app edit
                // reships ~20 kB rather than invalidating all 480 kB.
                manualChunks: (id) => (id.includes('node_modules') ? 'vendor' : undefined),
            },
        },
    },

    server: {
        port: 5173,
    },
});
