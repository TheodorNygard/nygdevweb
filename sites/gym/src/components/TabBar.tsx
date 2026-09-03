export type Tab = 'today' | 'plan' | 'history';

const TABS: { key: Tab; label: string }[] = [
    { key: 'today', label: 'Today' },
    { key: 'plan', label: 'Plan' },
    { key: 'history', label: 'History' },
];

interface TabBarProps {
    active: Tab;
    onPick: (tab: Tab) => void;
}

export function TabBar({ active, onPick }: TabBarProps) {
    return (
        <nav className="tabs" aria-label="Sections">
            {TABS.map((tab) => (
                <button
                    key={tab.key}
                    type="button"
                    className={tab.key === active ? 'tab tab--on' : 'tab'}
                    onClick={() => onPick(tab.key)}
                    aria-current={tab.key === active ? 'page' : undefined}
                >
                    {tab.label}
                </button>
            ))}
        </nav>
    );
}
