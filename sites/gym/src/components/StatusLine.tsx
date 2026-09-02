import type { Status } from '../hooks/useAuth';

export function StatusLine({ status }: { status: Status | null }) {
    return (
        <p className={`status${status ? ` ${status.kind}` : ''}`} role="status" aria-live="polite">
            {status?.message ?? ''}
        </p>
    );
}
