import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `dist/` is uploaded to Azure Static Web Apps as-is. `public/` carries what has
// to reach the site root untouched: favicons, the first-party 404 page, and
// staticwebapp.config.json — the security headers are read from the *deployed*
// root, so a copy left outside dist/ would silently stop applying.

// `src/auth.ts` is the bridge entry; anything reachable from it is part of what
// auth.html downloads.
const BRIDGE_ENTRY = /[\\/]src[\\/]auth\.ts$/;

type ModuleInfo = { importers: readonly string[]; dynamicImporters: readonly string[] } | null;

/**
 * Every answer this build has already worked out, kept across calls.
 *
 * `manualChunks` asks about every module in node_modules — several hundred, for
 * React and MSAL — and their importer graphs overlap almost entirely, so a walk
 * that started from nothing each time would re-tread the same edges once per
 * module. Caching across calls is safe because the graph is finished by the
 * time the chunking runs.
 */
const answers = new Map<string, boolean>();

/**
 * Whether `id` is reachable from the bridge entry. Walks importers back up to an
 * entry rather than the graph down from one, because `manualChunks` is called
 * per module and the finished graph reads the same in either direction.
 */
function reachedFromBridge(id: string, getModuleInfo: (id: string) => ModuleInfo): boolean {
    // Modules currently on the stack, and whether the walk had to step over one
    // of them. ES modules import in cycles, and a module still being resolved
    // has no answer to lend — so a `false` that leaned on one is provisional
    // and must not be cached, or a module the cycle turns out to reach would be
    // filed under `vendor` for the rest of the build.
    const stack = new Set<string>();
    let leanedOnStack = false;

    function walk(current: string): boolean {
        if (BRIDGE_ENTRY.test(current)) return true;

        const cached = answers.get(current);

        if (cached !== undefined) return cached;

        if (stack.has(current)) {
            leanedOnStack = true;

            return false;
        }

        stack.add(current);

        const outer = leanedOnStack;
        leanedOnStack = false;

        const info = getModuleInfo(current);
        const reached = info !== null
            && [...info.importers, ...info.dynamicImporters].some((importer) => walk(importer));

        // A `true` is a witnessed path and always keeps. A `false` only keeps
        // when nothing in the subtree below it was still being resolved.
        if (reached || !leanedOnStack) answers.set(current, reached);

        leanedOnStack = outer || leanedOnStack;
        stack.delete(current);

        return reached;
    }

    return walk(id);
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
