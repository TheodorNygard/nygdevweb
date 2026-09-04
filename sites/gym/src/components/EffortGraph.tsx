/**
 * The sawtooth — two mesocycles of three weeks, side by side.
 *
 * Effort climbs across the training weeks of a block, drops on the rest week
 * that ends it, and the next block picks up above where the last one started.
 * That shape is the entire argument for training in blocks, and it is far
 * easier to see than to read, which is why the intro draws it rather than
 * describing it.
 *
 * The numbers are illustrative, not derived. A real block's ramp is written in
 * reps left in the tank (see `repsInTank`), and a three-week one only has two
 * training weeks to spend it over — plotting that honestly would give two
 * near-identical bars and a cliff, which is the arithmetic rather than the
 * idea. What matters here is up-up-down, twice, a little higher the second
 * time.
 */

/** Plot geometry, in viewBox units. The SVG scales; these do not. */
const WIDTH = 320;
const HEIGHT = 104;
const TOP = 10;
const BASE = 94;

interface Block {
    label: string;
    /** One value per week, 0 at the baseline and 1 at the top of the plot. */
    effort: number[];
}

const BLOCKS: Block[] = [
    { label: 'MESO 1 · 3 WEEKS', effort: [0.5, 0.72, 0.26] },
    { label: 'MESO 2 · 3 WEEKS', effort: [0.64, 0.88, 0.3] },
];

const weeks = BLOCKS.flatMap((block, blockIndex) =>
    block.effort.map((effort, weekIndex) => ({
        blockIndex,
        week: weekIndex + 1,
        effort,
        // The last week of a block is its deload, here as everywhere else.
        rest: weekIndex === block.effort.length - 1,
    })),
);

const COLUMN = WIDTH / weeks.length;

/** A week's column centre. The label row under the plot is a matching grid. */
const xOf = (index: number) => COLUMN * (index + 0.5);

const yOf = (effort: number) => BASE - effort * (BASE - TOP);

const points = weeks.map((entry, index) => ({
    ...entry,
    x: xOf(index),
    y: yOf(entry.effort),
}));

const coordinates = points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`);

const line = coordinates.join(' ');

// The same line, closed back along the baseline, so the fill under it reads as
// accumulated work rather than as a stray stroke.
const area = `M ${coordinates.join(' L ')}`
    + ` L ${points[points.length - 1]!.x.toFixed(1)},${BASE}`
    + ` L ${points[0]!.x.toFixed(1)},${BASE} Z`;

/** Where one block ends and the next begins. */
const seam = COLUMN * BLOCKS[0]!.effort.length;

export function EffortGraph() {
    return (
        <figure className="ramp">
            <figcaption className="ramp__head">
                <span className="eyebrow">EFFORT</span>
                <span className="ramp__key">
                    <span className="ramp__dot" />
                    hard
                    <span className="ramp__dot ramp__dot--rest" />
                    rest
                </span>
            </figcaption>

            <svg
                className="ramp__plot"
                viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
                role="img"
                aria-label={
                    'Effort over two three-week mesocycles: it climbs for two weeks, drops for '
                    + 'the rest week, then climbs again from a higher start in the second block.'
                }
            >
                <defs>
                    <linearGradient id="ramp-fill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.22" />
                        <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
                    </linearGradient>
                </defs>

                <line
                    x1="0"
                    y1={BASE}
                    x2={WIDTH}
                    y2={BASE}
                    stroke="var(--line-strong)"
                    strokeWidth="1"
                />

                {/* The block boundary. Dashed, because nothing happens here —
                    it is the same lifter on the following Monday. */}
                <line
                    x1={seam}
                    y1={TOP - 4}
                    x2={seam}
                    y2={BASE}
                    stroke="var(--line-strong)"
                    strokeWidth="1"
                    strokeDasharray="3 4"
                />

                <path d={area} fill="url(#ramp-fill)" />

                <polyline
                    points={line}
                    fill="none"
                    stroke="var(--accent)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />

                {points.map((point) => (
                    <circle
                        key={`${point.blockIndex}-${point.week}`}
                        cx={point.x}
                        cy={point.y}
                        r={point.rest ? 3 : 3.5}
                        fill={point.rest ? 'var(--bg)' : 'var(--accent)'}
                        stroke={point.rest ? 'var(--fg-35)' : 'none'}
                        strokeWidth="1.5"
                    />
                ))}
            </svg>

            <div className="ramp__weeks">
                {points.map((point) => (
                    <span
                        key={`${point.blockIndex}-${point.week}`}
                        className={point.rest ? 'ramp__week ramp__week--rest' : 'ramp__week'}
                    >
                        W{point.week}
                    </span>
                ))}
            </div>

            <div className="ramp__blocks">
                {BLOCKS.map((block) => (
                    <span className="ramp__block" key={block.label}>{block.label}</span>
                ))}
            </div>
        </figure>
    );
}
