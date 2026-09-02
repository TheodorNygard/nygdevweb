import { CLAIM_ABOUT, TIME_CLAIMS, orderClaims } from '../lib/claims';
import { formatClaimValue, formatEpoch } from '../lib/format';

// The timestamps here are resolved once, when the table renders. They are
// absolute facts about the token ("issued at 14:02") rather than a countdown,
// so unlike the expiry pill there is nothing for them to tick towards.
export function ClaimsTable({ payload }: { payload: Record<string, unknown> }) {
    return (
        <div className="table-wrap">
            <table>
                <thead>
                    <tr>
                        <th>Claim</th>
                        <th>Value</th>
                        <th>What it is</th>
                    </tr>
                </thead>
                <tbody>
                    {orderClaims(payload).map((key) => {
                        const moment = TIME_CLAIMS.has(key) ? formatEpoch(payload[key]) : null;

                        return (
                            <tr key={key}>
                                <td className="claim-name">{key}</td>
                                <td className="claim-value">
                                    <div className="stack">
                                        <span>{formatClaimValue(payload[key])}</span>
                                        {moment ? (
                                            <span className="claim-extra">
                                                {moment.absolute} · {moment.relative}
                                            </span>
                                        ) : null}
                                    </div>
                                </td>
                                <td className="claim-about">{CLAIM_ABOUT[key] ?? ''}</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
