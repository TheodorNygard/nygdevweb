import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

export interface TabItem {
    id: string;
    label: string;
    content: ReactNode;
}

interface TabsProps {
    label: string;
    items: TabItem[];
}

// Selection is the only state, held in one place so what screen readers are
// told (aria-selected) and what the CSS styles cannot disagree. Arrow keys move
// between tabs: that is what the tablist role promises a keyboard user.
export function Tabs({ label, items }: TabsProps) {
    const [selected, setSelected] = useState(0);
    const base = useId();
    const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

    function move(index: number) {
        setSelected(index);
        tabRefs.current[index]?.focus();
    }

    function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
        const count = items.length;

        if (event.key === 'ArrowRight') move((selected + 1) % count);
        else if (event.key === 'ArrowLeft') move((selected - 1 + count) % count);
        else if (event.key === 'Home') move(0);
        else if (event.key === 'End') move(count - 1);
        else return;

        event.preventDefault();
    }

    return (
        <>
            <div className="tabs" role="tablist" aria-label={label} onKeyDown={onKeyDown}>
                {items.map((item, index) => (
                    <button
                        key={item.id}
                        ref={(node) => { tabRefs.current[index] = node; }}
                        className="tab"
                        type="button"
                        role="tab"
                        id={`${base}-tab-${item.id}`}
                        aria-controls={`${base}-panel-${item.id}`}
                        aria-selected={index === selected}
                        tabIndex={index === selected ? 0 : -1}
                        onClick={() => setSelected(index)}
                    >
                        {item.label}
                    </button>
                ))}
            </div>

            {items.map((item, index) => (
                <div
                    key={item.id}
                    className="tabpanel"
                    role="tabpanel"
                    id={`${base}-panel-${item.id}`}
                    aria-labelledby={`${base}-tab-${item.id}`}
                    hidden={index !== selected}
                >
                    {item.content}
                </div>
            ))}
        </>
    );
}
