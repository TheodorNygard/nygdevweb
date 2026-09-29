import { useEffect, useState } from 'react';

/** How often to ask, and the least gap between two asks. */
const INTERVAL_MS = 10 * 60 * 1000;

/**
 * The hashed entry script of a page — `/assets/main-AbC123.js` — or null when
 * there is not one.
 *
 * That filename is the version. Vite names an entry after a hash of its content
 * *and* of the chunks it imports, so any change to the source changes it, and
 * nothing else does. It is also all a comparison needs: a deploy that changed
 * nothing the browser loads is not an update worth interrupting anybody for.
 *
 * Null in `vite dev`, where the entry is `/src/main.tsx` — there is no deploy
 * to be behind there, so the check quietly does nothing.
 */
function entryOf(scripts: Iterable<Element>): string | null {
    for (const script of scripts) {
        const source = script.getAttribute('src');

        if (source?.includes('/assets/')) return source;
    }

    return null;
}

function runningEntry(): string | null {
    return entryOf(document.querySelectorAll('script[type="module"][src]'));
}

/** What is deployed now, read out of `index.html` as the server would serve it. */
async function deployedEntry(): Promise<string | null> {
    // `no-store`, because the point is to see past every cache between here and
    // the origin. `/index.html` already answers `no-cache` (see
    // `staticwebapp.config.json`), so this costs a revalidation, not a download,
    // when nothing has changed.
    const response = await fetch('/index.html', { cache: 'no-store', credentials: 'omit' });

    if (!response.ok) return null;

    const html = new DOMParser().parseFromString(await response.text(), 'text/html');

    return entryOf(html.querySelectorAll('script[type="module"][src]'));
}

/**
 * Whether a newer build than the one running has been deployed.
 *
 * Needed because an installed PWA is rarely closed: the phone suspends it and
 * resumes it, and a resume is not a page load, so the app can go days on the
 * build it started with even though a reload would fetch the new one (the page
 * is `no-cache`, and every asset is named by its hash). There is no service
 * worker to notice on its own, so this asks.
 *
 * It asks rarely — every ten minutes while the app is on screen, and when it
 * comes back to the foreground if that many have passed — and never reloads by
 * itself. A set is written to the API the moment it is logged, so a reload
 * would lose little, but a page that reloads under a thumb is worse than one
 * that says an update is waiting and lets that be chosen. A plan being edited
 * on the Plan tab is what a surprise reload would actually cost.
 *
 * Once an update is found it stops asking: the answer cannot change back.
 * Failures are silent — offline in a basement is the ordinary case here, and
 * the next tick tries again.
 */
export function useUpdateCheck(): boolean {
    const [available, setAvailable] = useState(false);

    useEffect(() => {
        const running = runningEntry();

        if (running === null) return;

        let lastAsked = Date.now();
        let stopped = false;

        async function ask() {
            lastAsked = Date.now();

            try {
                const deployed = await deployedEntry();

                if (stopped || deployed === null || deployed === running) return;

                stopped = true;
                setAvailable(true);
            } catch {
                // Offline, or the request was blocked. Try again next time.
            }
        }

        const timer = window.setInterval(() => {
            if (document.visibilityState === 'visible' && !stopped) void ask();
        }, INTERVAL_MS);

        function onVisible() {
            if (
                document.visibilityState === 'visible'
                && !stopped
                && Date.now() - lastAsked >= INTERVAL_MS
            ) {
                void ask();
            }
        }

        document.addEventListener('visibilitychange', onVisible);

        return () => {
            stopped = true;
            window.clearInterval(timer);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, []);

    return available;
}
