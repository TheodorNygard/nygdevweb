import { groupOf } from '../lib/groups';
import {
    isRestWeek,
    kg,
    progressOf,
    repsInTank,
    rpeLabel,
    sessionDateLabel,
    setsForWeek,
    type MesocycleSummary,
    type SessionSummary,
} from '../lib/gym';

interface DashboardScreenProps {
    block: MesocycleSummary;
    sessions: SessionSummary[];
    loading: boolean;
    week: number;
    onWeek: (week: number) => void;
    onEditPlan: () => void;
}

/** The volume chart's viewBox, and the tallest a bar is allowed to draw in it. */
const CHART_WIDTH = 320;
const CHART_HEIGHT = 120;
const BAR_MAX = 108;
const BAR_BASE = 112;

/**
 * What the block looks like from above: how far through it is, what is next,
 * and what has been logged.
 *
 * Every number here comes off session summaries, which is what makes this view
 * one call rather than one per session. Nothing on this screen needs to know
 * which exercise a kilo came from — that question is Analytics, and it costs
 * what it costs precisely because this one does not.
 */
export function DashboardScreen({
    block,
    sessions,
    loading,
    week,
    onWeek,
    onEditPlan,
}: DashboardScreenProps) {
    const submitted = sessions.filter((session) => session.status === 'submitted');
    const progress = progressOf(block, sessions);
    const rest = isRestWeek(week, block.weeks);

    // A day is "done" for the map when something was submitted against it; a
    // draft is its own state, because an open session is neither nothing nor a
    // week's work finished.
    function cellFor(w: number, dayIndex: number) {
        const cell = sessions.filter(
            (session) => session.week === w && session.dayIndex === dayIndex,
        );

        return {
            done: cell.some((session) => session.status === 'submitted'),
            draft: cell.some((session) => session.status === 'draft'),
        };
    }

    // Up next: the first day of the viewed week with nothing submitted against
    // it. A week that is fully logged falls back to its first day, which is
    // what the panel should show once there is nothing left to do in it.
    const pending = block.days.findIndex(
        (_, dayIndex) => !submitted.some(
            (session) => session.week === week && session.dayIndex === dayIndex,
        ),
    );
    const nextIndex = pending === -1 ? 0 : pending;
    const nextDay = block.days[nextIndex];

    const weekVolumes = Array.from({ length: block.weeks }, (_, index) => submitted
        .filter((session) => session.week === index + 1)
        .reduce((total, session) => total + session.volumeKg, 0));
    const volumeMax = Math.max(1, ...weekVolumes);
    const step = CHART_WIDTH / block.weeks;

    const plannedSetsPerWeek = block.days.reduce(
        (total, day) => total + day.plan.reduce((sum, planned) => sum + planned.sets, 0),
        0,
    );

    // Newest first. Ids are `session_YYYY-MM-DD[_n]`, so they sort as dates do.
    const recent = [...sessions].sort((a, b) => b.id.localeCompare(a.id)).slice(0, 5);

    return (
        <div className="view dash">
            <section className="panel">
                <div className="panel__head">
                    <div className="dash__name">{block.name}</div>
                    <div className="dash__week">{`W${week}/${block.weeks}`}</div>
                </div>

                <div className="meter">
                    <div className="meter__fill" style={{ width: `${progress.percent}%` }} />
                </div>
                <div className="meter__legend">
                    <span>{`${progress.doneCount} of ${progress.totalCount} workouts logged`}</span>
                    <span>{`${block.days.length}×/week`}</span>
                </div>

                <div className="tiles">
                    <div className="tile">
                        <div className="tile__key">LOGGED</div>
                        <div className="tile__value">{submitted.length}</div>
                    </div>
                    <div className="tile">
                        <div className="tile__key">VOLUME</div>
                        <div className="tile__value">
                            {kg(submitted.reduce((total, one) => total + one.volumeKg, 0))}
                        </div>
                    </div>
                    <div className="tile">
                        <div className="tile__key">SETS/WK</div>
                        <div className="tile__value">{plannedSetsPerWeek}</div>
                    </div>
                    <div className="tile">
                        <div className="tile__key">IN TANK</div>
                        <div className="tile__value">
                            {rest ? 'REST' : repsInTank(week, block.weeks)}
                        </div>
                    </div>
                </div>

                <div className="panel__head" style={{ marginTop: 22 }}>
                    <span className="panel__label">BLOCK MAP</span>
                    <span className="map__key">■ logged &nbsp;▨ in progress &nbsp;□ planned</span>
                </div>

                <div className="map">
                    <div className="map__head">
                        <span className="map__spacer" />
                        <span className="map__cells">
                            {block.days.map((day, index) => (
                                <span key={`${day.label}:${index}`} className="map__day">
                                    {day.label}
                                </span>
                            ))}
                        </span>
                        <span className="map__tank" />
                    </div>

                    {Array.from({ length: block.weeks }, (_, index) => {
                        const w = index + 1;
                        const weekRest = isRestWeek(w, block.weeks);
                        const tank = repsInTank(w, block.weeks);

                        return (
                            <div key={w} className="map__row">
                                <button
                                    type="button"
                                    className={w === week ? 'map__week map__week--on' : 'map__week'}
                                    aria-pressed={w === week}
                                    onClick={() => onWeek(w)}
                                >
                                    {`W${w}`}
                                </button>
                                <span className="map__cells">
                                    {block.days.map((day, dayIndex) => {
                                        const state = cellFor(w, dayIndex);
                                        const className = state.done
                                            ? 'map__cell map__cell--done'
                                            : state.draft
                                                ? 'map__cell map__cell--draft'
                                                : 'map__cell';

                                        return (
                                            <span
                                                key={dayIndex}
                                                className={className}
                                                title={`W${w} · ${day.label}`}
                                            />
                                        );
                                    })}
                                </span>
                                <span
                                    className={
                                        weekRest ? 'map__tank map__tank--rest' : 'map__tank'
                                    }
                                >
                                    {weekRest ? 'REST · 8' : `${tank} LEFT`}
                                </span>
                            </div>
                        );
                    })}
                </div>

                <p className="panel__note panel__note--wide">
                    The number is reps left in the tank: how much to have in reserve when a set
                    ends. It tightens as the block goes on and reaches nothing left in the last
                    training week. The final week runs the same exercises at half the sets.
                </p>
            </section>

            <div className="dash__aside">
                <section className="panel panel--accent">
                    <div className="panel__label panel__label--accent">UP NEXT</div>
                    <div className="next__label">{nextDay ? nextDay.label : '—'}</div>
                    <div className="next__sub">
                        {rest
                            ? `Week ${week} · rest week — half the sets, nowhere near failure`
                            : `Week ${week} · target ${repsInTank(week, block.weeks)} reps in the tank`}
                    </div>

                    {nextDay && nextDay.plan.length > 0 ? (
                        <div className="rows" style={{ marginTop: 16 }}>
                            {nextDay.plan.map((planned, index) => (
                                <div key={`${planned.exerciseName}:${index}`} className="row">
                                    <span className="row__title">{planned.exerciseName}</span>
                                    <span className="row__meta">
                                        {`${setsForWeek(planned.sets, week, block.weeks)} × `}
                                        {groupOf(planned.exerciseName)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="empty" style={{ paddingLeft: 0 }}>
                            Nothing planned for this day yet. The first session submitted against
                            an empty day fills it in from what was lifted.
                        </p>
                    )}

                    <button type="button" className="next__button" onClick={onEditPlan}>
                        Edit this day&rsquo;s plan
                    </button>
                </section>

                <section className="panel">
                    <div className="panel__head">
                        <span className="panel__label">WEEKLY VOLUME</span>
                        <span className="row__strong">
                            {kg(weekVolumes.reduce((total, value) => total + value, 0))}
                        </span>
                    </div>

                    <svg
                        className="bars"
                        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
                        preserveAspectRatio="none"
                        role="img"
                        aria-label="Volume logged per week"
                    >
                        {weekVolumes.map((volume, index) => {
                            const height = Math.max(2, Math.round((volume / volumeMax) * BAR_MAX));

                            return (
                                <rect
                                    key={index}
                                    x={Math.round(index * step + step * 0.18)}
                                    y={BAR_BASE - height}
                                    width={Math.round(step * 0.64)}
                                    height={height}
                                    rx={3}
                                    fill={
                                        index + 1 === week ? '#d6ff3f' : 'rgba(214, 255, 63, 0.22)'
                                    }
                                />
                            );
                        })}
                    </svg>

                    <div
                        className="bars__labels"
                        style={{ gridTemplateColumns: `repeat(${block.weeks}, 1fr)` }}
                    >
                        {weekVolumes.map((_, index) => (
                            <span
                                key={index}
                                className={
                                    index + 1 === week
                                        ? 'bars__label bars__label--on'
                                        : 'bars__label'
                                }
                            >
                                {`W${index + 1}`}
                            </span>
                        ))}
                    </div>
                </section>

                <section className="panel">
                    <span className="panel__label">RECENT SESSIONS</span>

                    {recent.length > 0 ? (
                        <div className="rows" style={{ marginTop: 12 }}>
                            {recent.map((session) => (
                                <div key={session.id} className="row">
                                    <span style={{ minWidth: 0 }}>
                                        <span className="row__title">
                                            {block.days[session.dayIndex]?.label
                                                ?? `Day ${session.dayIndex + 1}`}
                                        </span>
                                        <span className="row__sub">
                                            {`W${session.week} · ${sessionDateLabel(session.id)}`}
                                            {` · ${session.setCount} sets`}
                                            {session.status === 'draft' ? ' · in progress' : ''}
                                        </span>
                                    </span>
                                    <span className="row__right">
                                        <span className="row__strong">{kg(session.volumeKg)}</span>
                                        <span className="row__sub">
                                            {`RPE ${rpeLabel(session.avgRpe)}`}
                                        </span>
                                    </span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="empty" style={{ paddingLeft: 0 }}>
                            {loading
                                ? 'Reading this block’s sessions…'
                                : 'Nothing logged in this block yet.'}
                        </p>
                    )}
                </section>
            </div>
        </div>
    );
}
