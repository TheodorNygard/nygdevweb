import type { AuthenticationResult } from '@azure/msal-browser';

import { JsonBlock } from './JsonBlock';
import { TokenCard } from './TokenCard';

const OPAQUE_NOTE =
    'This access token is opaque — it is not a readable JWS, so there are no '
    + 'claims to show. That is normal for Microsoft Graph and for any resource '
    + 'that has not opted into the readable v2 format. The token is still valid; '
    + 'only the resource it was minted for is meant to look inside it. Ask for a '
    + 'scope on your own API registration to get one you can read.';

interface AccessTokenCardProps {
    result: AuthenticationResult | null;
    scope: string;
    acquiring: boolean;
    onScopeChange: (scope: string) => void;
    onAcquire: () => void;
}

export function AccessTokenCard({ result, scope, acquiring, onScopeChange, onAcquire }: AccessTokenCardProps) {
    // The AuthenticationResult, minus the tokens themselves — they are already
    // on screen in full, and repeating them here would only make the panel
    // harder to read. `fromCache` is the interesting field: a token MSAL served
    // from its own cache never touched the network on this click.
    const summary = result
        ? {
            scopes: result.scopes,
            tokenType: result.tokenType,
            expiresOn: result.expiresOn,
            extExpiresOn: result.extExpiresOn,
            fromCache: result.fromCache,
            correlationId: result.correlationId,
            authority: result.authority,
            uniqueId: result.uniqueId,
            tenantId: result.tenantId,
            account: result.account ? result.account.homeAccountId : null,
        }
        : null;

    const expiresOn = result?.expiresOn ? new Date(result.expiresOn).getTime() / 1000 : NaN;

    return (
        <TokenCard
            title="Access token"
            token={result?.accessToken ?? null}
            tabsLabel="Access token views"
            opaqueNote={OPAQUE_NOTE}
            fallbackExp={expiresOn}
            extraTabs={summary
                ? [{ id: 'result', label: 'MSAL result', content: <JsonBlock value={summary} /> }]
                : []}
            emptyMessage={
                <p className="empty">
                    No access token yet. Enter a scope and press <strong>Get token</strong>.
                </p>
            }
        >
            <div className="field">
                <label htmlFor="apiScope">Resource scope</label>
                <div className="field-row">
                    <input
                        type="text"
                        id="apiScope"
                        spellCheck={false}
                        autoComplete="off"
                        placeholder="api://00000000-0000-0000-0000-000000000000/access_as_user"
                        value={scope}
                        onChange={(event) => onScopeChange(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key !== 'Enter') return;

                            event.preventDefault();
                            onAcquire();
                        }}
                    />
                    <button
                        className={`button secondary${acquiring ? ' loading' : ''}`}
                        type="button"
                        onClick={onAcquire}
                        disabled={acquiring}
                    >
                        <span className="spinner" />
                        <span>Get token</span>
                    </button>
                </div>
                <p className="field-note">
                    One scope on the API registration you want a token <em>for</em>. Silent first;
                    the page falls back to an interactive prompt when consent or a fresh
                    sign-in is required.
                </p>
            </div>
        </TokenCard>
    );
}
