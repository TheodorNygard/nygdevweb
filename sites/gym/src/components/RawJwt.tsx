import { type Ref } from 'react';

interface RawJwtProps {
    token: string;
    nodeRef?: Ref<HTMLPreElement>;
}

const SEGMENT_CLASSES = ['seg-h', 'seg-p', 'seg-s'];

// Three coloured spans and two dots. The dots are separate nodes so the segment
// boundaries survive for a reader who cannot tell the colours apart, and the
// legend names them in the same order. React escapes the interpolated text,
// which matters here: a JWT is attacker-influenced input.
export function RawJwt({ token, nodeRef }: RawJwtProps) {
    const parts = token.split('.');

    return (
        <>
            <pre className="jwt" ref={nodeRef}>
                {parts.map((part, index) => (
                    <span key={index}>
                        {index > 0 ? <span className="seg-dot">.</span> : null}
                        <span className={SEGMENT_CLASSES[index] ?? 'seg-s'}>{part}</span>
                    </span>
                ))}
            </pre>

            <p className="legend">
                <span className="l-h">header</span>
                <span className="l-p">payload</span>
                <span className="l-s">signature</span>
            </p>
        </>
    );
}
