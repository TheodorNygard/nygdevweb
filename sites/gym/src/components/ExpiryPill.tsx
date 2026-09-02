import { useEffect, useState } from 'react';

import { useNow } from '../hooks/useNow';
import { relativeSeconds } from '../lib/format';

// How often the text can actually change. relativeSeconds counts seconds only
// below a minute; above that a one-second tick re-renders 59 times to redraw
// the same string. The 90s threshold is wider than the slow tick, so the switch
// to counting seconds always happens before the last minute starts.
function tickFor(remaining: number): number {
    return Math.abs(remaining) < 90 ? 1000 : 30000;
}

// Carries a relative time, so it goes stale just by being looked at. The timer
// lives in the component: a pill that unmounts because its token was replaced
// takes its ticking with it.
export function ExpiryPill({ expSeconds }: { expSeconds: number }) {
    // Seeded from the clock so a token that expires hours from now starts on
    // the slow tick rather than spending its first render at one per second.
    const [tick, setTick] = useState(() => tickFor(expSeconds - Date.now() / 1000));
    const now = useNow(tick);
    const remaining = expSeconds - now / 1000;

    // `wanted` only ever holds one of two values, so this settles rather than
    // firing on every tick.
    const wanted = tickFor(remaining);

    useEffect(() => { setTick(wanted); }, [wanted]);

    if (!Number.isFinite(expSeconds)) return null;

    const valid = remaining > 0;

    return (
        <span className={`pill ${valid ? 'valid' : 'expired'}`}>
            {valid ? 'Expires ' : 'Expired '}
            {relativeSeconds(remaining)}
        </span>
    );
}
