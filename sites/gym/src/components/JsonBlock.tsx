import { formatJson } from '../lib/format';

export function JsonBlock({ value }: { value: unknown }) {
    return <pre className="json">{formatJson(value)}</pre>;
}

export function JsonPlaceholder({ text }: { text: string }) {
    return <pre className="json">{text}</pre>;
}
