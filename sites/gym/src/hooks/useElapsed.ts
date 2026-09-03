import { useEffect, useState } from 'react';

/**
 * Seconds since the session screen opened.
 *
 * Client-side and deliberately so: the API stores no timestamp finer than the
 * day, so there is no server-side start to count from — which is why History
 * shows a date where the prototype showed a duration.
 *
 * `Date.now()` rather than an incrementing counter: a phone that sleeps between
 * sets stops firing the interval, and a counter would come back showing the
 * time the screen was awake instead of the time the workout took.
 */
export function useElapsed(startedAt: number | null): number {
    const [seconds, setSeconds] = useState(0);

    useEffect(() => {
        if (startedAt === null) {
            setSeconds(0);

            return;
        }

        const tick = () => setSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));

        tick();

        const timer = window.setInterval(tick, 1000);

        return () => window.clearInterval(timer);
    }, [startedAt]);

    return seconds;
}
