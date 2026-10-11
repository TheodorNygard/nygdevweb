import { calendarWeeks, freeTitle, mondayOf } from '../lib/freestanding';
import { GROUPS, NO_GROUP } from '../lib/groups';
import {
    kg,
    localDate,
    rpeLabel,
    sessionDate,
    sessionDateLabel,
    type DatedSession,
    type ExerciseLibrary,
} from '../lib/gym';
import { GROUP_FULL_SCALE, GROUP_HIGH, GROUP_LOW } from '../lib/limits';

interface FreeDashboardScreenProps {
    /** Freestanding workouts over the range, sets and all, newest first. */
    sessions: DatedSession[];

    /** Where an exercise's muscle group is read from — see `groupOf`. */
    library: ExerciseLibrary | null;
    loading: boolean;
}

/** The volume chart's viewBox, and the tallest a bar is allowed to draw in it. */
const CHART_WIDTH = 320;
const CHART_HEIGHT = 120;
const BAR_MAX = 108;
const BAR_BASE = 112;

/** How many calendar weeks the volume chart draws, this one included. */
const CHART_WEEKS = 12;

/** How many weeks the group tally averages over, this one included. */
const TALLY_WEEKS = 4;

/** How many workouts the recent list shows. */
const RECENT = 12;

/** The Monday `weeks` weeks before the Monday of `date`, as `YYYY-MM-DD`. */
function mondayBefore(date: string, weeks: number): string {
    const day = new Date(`${mondayOf(date)}T00:00:00`);

    day.setDate(day.getDate() - weeks * 7);

    return localDate(day);
}

/** `8 Sep` for a week's Monday. */
function weekLabel(monday: string): string {
    return new Date(`${monday}T00:00:00`).toLocaleDateString([], { day: 'numeric', month: 'short' });
}

/**
 * Freestanding training from above: how often, how much, and on what.
 *
 * The block dashboard is built around the plan — a map of the cells it asks
 * for, what is up next, the week's reps-in-tank target. None of that exists
 * here, so none of it is drawn. What is left is what a lifter without a plan
 * actually steers by: how many times a week, how much volume, and whether each
 * muscle group is getting enough work — the last against the same ten-to-twenty
 * range the builder plans toward, because it is the only yardstick there is
 * when nothing prescribes the sets.
 *
 * Weeks are calendar weeks, Monday first. Everything is read off the one
 * date-range call `useFreestanding` makes, sets included, so the tally costs
 * nothing extra.
 */
export function FreeDashboardScreen({ sessions, library, loading }: FreeDashboardScreenProps) {
    const today = localDate();
    const submitted = sessions.filter((session) => session.status === 'submitted');
    const weeks = calendarWeeks(submitted, library);
    const byStart = new Map(weeks.map((week) => [week.start, week]));

    // Oldest first, zero-filled: a week off is part of the picture here, unlike
    // in the export's table, where it would only be an empty row.
    const chartWeeks = Array.from({ length: CHART_WEEKS }, (_, index) => {
        const start = mondayBefore(today, CHART_WEEKS - 1 - index);

        return { start, volumeKg: byStart.get(start)?.volumeKg ?? 0 };
    });
    const volumeMax = Math.max(1, ...chartWeeks.map((week) => week.volumeKg));
    const step = CHART_WIDTH / CHART_WEEKS;
    const thisMonday = mondayOf(today);
    const labelEvery = 3;

    const tallyFrom = mondayBefore(today, TALLY_WEEKS - 1);
    const tallied = weeks.filter((week) => week.start >= tallyFrom);
    const tally = new Map<string, number>();

    for (const week of tallied) {
        for (const [group, sets] of week.workingByGroup) {
            tally.set(group, (tally.get(group) ?? 0) + sets);
        }
    }

    const perWeek = (group: string) => Math.round((tally.get(group) ?? 0) / TALLY_WEEKS);
    const ungrouped = perWeek(NO_GROUP);

    const thisWeek = byStart.get(thisMonday)?.sessions.length ?? 0;
    const recentWeeks = tallied.reduce((total, week) => total + week.sessions.length, 0);
    const draft = sessions.find((session) => session.status === 'draft');
    const recent = sessions.slice(0, RECENT);
    const firstDate = submitted.length > 0
        ? sessionDate(submitted[submitted.length - 1]?.id ?? '')
        : null;

    return (
        <div className="view dash">
            <section className="panel">
                <div className="panel__head">
                    <div className="dash__name">Outside a block</div>
                    <div className="dash__week">LAST 12 MONTHS</div>
                </div>
                <p className="panel__note panel__note--wide" style={{ marginTop: 0 }}>
                    Workouts logged on the phone with no block behind them: no plan, no weekly
                    target, no deload. Weeks here are calendar weeks, Monday first.
                    {firstDate ? ` The earliest in range is ${sessionDateLabel(`session_${firstDate}`)}.` : ''}
                </p>

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
                        <div className="tile__key">THIS WEEK</div>
                        <div className="tile__value">{thisWeek}</div>
                    </div>
                    <div className="tile">
                        <div className="tile__key">PER WEEK · 4 WK</div>
                        <div className="tile__value">{(recentWeeks / TALLY_WEEKS).toFixed(1)}</div>
                    </div>
                </div>

                <div className="panel__head" style={{ marginTop: 22 }}>
                    <span className="panel__label">WEEKLY VOLUME · LAST 12 WEEKS</span>
                    <span className="row__strong">
                        {kg(chartWeeks.reduce((total, week) => total + week.volumeKg, 0))}
                    </span>
                </div>

                <svg
                    className="bars"
                    viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
                    preserveAspectRatio="none"
                    role="img"
                    aria-label="Volume logged per calendar week, oldest first"
                >
                    {chartWeeks.map((week, index) => {
                        const height = Math.max(2, Math.round((week.volumeKg / volumeMax) * BAR_MAX));

                        return (
                            <rect
                                key={week.start}
                                x={Math.round(index * step + step * 0.18)}
                                y={BAR_BASE - height}
                                width={Math.round(step * 0.64)}
                                height={height}
                                rx={3}
                                fill={
                                    week.start === thisMonday
                                        ? 'var(--accent)'
                                        : 'rgba(var(--accent-rgb), 0.22)'
                                }
                            >
                                <title>{`Week of ${weekLabel(week.start)} · ${kg(week.volumeKg)}`}</title>
                            </rect>
                        );
                    })}
                </svg>

                <div
                    className="bars__labels"
                    style={{ gridTemplateColumns: `repeat(${CHART_WEEKS}, 1fr)` }}
                >
                    {chartWeeks.map((week, index) => (
                        <span
                            key={week.start}
                            className={
                                week.start === thisMonday ? 'bars__label bars__label--on' : 'bars__label'
                            }
                        >
                            {(CHART_WEEKS - 1 - index) % labelEvery === 0 ? weekLabel(week.start) : ''}
                        </span>
                    ))}
                </div>
            </section>

            <div className="dash__aside">
                <section className="panel panel--tight">
                    <div className="panel__head">
                        <span className="panel__label">WORKING SETS PER GROUP</span>
                        <span className="row__strong" style={{ fontSize: 10 }}>AVG/WK · LAST 4 WK</span>
                    </div>

                    <div className="groups">
                        {GROUPS.map((group) => {
                            const sets = perWeek(group);
                            const low = sets > 0 && sets < GROUP_LOW;
                            const high = sets > GROUP_HIGH;
                            const tone = high ? '--high' : low ? '--low' : '';

                            return (
                                <div key={group}>
                                    <div className="group__head">
                                        <span className="group__name">{group}</span>
                                        <span className={tone ? `group__count group__count${tone}` : 'group__count'}>
                                            {sets}
                                        </span>
                                    </div>
                                    <div className="group__track">
                                        <div
                                            className={tone ? `group__bar group__bar${tone}` : 'group__bar'}
                                            style={{
                                                width: `${Math.min(100, Math.round((sets / GROUP_FULL_SCALE) * 100))}%`,
                                            }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <p className="panel__note">
                        Warm-ups excluded. {GROUP_LOW}–{GROUP_HIGH} a week is the range worth aiming at.
                        {ungrouped > 0
                            ? ` About ${ungrouped} a week went to exercises with no group — describe them in Library to count them.`
                            : ''}
                    </p>
                </section>

                <section className="panel">
                    <div className="panel__head">
                        <span className="panel__label">RECENT WORKOUTS</span>
                        {draft ? <span className="row__strong">ONE OPEN</span> : null}
                    </div>

                    {recent.length > 0 ? (
                        <div className="rows" style={{ marginTop: 12 }}>
                            {recent.map((session) => (
                                <div key={session.id} className="row">
                                    <span style={{ minWidth: 0 }}>
                                        <span className="row__title">{freeTitle(session)}</span>
                                        <span className="row__sub">
                                            {sessionDateLabel(session.id)}
                                            {` · ${session.setCount} sets`}
                                            {session.status === 'draft' ? ' · in progress' : ''}
                                        </span>
                                    </span>
                                    <span className="row__right">
                                        <span className="row__strong">{kg(session.volumeKg)}</span>
                                        <span className="row__sub">{`RPE ${rpeLabel(session.avgRpe)}`}</span>
                                    </span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="empty" style={{ paddingLeft: 0 }}>
                            {loading
                                ? 'Reading your workouts…'
                                : 'Nothing logged outside a block in the last year. Start a workout '
                                    + 'on the phone and it lands here.'}
                        </p>
                    )}
                </section>
            </div>
        </div>
    );
}
