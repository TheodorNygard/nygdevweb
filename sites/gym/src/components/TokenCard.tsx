import { useMemo, useRef, type ReactNode } from 'react';

import { ClaimsTable } from './ClaimsTable';
import { CopyButton } from './CopyButton';
import { ExpiryPill } from './ExpiryPill';
import { JsonBlock, JsonPlaceholder } from './JsonBlock';
import { RawJwt } from './RawJwt';
import { Tabs, type TabItem } from './Tabs';
import { decodeJwt } from '../lib/jwt';

interface TokenCardProps {
    title: string;

    // null while there is no token. The access token card spends most of its
    // life that way; the ID token card is simply not rendered.
    token: string | null;

    tabsLabel: string;

    // Rendered between the heading and the token, for the access token card's
    // resource-scope box.
    children?: ReactNode;

    // Shown in place of the token body when there is no token yet.
    emptyMessage?: ReactNode;

    // Panels after the three standard ones — the access token card adds the
    // MSAL result there.
    extraTabs?: TabItem[];

    // Only an access token can legitimately be unreadable, and only its card
    // passes this. Without it an undecodable token is reported as the bug it is
    // — the right answer for an ID token.
    opaqueNote?: string;

    // Where the expiry comes from when the token will not decode: MSAL's
    // AuthenticationResult knows when an opaque token expires.
    fallbackExp?: number;
}

export function TokenCard(props: TokenCardProps) {
    const { title, token, tabsLabel, children, emptyMessage, extraTabs = [], opaqueNote, fallbackExp } = props;

    const rawRef = useRef<HTMLPreElement>(null);
    // The pill next to this ticks on its own timer; without the memo every tick
    // would base64-decode and re-parse the whole token.
    const decoded = useMemo(() => (token ? decodeJwt(token) : null), [token]);

    const decodedExp = decoded ? Number(decoded.payload['exp']) : NaN;
    const exp = Number.isFinite(decodedExp) ? decodedExp : (fallbackExp ?? NaN);

    const placeholder = opaqueNote ? 'Opaque token' : 'Not a decodable JWT';

    const tabs: TabItem[] = [
        {
            id: 'claims',
            label: 'Claims',
            content: decoded
                ? <ClaimsTable payload={decoded.payload} />
                : <p className="empty">{placeholder} — no claims to show.</p>,
        },
        {
            id: 'payload',
            label: 'Payload JSON',
            content: decoded
                ? <JsonBlock value={decoded.payload} />
                : <JsonPlaceholder text={`${placeholder} — no readable payload.`} />,
        },
        {
            id: 'header',
            label: 'Header JSON',
            content: decoded
                ? <JsonBlock value={decoded.header} />
                : <JsonPlaceholder text={`${placeholder} — no readable header.`} />,
        },
        ...extraTabs,
    ];

    return (
        <section className="card">
            <div className="card-head">
                <h2>{title}</h2>
                {token ? (
                    <div className="card-actions">
                        <ExpiryPill expSeconds={exp} />
                        <CopyButton label="Copy token" value={token} fallbackTarget={rawRef} />
                    </div>
                ) : null}
            </div>

            {children}

            {token ? (
                <>
                    <RawJwt token={token} nodeRef={rawRef} />
                    {opaqueNote && !decoded ? <p className="hint">{opaqueNote}</p> : null}
                    <Tabs label={tabsLabel} items={tabs} />
                </>
            ) : emptyMessage}
        </section>
    );
}
