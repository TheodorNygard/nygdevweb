import { type MesocycleSummary } from '../lib/gym';

/** The four views, and the numbers beside them in the design. */
export const VIEWS = [
    { id: 'dashboard', label: 'Dashboard', key: '01' },
    { id: 'block', label: 'Block', key: '02' },
    { id: 'library', label: 'Library', key: '03' },
    { id: 'stats', label: 'Analytics', key: '04' },
] as const;

export type View = (typeof VIEWS)[number]['id'];

interface RailProps {
    view: View;
    onView: (view: View) => void;
    blocks: MesocycleSummary[];
    blocksLoading: boolean;
    selectedId: string | null;
    onSelect: (mesoId: string) => void;
    onCreate: () => void;
    busy: boolean;
    account: string;
    onSignOut: () => void;
}

/** `magnus@nygard.dev` → `MN`, and a single-word name → its first two letters. */
function initials(account: string): string {
    const local = account.split('@')[0] ?? account;
    const parts = local.split(/[._-]+/).filter(Boolean);

    if (parts.length >= 2) return `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}`.toUpperCase();

    return local.slice(0, 2).toUpperCase();
}

/**
 * The sidebar: the four views, every block, and who is signed in.
 *
 * Picking a block here **selects** it rather than switching to it. Switching is
 * a write — `PUT /gym/mesocycles/current` — and it changes what the phone opens
 * on, which is not what clicking a row in a list should mean. Every view on
 * this site reads the selected block, so a past block can be read and edited
 * without disturbing the one being trained; the Block view carries the explicit
 * button for when moving the phone *is* what you meant.
 */
export function Rail({
    view,
    onView,
    blocks,
    blocksLoading,
    selectedId,
    onSelect,
    onCreate,
    busy,
    account,
    onSignOut,
}: RailProps) {
    return (
        <aside className="rail">
            <div className="rail__brand">
                <div className="rail__mark">
                    <span className="rail__glyph">G</span>
                    <span className="rail__word">gymbro</span>
                </div>
                <div className="rail__kicker">PLANNER · DESKTOP</div>
            </div>

            <nav className="rail__nav" aria-label="Views">
                {VIEWS.map((item) => (
                    <button
                        key={item.id}
                        type="button"
                        className={item.id === view ? 'nav-item nav-item--on' : 'nav-item'}
                        aria-current={item.id === view ? 'page' : undefined}
                        onClick={() => onView(item.id)}
                    >
                        <span className="nav-item__key">{item.key}</span>
                        <span className="nav-item__label">{item.label}</span>
                    </button>
                ))}
            </nav>

            <div>
                <div className="rail__section">BLOCKS</div>
                <div className="rail__blocks">
                    {blocks.map((block) => (
                        <button
                            key={block.id}
                            type="button"
                            className={
                                block.id === selectedId ? 'block-item block-item--on' : 'block-item'
                            }
                            aria-pressed={block.id === selectedId}
                            onClick={() => onSelect(block.id)}
                        >
                            <span className="block-item__name">
                                {block.name}
                                {block.isCurrent ? <span className="pill">ON PHONE</span> : null}
                            </span>
                            <span className="block-item__sub">
                                {`${block.weeks} weeks · ${block.days.length} days`}
                                {` · ${block.submittedCount} logged`}
                            </span>
                        </button>
                    ))}

                    {blocks.length === 0 && !blocksLoading ? (
                        <p className="rail__note-body">No blocks yet. Start one below.</p>
                    ) : null}

                    <button type="button" className="rail__add" onClick={onCreate} disabled={busy}>
                        + New block
                    </button>
                </div>
            </div>

            <div className="rail__foot">
                <div className="rail__note">
                    <div className="rail__note-title">LOGGING</div>
                    <p className="rail__note-body">
                        Sets are logged on the phone. This is where the block gets planned.
                    </p>
                    <a
                        className="rail__note-link"
                        href="https://gym.nygard.dev"
                        target="_blank"
                        rel="noreferrer"
                    >
                        gym.nygard.dev →
                    </a>
                </div>
                <div className="rail__account">
                    <span className="rail__avatar">{initials(account)}</span>
                    <span className="rail__email" title={account}>{account}</span>
                    <button type="button" className="rail__signout" onClick={onSignOut}>
                        Sign out
                    </button>
                </div>
            </div>
        </aside>
    );
}
