import { num, rpeLabel } from '../lib/gym';
import { type LiftSeries } from '../lib/analytics';

interface AnalyticsScreenProps {
    series: LiftSeries[];
    selected: string | null;
    onSelect: (name: string) => void;

    /** Sessions read so far, out of how many the block holds. */
    done: number;
    total: number;
    loading: boolean;
}

/** The chart's viewBox, and the box the line is drawn inside it. */
const WIDTH = 660;
const HEIGHT = 240;
const LEFT = 34;
const TOP = 24;
const BOTTOM = 200;
const LABEL_Y = 232;

/**
 * How much headroom to leave above and below the line, as a share of its own
 * range.
 *
 * A lift that went 82.5 → 95 over a block has a range of twelve and a half
 * kilos, and drawn edge to edge that reads as a rocket. Padding it by a quarter
 * is what keeps the slope honest without flattening it into a line that says
 * nothing — and the floor matters more: a lift with one session has no range at
 * all, and without it every point would land on the same pixel.
 */
const PAD_SHARE = 0.25;
const PAD_FLOOR = 2.5;

/**
 * Progression, one lift at a time: the heaviest set of each session, in order.
 *
 * The only view here that needs the sets themselves, which is why it is a view
 * and not a panel — see `useWorkouts`. What it draws is what was lifted rather
 * than an estimate derived from it: no e1RM, because a number nobody has ever
 * put on a bar is a poor thing to plan the next session against.
 */
export function AnalyticsScreen({
    series,
    selected,
    onSelect,
    done,
    total,
    loading,
}: AnalyticsScreenProps) {
    const lift = series.find((one) => one.name === selected) ?? series[0] ?? null;
    const points = lift?.points ?? [];

    const weights = points.map((point) => point.weightKg);
    const low = weights.length > 0 ? Math.min(...weights) : 0;
    const high = weights.length > 0 ? Math.max(...weights) : 0;
    const pad = Math.max(PAD_FLOOR, (high - low) * PAD_SHARE);
    const min = low - pad;
    const max = high + pad;

    const scaleY = (weight: number) => BOTTOM - ((weight - min) / (max - min)) * (BOTTOM - TOP);
    const scaleX = (index: number) => LEFT
        + (index / Math.max(1, points.length - 1)) * (WIDTH - LEFT - 16);

    const plotted = points.map((point, index) => ({
        ...point,
        x: Math.round(scaleX(index)),
        y: Math.round(scaleY(point.weightKg)),
    }));

    const gridLines = [0, 1, 2, 3].map((step) => {
        const weight = min + ((max - min) / 3) * (3 - step);

        return { y: Math.round(scaleY(weight)), label: Math.round(weight) };
    });

    // Every point is labelled on a short block and every third on a long one:
    // twenty-four dates along 660 units is a grey smear, not an axis.
    const labelEvery = Math.ceil(plotted.length / 9);

    if (series.length === 0) {
        return (
            <div className="view">
                <section className="panel">
                    <span className="panel__label">PROGRESSION</span>
                    <p className="empty" style={{ paddingLeft: 0 }}>
                        {loading
                            ? `Reading sessions — ${done} of ${total}.`
                            : 'Nothing submitted in this block yet. A chart needs sets, and sets '
                                + 'come from the phone.'}
                    </p>
                </section>
            </div>
        );
    }

    return (
        <div className="view stats">
            <div className="stats__list">
                <span className="stats__list-label">TRACKED LIFTS</span>
                {series.map((one) => {
                    const first = one.points[0];
                    const last = one.points[one.points.length - 1];

                    return (
                        <button
                            key={one.name}
                            type="button"
                            className={
                                one.name === lift?.name ? 'lift-item lift-item--on' : 'lift-item'
                            }
                            aria-pressed={one.name === lift?.name}
                            onClick={() => onSelect(one.name)}
                        >
                            <span className="lift-item__name">{one.name}</span>
                            <span className="lift-item__sub">
                                {first && last && first !== last
                                    ? `${num(first.weightKg)} → ${num(last.weightKg)} kg`
                                    : `${num(last?.weightKg ?? 0)} kg`}
                            </span>
                        </button>
                    );
                })}
            </div>

            <div className="stats__main">
                <section className="panel">
                    <div className="stats__head">
                        <div>
                            <div className="panel__label">TOP SET · WEIGHT × REPS</div>
                            <div className="stats__title">{lift?.name ?? '—'}</div>
                        </div>
                        <div className="stats__figures">
                            <div>
                                <div className="figure__key">BEST</div>
                                <div className="figure__value">{`${num(high)} kg`}</div>
                            </div>
                            <div>
                                <div className="figure__key">CHANGE</div>
                                <div className="figure__value">
                                    {`${(lift?.change ?? 0) >= 0 ? '+' : ''}${num(lift?.change ?? 0)} kg`}
                                </div>
                            </div>
                            <div>
                                <div className="figure__key">SESSIONS</div>
                                <div className="figure__value">{points.length}</div>
                            </div>
                        </div>
                    </div>

                    <svg
                        className="chart"
                        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
                        role="img"
                        aria-label={`Top set of ${lift?.name ?? 'this lift'}, session by session`}
                    >
                        {gridLines.map((line) => (
                            <g key={line.y}>
                                <line
                                    className="chart__grid"
                                    x1={LEFT}
                                    y1={line.y}
                                    x2={WIDTH}
                                    y2={line.y}
                                />
                                <text className="chart__tick" x={0} y={line.y + 3}>
                                    {line.label}
                                </text>
                            </g>
                        ))}

                        {plotted.length > 1 ? (
                            <polyline
                                className="chart__line"
                                points={plotted.map((point) => `${point.x},${point.y}`).join(' ')}
                            />
                        ) : null}

                        {plotted.map((point, index) => (
                            <g key={point.sessionId}>
                                <circle className="chart__point" cx={point.x} cy={point.y} r={4}>
                                    <title>
                                        {`${point.date} · ${num(point.weightKg)} kg × ${point.reps}`}
                                    </title>
                                </circle>
                                {index % labelEvery === 0 ? (
                                    <text
                                        className="chart__tick"
                                        x={point.x}
                                        y={LABEL_Y}
                                        textAnchor="middle"
                                    >
                                        {point.date}
                                    </text>
                                ) : null}
                            </g>
                        ))}
                    </svg>
                </section>

                <section className="panel">
                    <div className="panel__head">
                        <span className="panel__label">EVERY LOGGED SESSION</span>
                        {loading ? (
                            <span className="progress-note">{`reading ${done}/${total}`}</span>
                        ) : null}
                    </div>

                    <div className="sets-table sets-table--head" role="presentation">
                        <span>DATE</span>
                        <span>TOP SET</span>
                        <span>SETS</span>
                        <span style={{ textAlign: 'right' }}>RPE</span>
                    </div>

                    <div className="rows">
                        {[...plotted].reverse().map((point) => (
                            <div key={point.sessionId} className="sets-table">
                                <span className="sets-table__date">{point.date}</span>
                                <span className="sets-table__top">
                                    {`${num(point.weightKg)} kg × ${point.reps}`}
                                </span>
                                <span className="sets-table__sets">{`${point.sets} sets`}</span>
                                <span className="sets-table__rpe">{rpeLabel(point.rpe)}</span>
                            </div>
                        ))}
                    </div>
                </section>
            </div>
        </div>
    );
}
