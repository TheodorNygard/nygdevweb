import { useEffect, useState } from 'react';

// A relative time goes stale just by being looked at. Components that show one
// subscribe here rather than keeping a timer of their own, so a token that is
// replaced takes its ticking with it when it unmounts.
export function useNow(intervalMs = 1000): number {
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        const id = window.setInterval(() => setNow(Date.now()), intervalMs);

        return () => window.clearInterval(id);
    }, [intervalMs]);

    return now;
}
