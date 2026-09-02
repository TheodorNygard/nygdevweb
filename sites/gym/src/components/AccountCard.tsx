import type { AccountInfo } from '@azure/msal-browser';

export function AccountCard({ account }: { account: AccountInfo }) {
    const facts: [label: string, value: string, plain: boolean][] = [
        ['Name', account.name || '—', true],
        ['Username', account.username || '—', false],
        ['Object ID (oid)', account.localAccountId || '—', false],
        ['Tenant (tid)', account.tenantId || '—', false],
        ['Home account ID', account.homeAccountId || '—', false],
    ];

    return (
        <section className="card">
            <div className="card-head">
                <h2>Signed in</h2>
                <div className="card-actions">
                    <span className="pill">{account.environment || 'login.microsoftonline.com'}</span>
                </div>
            </div>

            <div className="account-grid">
                {facts.map(([label, value, plain]) => (
                    <div key={label}>
                        <div className="fact-label">{label}</div>
                        <div className={`fact-value${plain ? ' plain' : ''}`}>{value}</div>
                    </div>
                ))}
            </div>
        </section>
    );
}
