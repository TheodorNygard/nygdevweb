import { useState } from 'react';

import { CopyButton } from './CopyButton';
import { DEFAULTS, REDIRECT_URI, clearConfig, saveConfig, type InspectorConfig, type Interaction } from '../lib/config';

interface SettingsPanelProps {
    config: InspectorConfig;

    // The resource-scope box lives on the access token card, not here, but it
    // is part of the same saved object. Taking its live value as a prop keeps
    // "Save and reload" from discarding a scope typed but not yet requested.
    apiScope: string;

    onSaveFailed: (message: string) => void;
}

export function SettingsPanel({ config, apiScope, onSaveFailed }: SettingsPanelProps) {
    const [draft, setDraft] = useState<InspectorConfig>(config);

    function set<K extends keyof InspectorConfig>(key: K, value: InspectorConfig[K]) {
        setDraft((current) => ({ ...current, [key]: value }));
    }

    function save() {
        const next: InspectorConfig = {
            clientId: draft.clientId.trim() || DEFAULTS.clientId,
            tenant: draft.tenant.trim() || DEFAULTS.tenant,
            loginScopes: draft.loginScopes.trim() || DEFAULTS.loginScopes,
            interaction: draft.interaction,
            apiScope: apiScope.trim(),
        };

        if (!saveConfig(next)) {
            onSaveFailed('Could not save — localStorage is unavailable in this browser context.');

            return;
        }

        // A reload rather than a live rebuild. MSAL reads clientId and authority
        // once, at construction, and recreating the instance while a cached
        // account from the previous client id is still in sessionStorage gives
        // errors that name neither configuration.
        window.location.reload();
    }

    function reset() {
        clearConfig();
        window.location.reload();
    }

    return (
        <details className="settings">
            <summary>
                Configuration
                <span className="summary-note">{config.clientId} · {config.tenant}</span>
            </summary>

            <div className="settings-body">
                <div className="settings-grid">
                    <div className="field">
                        <label htmlFor="clientId">Client ID (this SPA)</label>
                        <input
                            type="text"
                            id="clientId"
                            spellCheck={false}
                            autoComplete="off"
                            placeholder="00000000-0000-0000-0000-000000000000"
                            value={draft.clientId}
                            onChange={(event) => set('clientId', event.target.value)}
                        />
                        <p className="field-note">
                            The app registration the page signs in <em>as</em>. Ends up in the{' '}
                            <code>appid</code>/<code>azp</code> claim.
                        </p>
                    </div>

                    <div className="field">
                        <label htmlFor="tenant">Tenant</label>
                        <input
                            type="text"
                            id="tenant"
                            spellCheck={false}
                            autoComplete="off"
                            placeholder="organizations"
                            value={draft.tenant}
                            onChange={(event) => set('tenant', event.target.value)}
                        />
                        <p className="field-note">
                            A tenant GUID, a verified domain, or one of <code>organizations</code>,{' '}
                            <code>common</code>, <code>consumers</code>.
                        </p>
                    </div>

                    <div className="field">
                        <label htmlFor="loginScopes">Sign-in scopes</label>
                        <input
                            type="text"
                            id="loginScopes"
                            spellCheck={false}
                            autoComplete="off"
                            placeholder="openid profile offline_access"
                            value={draft.loginScopes}
                            onChange={(event) => set('loginScopes', event.target.value)}
                        />
                        <p className="field-note">
                            Space-separated, requested at sign-in. MSAL adds <code>openid</code> and{' '}
                            <code>profile</code> whether or not they are listed.
                        </p>
                    </div>

                    <div className="field">
                        <label htmlFor="interaction">Interaction</label>
                        <select
                            id="interaction"
                            value={draft.interaction}
                            onChange={(event) => set('interaction', event.target.value as Interaction)}
                        >
                            <option value="redirect">Redirect (full-page navigation)</option>
                            <option value="popup">Popup window</option>
                        </select>
                        <p className="field-note">
                            Redirect is the default. Popup needs the site&rsquo;s{' '}
                            <code>Cross-Origin-Opener-Policy</code> to allow it, which this one does.
                        </p>
                    </div>
                </div>

                <div className="field">
                    <label htmlFor="redirectUri">Redirect URI (register this exact string)</label>
                    <div className="field-row">
                        <input type="text" id="redirectUri" readOnly spellCheck={false} value={REDIRECT_URI} />
                        <CopyButton value={REDIRECT_URI} />
                    </div>
                    <p className="field-note">
                        Add it under <strong>App registrations → Authentication → Add a platform →
                        Single-page application</strong>. The SPA platform is what enables
                        authorization code + PKCE with no client secret; adding the same URI
                        under &ldquo;Web&rdquo; instead fails with <code>AADSTS9002326</code>.
                    </p>
                </div>

                <div className="card-actions">
                    <button className="button secondary" type="button" onClick={save}>Save and reload</button>
                    <button className="ghost" type="button" onClick={reset}>Reset to defaults</button>
                </div>

                <p className="hint">
                    Saved in <code>localStorage</code> on this device only. Changing the client ID or
                    tenant rebuilds the MSAL instance, which is why saving reloads the page.
                </p>
            </div>
        </details>
    );
}
