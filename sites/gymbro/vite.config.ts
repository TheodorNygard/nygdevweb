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
