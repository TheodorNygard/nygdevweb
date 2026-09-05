import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `dist/` is uploaded to Azure Static Web Apps as-is. `public/` carries what has
// to reach the site root untouched: favicons, the first-party 404 page, and
// staticwebapp.config.json — the security headers are read from the *deployed*
// root, so a copy left outside dist/ would silently stop applying.

// `src/auth.ts` is the bridge entry; anything reachable from it is part of what
// auth.html downloads.
const BRIDGE_ENTRY = /[\\/]src[\\/]auth\.ts$/;

/**
 * Whether `id` is reachable from the bridge entry. Walks importers back up to an
 * entry rather than the graph down from one, because `manualChunks` is called
 * per module and the finished graph reads the same in either direction.
 */
function reachedFromBridge(
    id: string,
    getModuleInfo: (id: string) => { importers: readonly string[]; dynamicImporters: readonly string[] } | null,
    seen: Set<string> = new Set(),
): boolean {
    if (BRIDGE_ENTRY.test(id)) return true;
    if (seen.has(id)) return false;

    seen.add(id);

    const info = getModuleInfo(id);

    if (!info) return false;

    return [...info.importers, ...info.dynamicImporters]
        .some((importer) => reachedFromBridge(importer, getModuleInfo, seen));
}

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
                // MSAL and React are most of the bundle and change only when a
                // dependency is bumped. Splitting them out means an app edit
                // reships ~20 kB rather than invalidating all 480 kB.
                //
                // Except for what auth.html touches, which gets a chunk of its
                // own. That page is fetched inside an iframe on a ten-second
                // clock over gym wifi, so what it downloads has to be the few
                // MSAL modules its bridge reaches and not all of React —
                // naming the chunk is what pins that, since left unassigned the
                // bundler folds them back into `vendor` alongside everything
                // the app pulled in.
                manualChunks: (id, { getModuleInfo }) => {
                    if (!id.includes('node_modules')) return undefined;
                    if (reachedFromBridge(id, getModuleInfo)) return 'bridge';

                    return 'vendor';
                },
            },
        },
    },

    server: {
        port: 5173,
    },
});
