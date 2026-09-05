import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

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

// `src/auth.ts` is the bridge entry; anything reachable from it is part of what
// auth.html downloads.
const BRIDGE_ENTRY = /[\/]src[\/]auth\.ts$/;

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

    resolve: {
        alias: { '@gym': GYM_SRC },
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
                // MSAL and React are most of the bundle and change only when a
                // dependency is bumped. Splitting them out means an app edit
                // reships a few kilobytes rather than invalidating all of it.
                //
                // Except for what auth.html touches, which gets a chunk of its
                // own — see the same block in the logger's config for why that
                // page has to stay small.
                manualChunks: (id, { getModuleInfo }) => {
                    if (!id.includes('node_modules')) return undefined;
                    if (reachedFromBridge(id, getModuleInfo)) return 'bridge';

                    return 'vendor';
                },
            },
        },
    },
});
