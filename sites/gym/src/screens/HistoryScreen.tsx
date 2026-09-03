import { useState } from 'react';

import { dayLabel } from '../lib/block';
import { kg, rpeLabel, sessionDateLabel, sessionOrdinal } from '../lib/format';
import type { CurrentBlock, MesocycleSummary, SessionSummary } from '../lib/types';

interface HistoryScreenProps {
    /** The block being trained, with its sessions already in hand. */
    block: CurrentBlock;

    /** Every block this user has planned, newest first. */
    blocks: MesocycleSummary[];
    blocksLoading: boolean;

    /** The sessions of the blocks that have been opened, by mesocycle id. */
    sessions: Record<string, SessionSummary[]>;
    loadingMesoId: string | null;

    /** Asks for a block's sessions. Called when one is opened for the first time. */
    onLoadBlock: (mesoId: string) => void;

    onOpen: (session: SessionSummary, mesocycle: MesocycleSummary) => void;
}

/** The weeks of one block that hold a submitted session, latest week first. */
function weeksOf(mesocycle: MesocycleSummary, sessions: SessionSummary[]) {
    const submitted = sessions.filter((session) => session.status === 'submitted');
    const weeks: { week: number; rows: SessionSummary[] }[] = [];

    for (let week = mesocycle.weeks; week >= 1; week -= 1) {
        const rows = submitted.filter((session) => session.week === week);

        if (rows.length > 0) weeks.push({ week, rows });
    }

    return weeks;
}

function volumeOf(sessions: SessionSummary[]): number {
    return sessions.reduce((total, session) => (
        session.status === 'submitted' ? total + session.volumeKg : total
    ), 0);
}

/**
 * Every workout ever logged, newest block first — each block's sessions grouped
 * under their week with the week's volume beside it.
 *
 * Blocks rather than one flat list, and that is the whole shape of the screen:
 * a week number only means something inside the block it belongs to, and two
 * blocks' week 3s are not the same week of anything.
 *
 * The current block is open on arrival and read from what Today already holds.
 * Every other block is a call of its own — `GET /gym/workouts?mesoId=` — so it
 * is made when the block is opened rather than on the way in: a year of
 * training is a dozen blocks, and reading all of them to show a list of names
 * would be the whole log fetched to answer a question nobody asked.
 *
 * Rows show the date where the prototype showed a duration. The API stores no
 * timestamp finer than the day, and the date is what you want anyway when a
 * cell holds two sessions.
 */
export function HistoryScreen({
    block,
    blocks,
    blocksLoading,
    sessions,
    loadingMesoId,
    onLoadBlock,
    onOpen,
}: HistoryScreenProps) {
    const current = block.mesocycle;

    // The block being trained is open on arrival: it is the one History is
    // opened to look at, and its sessions are in hand already.
    const [open, setOpen] = useState<string[]>(current ? [current.id] : []);

    // `blocks` is its own request and lands after this one. Until it does, the
    // current block stands in for the list — History is useful immediately
    // rather than empty for a beat, and the rest appear underneath it.
    const listed: MesocycleSummary[] = blocks.length > 0
        ? blocks
        : current
            ? [{
                ...current,
                isCurrent: true,
                sessionCount: block.sessions.length,
                submittedCount: block.sessions.filter((one) => one.status === 'submitted').length,
            }]
            : [];

    function toggle(mesocycle: MesocycleSummary) {
        setOpen((held) => (
            held.includes(mesocycle.id)
                ? held.filter((id) => id !== mesocycle.id)
                : [...held, mesocycle.id]
        ));

        if (mesocycle.id !== current?.id) onLoadBlock(mesocycle.id);
    }

    if (listed.length === 0) {
        return (
            <div className="screen">
                <h1 className="title">History</h1>
                <p className="empty">
                    {blocksLoading
                        ? 'Reading your blocks…'
                        : 'Nothing logged yet. Plan a block, log a session from Today, and it '
                            + 'will land here under its week.'}
                </p>
            </div>
        );
    }

    return (
        <div className="screen">
            <h1 className="title">History</h1>

            <div className="hist">
                {listed.map((mesocycle) => {
                    const isCurrent = mesocycle.id === current?.id;
                    const isOpen = open.includes(mesocycle.id);

                    // Undefined is "not read yet", which is not the same as a
                    // block holding nothing: one says wait, the other says
                    // there is nothing to wait for.
                    const held = isCurrent ? block.sessions : sessions[mesocycle.id];
                    const weeks = held ? weeksOf(mesocycle, held) : null;

                    return (
                        <section className="hist__block" key={mesocycle.id}>
                            <div className="rows">
                                <button
                                    type="button"
                                    className="row"
                                    aria-expanded={isOpen}
                                    onClick={() => toggle(mesocycle)}
                                >
                                    <span>
                                        <span className="row__label">
                                            {mesocycle.name}
                                            {isCurrent ? (
                                                <span className="row__tag">CURRENT</span>
                                            ) : null}
                                        </span>
                                        <span className="row__sub">
                                            {mesocycle.weeks} weeks
                                            {' · '}
                                            {mesocycle.days.length} days
                                            {' · '}
                                            {mesocycle.submittedCount} logged
                                        </span>
                                    </span>
                                    <span className="row__right">
                                        <span className="row__value">
                                            {held ? kg(volumeOf(held)) : '—'}
                                        </span>
                                        <span className="row__unit">
                                            {isOpen ? 'HIDE' : 'SHOW'}
                                        </span>
                                    </span>
                                </button>
                            </div>

                            {isOpen && weeks === null ? (
                                <p className="hist__note">
                                    {loadingMesoId === mesocycle.id
                                        ? 'Reading this block…'
                                        : 'This block could not be read. The banner above says why.'}
                                </p>
                            ) : null}

                            {isOpen && weeks !== null && weeks.length === 0 ? (
                                <p className="hist__note">Nothing was submitted in this block.</p>
                            ) : null}

                            {isOpen && weeks !== null && weeks.length > 0 ? (
                                <div className="hist__weeks">
                                    {weeks.map((group) => {
                                        const volume = group.rows.reduce(
                                            (total, row) => total + row.volumeKg,
                                            0,
                                        );

                                        return (
                                            <section key={group.week}>
                                                <div className="hist__head">
                                                    <span className="eyebrow">
                                                        WEEK {group.week}
                                                    </span>
                                                    <span className="hist__total">
                                                        {kg(volume)}
                                                    </span>
                                                </div>
                                                <div className="rows">
                                                    {group.rows.map((session) => {
                                                        const ordinal = sessionOrdinal(session.id);

                                                        return (
                                                            <button
                                                                key={session.id}
                                                                type="button"
                                                                className="row"
                                                                onClick={() => onOpen(
                                                                    session,
                                                                    mesocycle,
                                                                )}
                                                            >
                                                                <span>
                                                                    <span className="row__label">
                                                                        {dayLabel(
                                                                            mesocycle,
                                                                            session.dayIndex,
                                                                        )}
                                                                    </span>
                                                                    <span className="row__sub">
                                                                        {sessionDateLabel(
                                                                            session.id,
                                                                        )}
                                                                        {' · '}
                                                                        D{session.dayIndex + 1}
                                                                        {' · RPE '}
                                                                        {rpeLabel(session.avgRpe)}
                                                                        {ordinal > 1
                                                                            ? ` · #${ordinal} that day`
                                                                            : ''}
                                                                    </span>
                                                                </span>
                                                                <span className="row__right">
                                                                    <span className="row__value">
                                                                        {kg(session.volumeKg)}
                                                                    </span>
                                                                    <span className="row__unit">
                                                                        {session.setCount} sets
                                                                    </span>
                                                                </span>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </section>
                                        );
                                    })}
                                </div>
                            ) : null}
                        </section>
                    );
                })}
            </div>
        </div>
    );
}
