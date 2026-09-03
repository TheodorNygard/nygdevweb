import { dayLabel, draftIn, isRestWeek, progressOf, repsInTank, sessionsFor } from '../lib/block';
import { kg, rpeLabel, tankLabel, todayLabel } from '../lib/format';
import type { CurrentBlock } from '../lib/types';

interface TodayScreenProps {
    block: CurrentBlock;
    week: number;
    onWeek: (week: number) => void;
    onOpenDay: (dayIndex: number) => void;
    onPlan: () => void;
}

/**
 * Home is the current week of the block rather than a bare "start session"
 * button. Up next is the first day of the week with nothing submitted against
 * it, and it is the only row carrying an action — so the common case is one tap
 * from opening the app.
 */
export function TodayScreen({ block, week, onWeek, onOpenDay, onPlan }: TodayScreenProps) {
    const { mesocycle, sessions } = block;

    if (!mesocycle) {
        // A first run, not an error: the API answers `mesocycle: null` when
        // nobody has planned a block yet.
        return (
            <div className="screen">
                <div className="masthead">
                    <span className="eyebrow eyebrow--wide">{todayLabel()}</span>
                    <span className="masthead__mark">LOGBOOK</span>
                </div>
                <h1 className="title">No block yet.</h1>
                <p className="lede">
                    A mesocycle is 3–8 weeks of 2–6 workout days. Name one and give its days
                    labels, and this screen becomes the week you are training.
                </p>
                <div className="stack-22">
                    <button type="button" className="primary" onClick={onPlan}>
                        Plan a mesocycle
                    </button>
                </div>
            </div>
        );
    }

    const progress = progressOf(mesocycle, sessions);
    const days = mesocycle.days;

    const rows = days.map((day) => {
        const cell = sessionsFor(sessions, week, day.dayIndex);
        const submitted = cell.filter((session) => session.status === 'submitted');

        return {
            day,
            draft: draftIn(cell),
            latest: submitted[0],
            done: submitted.length > 0,
            extra: submitted.length - 1,
        };
    });

    // "Up next" is the first day of the week with nothing submitted. A day with
    // a draft open counts as next too: resuming it is the same tap.
    const nextIndex = rows.findIndex((row) => !row.done);
    const weekDone = nextIndex === -1;

    // Only the weeks the block has: past the last one are cells the API would
    // refuse a Start on.
    const canPrev = week > 1;
    const canNext = week < mesocycle.weeks;

    // What this week asks for. The last week of a block is its deload, so the
    // week bar says so rather than letting it look like another hard one.
    const rest = isRestWeek(week, mesocycle.weeks);
    const tank = repsInTank(week, mesocycle.weeks);

    return (
        <div className="screen">
            <div className="masthead">
                <span className="eyebrow eyebrow--wide">{todayLabel()}</span>
                <span className="masthead__mark">LOGBOOK</span>
            </div>

            <section className="block">
                <div className="block__head">
                    <div className="block__name">{mesocycle.name}</div>
                    <div className="block__week">W{week}/{mesocycle.weeks}</div>
                </div>
                <div className="block__bar">
                    <div className="block__fill" style={{ width: `${progress.percent}%` }} />
                </div>
                <div className="block__meta">
                    <span>{progress.doneCount} of {progress.totalCount} workouts logged</span>
                    <span>{days.length}×/week</span>
                </div>
            </section>

            <div className="weekbar">
                <span className="eyebrow">
                    WEEK {week}
                    {rest ? ' · REST' : ''}
                </span>
                <div className="weekbar__arrows">
                    <button
                        type="button"
                        className="arrow"
                        onClick={() => onWeek(week - 1)}
                        disabled={!canPrev}
                        aria-label="Previous week"
                    >
                        ‹
                    </button>
                    <button
                        type="button"
                        className="arrow"
                        onClick={() => onWeek(week + 1)}
                        disabled={!canNext}
                        aria-label="Next week"
                    >
                        ›
                    </button>
                </div>
            </div>

            <p className="weeknote">
                {rest
                    ? `Deload — target ${tankLabel(tank)}. Same days, much less bar.`
                    : `Target ${tankLabel(tank)} on every working set.`}
            </p>

            <div className="daylist">
                {rows.map((row, index) => {
                    const isNext = index === nextIndex;
                    const classes = ['day'];

                    if (row.done) classes.push('day--done');
                    if (isNext) classes.push('day--next');

                    const sub = row.draft
                        ? `in progress · ${row.draft.setCount} sets logged`
                        : row.latest
                            ? `${row.latest.setCount} sets · ${kg(row.latest.volumeKg)}`
                                + ` · RPE ${rpeLabel(row.latest.avgRpe)}`
                                + (row.extra > 0 ? ` · +${row.extra} more` : '')
                            : isNext
                                ? 'up next · nothing logged'
                                : 'planned';

                    const action = row.draft ? 'Resume' : row.done ? '✓' : isNext ? 'Start' : '';

                    return (
                        <button
                            key={row.day.dayIndex}
                            type="button"
                            className={classes.join(' ')}
                            onClick={() => onOpenDay(row.day.dayIndex)}
                        >
                            <span className="day__badge">D{row.day.dayIndex + 1}</span>
                            <span className="day__body">
                                <span className="day__label">
                                    {dayLabel(mesocycle, row.day.dayIndex)}
                                </span>
                                <span className="day__sub">{sub}</span>
                            </span>
                            <span className="day__action">{action}</span>
                        </button>
                    );
                })}
            </div>

            {weekDone && canNext ? (
                <button type="button" className="weekdone" onClick={() => onWeek(week + 1)}>
                    Week {week} complete → go to week {week + 1}
                </button>
            ) : null}

            {weekDone && !canNext ? (
                <button type="button" className="weekdone" onClick={onPlan}>
                    Block complete — {progress.doneCount} of {progress.totalCount} workouts. Plan
                    the next one.
                </button>
            ) : null}
        </div>
    );
}
