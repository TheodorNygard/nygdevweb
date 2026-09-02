import { useNow } from '../hooks/useNow';
import { relativeSeconds } from '../lib/format';

// Carries a relative time, so it goes stale just by being looked at. The timer
// lives in the component: a pill that unmounts because its token was replaced
// takes its ticking with it, which is what the pre-React version needed a
// hand-maintained registry to arrange.
export function ExpiryPill({ expSeconds }: { expSeconds: number }) {
    const now = useNow(1000);

    if (!Number.isFinite(expSeconds)) return null;

    const remaining = expSeconds - now / 1000;
    const valid = remaining > 0;

    return (
        <span className={`pill ${valid ? 'valid' : 'expired'}`}>
            {valid ? 'Expires ' : 'Expired '}
            {relativeSeconds(remaining)}
        </span>
    );
}
