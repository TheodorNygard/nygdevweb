// How both sites split node_modules between the `bridge` chunk and `vendor`.
//
// gym.nygard.dev and gymbro.nygard.dev are two front ends onto one API signing
// in as one Entra registration, so they have the same two entries — the app and
// `auth.html`, MSAL's redirect URI — and the same reason to keep the second one
// small. The rule for telling their modules apart is therefore a fact about
// that shared MSAL setup rather than about either app, and it lives once, here,
// the same way `src/lib` does. See `sites/gymbro/src/lib/gym.ts` for the
// domain-layer half of the same arrangement.
//
// Imported by relative path rather than through the `@gym` alias: a Vite config
// is bundled by esbuild before any `resolve.alias` it declares exists.

/** `src/auth.ts` is the bridge entry; anything reachable from it is part of what auth.html downloads. */
const BRIDGE_ENTRY = /[\\/]src[\\/]auth\.ts$/;

type ModuleInfo = { importers: readonly string[]; dynamicImporters: readonly string[] } | null;

type GetModuleInfo = (id: string) => ModuleInfo;

/**
 * The `manualChunks` both configs use.
 *
 * MSAL and React are most of the bundle and change only when a dependency is
 * bumped. Splitting them out means an app edit reships a few kilobytes rather
 * than invalidating all of it.
 *
 * Except for what auth.html touches, which gets a chunk of its own. That page
 * is fetched inside an iframe on a ten-second clock over gym wifi, so what it
 * downloads has to be the few MSAL modules its bridge reaches and not all of
 * React — naming the chunk is what pins that, since left unassigned the bundler
 * folds them back into `vendor` alongside everything the app pulled in.
 *
 * A factory rather than a bare function, because of the cache inside it: one
 * per build, so `vite build --watch` cannot answer a rebuild out of the
 * previous build's graph.
 */
export function bridgeChunks(): (
    id: string,
    meta: { getModuleInfo: GetModuleInfo },
) => string | undefined {
    /**
     * Every answer this build has already worked out, kept across calls.
     *
     * `manualChunks` asks about every module in node_modules — several hundred,
     * for React and MSAL — and their importer graphs overlap almost entirely,
     * so a walk that started from nothing each time would re-tread the same
     * edges once per module. Caching across calls is safe because the graph is
     * finished by the time the chunking runs.
     */
    const answers = new Map<string, boolean>();

    /**
     * Whether `id` is reachable from the bridge entry. Walks importers back up
     * to an entry rather than the graph down from one, because `manualChunks`
     * is called per module and the finished graph reads the same in either
     * direction.
     */
    function reachedFromBridge(id: string, getModuleInfo: GetModuleInfo): boolean {
        // Modules currently on the stack, and whether the walk had to step over
        // one of them. ES modules import in cycles, and a module still being
        // resolved has no answer to lend — so a `false` that leaned on one is
        // provisional and must not be cached, or a module the cycle turns out
        // to reach would be filed under `vendor` for the rest of the build.
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

            // A `true` is a witnessed path and always keeps. A `false` only
            // keeps when nothing in the subtree below it was still being
            // resolved.
            if (reached || !leanedOnStack) answers.set(current, reached);

            leanedOnStack = outer || leanedOnStack;
            stack.delete(current);

            return reached;
        }

        return walk(id);
    }

    return (id, { getModuleInfo }) => {
        if (!id.includes('node_modules')) return undefined;
        if (reachedFromBridge(id, getModuleInfo)) return 'bridge';

        return 'vendor';
    };
}
