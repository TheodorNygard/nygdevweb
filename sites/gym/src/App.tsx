import { useCallback, useEffect, useMemo, useState } from 'react';

import { Banner } from './components/Banner';
import { BlockSheet } from './components/BlockSheet';
import { DaySheet } from './components/DaySheet';
import { ExercisePicker } from './components/ExercisePicker';
import { FinishSheet } from './components/FinishSheet';
import { SignInGate } from './components/SignInGate';
import { TabBar, type Tab } from './components/TabBar';
import { useAuth } from './hooks/useAuth';
import { useBlock } from './hooks/useBlock';
import { useBlocks } from './hooks/useBlocks';
import { useHistory } from './hooks/useHistory';
import { useLastSets } from './hooks/useLastSets';
import { useLibrary } from './hooks/useLibrary';
import { useSession } from './hooks/useSession';
import { useTemplates } from './hooks/useTemplates';
import { GymApi } from './lib/api';
import { currentWeek, dayLabel, progressOf, sessionsFor } from './lib/block';
import { DoneScreen } from './screens/DoneScreen';
import { HistoryScreen } from './screens/HistoryScreen';
import { PlanScreen } from './screens/PlanScreen';
import { SessionScreen } from './screens/SessionScreen';
import { TodayScreen } from './screens/TodayScreen';
import type {
    DayInput,
    MesocycleSummary,
    SessionSummary,
    SessionTotals,
    Workout,
} from './lib/types';

/** Which of the three full-screen states is showing. Sheets layer over these. */
type Screen = 'tabs' | 'session' | 'done';

interface Completed {
    dayLabel: string;
    week: number;
    totals: SessionTotals;
}

/** A stable empty list, so the lookup below does not churn before the block lands. */
const NO_SESSIONS: SessionSummary[] = [];

/**
 * The cell whose day sheet is open.
 *
 * `block` is null for the block being trained, which is every cell reached from
 * Today, and is the block itself for one reached from History. It has to be
 * carried rather than derived: a session knows its week and its day index, and
 * those mean nothing without knowing which block's week 3 is meant.
 */
interface OpenDay {
    week: number;
    dayIndex: number;
    block: MesocycleSummary | null;
}

export function App() {
    const auth = useAuth();

    // One client for the life of the sign-in. `getToken` is stable, so this
    // does not churn — and it must not, because every hook below reloads when
    // the client identity changes.
    const api = useMemo(
        () => (auth.account ? new GymApi(auth.getToken) : null),
        [auth.account, auth.getToken],
    );

    const [screen, setScreen] = useState<Screen>('tabs');
    const [tab, setTab] = useState<Tab>('today');

    // Which tabs have been opened. Today is read on sign-in because the app
    // opens on it; the other two each cost a call of their own, and most
    // sign-ins are a workout logged and the tab closed again — so they are read
    // the first time they are actually looked at, and held from then on.
    //
    // A hook handed a null client does not read. That already meant "not signed
    // in"; this widens it by one case to "not wanted yet", which is the same
    // answer for the same reason.
    const [opened, setOpened] = useState<Record<Tab, boolean>>({
        today: true,
        plan: false,
        history: false,
    });

    const pickTab = useCallback((next: Tab) => {
        setTab(next);
        setOpened((seen) => (seen[next] ? seen : { ...seen, [next]: true }));
    }, []);

    const block = useBlock(api);
    const session = useSession(api);
    const library = useLibrary();

    // The block list, read by Plan and History alike — so either one opening is
    // what pays for it, and the second gets it for nothing.
    const blocks = useBlocks(opened.plan || opened.history ? api : null);

    // The saved and built-in day plans the Plan tab drops into a day. Its own
    // errors stay inside its sheet rather than joining the banner chain below:
    // nothing else in the app reads this, and a day can still be planned by
    // hand while it is failing.
    const templates = useTemplates(opened.plan ? api : null);

    // The sessions of blocks other than the one being trained — History's
    // second half. Read per block, when the block is opened, so this one needs
    // no gate of its own.
    const history = useHistory(api);

    // What the open session's exercises were last done with. Keyed off the
    // session rather than fetched by the screen, so it is in hand by the time
    // the first logger opens.
    const lastSets = useLastSets(api, block.block?.sessions ?? NO_SESSIONS, session.workout);

    // Null until the block arrives: the week being trained is derived from the
    // sessions in it, and guessing 1 first would flash the wrong week.
    const [week, setWeek] = useState<number | null>(null);

    const [openDay, setOpenDay] = useState<OpenDay | null>(null);
    const [daySessionId, setDaySessionId] = useState<string | null>(null);
    const [dayDetail, setDayDetail] = useState<Workout | null>(null);
    const [dayLoading, setDayLoading] = useState(false);

    // The block whose sheet is open, and the volume logged in it. The volume is
    // fetched rather than listed because it needs the sets, which
    // `GET /gym/mesocycles` deliberately does not carry.
    const [openBlock, setOpenBlock] = useState<MesocycleSummary | null>(null);
    const [blockVolume, setBlockVolume] = useState<number | null>(null);

    const [picking, setPicking] = useState(false);
    const [finishing, setFinishing] = useState(false);
    const [completed, setCompleted] = useState<Completed | null>(null);

    const [planBusy, setPlanBusy] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);

    useEffect(() => {
        if (block.block && week === null) setWeek(currentWeek(block.block));
    }, [block.block, week]);

    // The entries behind a session's totals. Fetched rather than held, because
    // `/mesocycles/current` sends summaries only — and it is one read for a
    // sheet that is opened deliberately.
    useEffect(() => {
        if (!api || !daySessionId) {
            setDayDetail(null);

            return;
        }

        let cancelled = false;

        setDayLoading(true);

        void api
            .workout(daySessionId)
            .then((workout) => { if (!cancelled) setDayDetail(workout); })
            .catch(() => { if (!cancelled) setDayDetail(null); })
            .finally(() => { if (!cancelled) setDayLoading(false); });

        return () => { cancelled = true; };
    }, [api, daySessionId]);

    // What a block delete would destroy, in kilos. Read when the sheet opens
    // rather than when the confirmation is armed: the delete button stays
    // disabled until this lands, so fetching it early is what keeps a
    // deliberate tap from waiting on a request it did not know it started.
    useEffect(() => {
        if (!api || !openBlock) {
            setBlockVolume(null);

            return;
        }

        let cancelled = false;

        void api
            .sessions(openBlock.id)
            .then((sessions) => {
                if (cancelled) return;

                setBlockVolume(sessions.reduce((total, one) => total + one.volumeKg, 0));
            })
            .catch(() => {
                // Leaving this null keeps the delete disabled, which is the
                // right failure: a cascade should not be confirmable against a
                // number nobody could read.
                if (!cancelled) setBlockVolume(null);
            });

        return () => { cancelled = true; };
    }, [api, openBlock]);

    const closeDay = useCallback(() => {
        setOpenDay(null);
        setDaySessionId(null);
        setDayDetail(null);
    }, []);

    const describe = useCallback(
        (cause: unknown) => setActionError(cause instanceof Error ? cause.message : String(cause)),
        [],
    );

    if (!auth.ready) {
        return <div className="app"><div className="spinner">GYMLOG</div></div>;
    }

    if (!auth.account) {
        return (
            <div className="app">
                <SignInGate signingIn={auth.signingIn} error={auth.error} onSignIn={auth.signIn} />
            </div>
        );
    }

    const meso = block.block?.mesocycle ?? null;
    const activeWeek = week ?? 1;

    async function startOn(dayIndex: number) {
        const started = await session.start(activeWeek, dayIndex);

        if (!started) return;

        closeDay();
        setScreen('session');
    }

    async function resume(sessionId: string) {
        const opened = await session.open(sessionId);

        if (!opened) return;

        closeDay();
        setScreen('session');
    }

    async function removeSession(sessionId: string) {
        if (!api) return;

        // Which list the row came out of, before closing the sheet takes it
        // with it. A session deleted out of a block being read in History is
        // gone from that block's list, not from the one Today is holding.
        const from = openDay?.block?.id ?? null;

        try {
            await api.deleteWorkout(sessionId);
            closeDay();

            if (from) {
                history.reload(from);
                blocks.reload();
            } else {
                block.reload();
            }
        } catch (cause) {
            describe(cause);
        }
    }

    async function submitWorkout() {
        const workout = session.workout;

        if (!workout) return;

        const done = await session.submit();

        if (!done) return;

        setCompleted({
            dayLabel: dayLabel(meso, workout.dayIndex),
            week: workout.week,
            totals: workout.totals,
        });
        setFinishing(false);
        setScreen('done');
        block.reload();
    }

    async function savePlan(patch: { name: string; weeks: number; days: DayInput[] }) {
        if (!api || !meso) return;

        setPlanBusy(true);

        try {
            await api.updateMesocycle(meso.id, patch);
            block.reload();
            blocks.reload();

            // A shortened block can leave Today on a week that no longer
            // exists, and the arrows would not let you back.
            setWeek((value) => Math.min(value ?? 1, patch.weeks));
        } catch (cause) {
            describe(cause);
        } finally {
            setPlanBusy(false);
        }
    }

    async function switchBlock(mesoId: string) {
        if (!api) return;

        setPlanBusy(true);

        try {
            await api.switchMesocycle(mesoId);
            setOpenBlock(null);
            block.reload();
            blocks.reload();

            // The week is derived from the sessions in the block, so it has to
            // be re-derived: week 4 of the block you just left is not week 4 of
            // this one.
            setWeek(null);
            pickTab('today');
        } catch (cause) {
            describe(cause);
        } finally {
            setPlanBusy(false);
        }
    }

    async function copyBlock(source: MesocycleSummary) {
        if (!api) return;

        setPlanBusy(true);

        try {
            // No copy route needed: create takes the same three fields the
            // source is made of, plans included, and creating is also
            // switching. The sessions stay where they were logged.
            await api.createMesocycle(
                `${source.name} (copy)`,
                source.weeks,
                source.days.map((day) => ({ label: day.label, plan: day.plan })),
            );

            setOpenBlock(null);
            block.reload();
            blocks.reload();
            setWeek(1);

            // Stays on Plan rather than jumping to Today: a copy is almost
            // always renamed straight afterwards, in the field at the top of
            // this screen.
        } catch (cause) {
            describe(cause);
        } finally {
            setPlanBusy(false);
        }
    }

    async function removeBlock(mesoId: string) {
        if (!api) return;

        setPlanBusy(true);

        try {
            await api.deleteMesocycle(mesoId);
            setOpenBlock(null);

            // Both lists, and the week with them: deleting the current block
            // repoints the pointer at whatever is newest, so what Today shows
            // is a different block than it was a moment ago.
            block.reload();
            blocks.reload();
            setWeek(null);
        } catch (cause) {
            describe(cause);
        } finally {
            setPlanBusy(false);
        }
    }

    async function createPlan(plan: { name: string; weeks: number; days: DayInput[] }) {
        if (!api) return;

        setPlanBusy(true);

        try {
            await api.createMesocycle(plan.name, plan.weeks, plan.days);
            block.reload();
            blocks.reload();
            setWeek(1);
            pickTab('today');
        } catch (cause) {
            describe(cause);
        } finally {
            setPlanBusy(false);
        }
    }

    // A token failure while already signed in is a setup problem, not a
    // sign-out — the scope does not exist, or consent was revoked — and its
    // AADSTS fix is the useful half, so it is carried into the banner rather
    // than left on a screen nobody reaches once signed in.
    const authFailure = auth.error
        ? `${auth.error.code} — ${auth.error.message}${auth.error.fix ? ` ${auth.error.fix}` : ''}`
        : null;

    const banner = actionError
        ?? session.error
        ?? block.error
        ?? blocks.error
        ?? history.error
        ?? authFailure;
    const bannerIsNotice = !banner && session.notice !== null;

    // The sessions behind the open cell, out of the block that cell belongs
    // to: what Today holds for the current block, what History read for any
    // other.
    const openBlockSessions = openDay === null
        ? NO_SESSIONS
        : openDay.block
            ? history.sessions[openDay.block.id] ?? NO_SESSIONS
            : block.block?.sessions ?? NO_SESSIONS;

    const cell = openDay === null
        ? []
        : sessionsFor(openBlockSessions, openDay.week, openDay.dayIndex);

    // Only the Done screen reads it, and it walks every session in the block.
    const progress = screen === 'done' && meso && block.block
        ? progressOf(meso, block.block.sessions)
        : null;

    return (
        <div className="app">
            {banner ? (
                <Banner
                    kind="error"
                    label="Something went wrong"
                    message={banner}
                    onDismiss={() => {
                        setActionError(null);
                        session.dismiss();
                        auth.dismissError();
                    }}
                />
            ) : null}

            {bannerIsNotice && session.notice ? (
                <Banner
                    kind="notice"
                    label="Heads up"
                    message={session.notice}
                    onDismiss={session.dismiss}
                />
            ) : null}

            {screen === 'tabs' ? (
                <>
                    {block.loading && !block.block ? (
                        <div className="spinner">LOADING</div>
                    ) : block.block ? (
                        <>
                            {tab === 'today' ? (
                                <TodayScreen
                                    block={block.block}
                                    week={activeWeek}
                                    onWeek={setWeek}
                                    onOpenDay={(dayIndex) => {
                                        const sessions = sessionsFor(
                                            block.block?.sessions ?? [],
                                            activeWeek,
                                            dayIndex,
                                        );

                                        setOpenDay({
                                            week: activeWeek,
                                            dayIndex,
                                            block: null,
                                        });
                                        setDaySessionId(sessions[0]?.id ?? null);
                                    }}
                                    onPlan={() => pickTab('plan')}
                                />
                            ) : null}

                            {tab === 'plan' ? (
                                <PlanScreen
                                    block={block.block}
                                    blocks={blocks.blocks}
                                    blocksLoading={blocks.loading}
                                    onOpenBlock={setOpenBlock}
                                    library={library}
                                    templates={templates}
                                    busy={planBusy}
                                    onSave={(patch) => { void savePlan(patch); }}
                                    onCreate={(plan) => { void createPlan(plan); }}
                                    onSignOut={auth.signOut}
                                    account={auth.account.username || auth.account.name || 'this account'}
                                />
                            ) : null}

                            {tab === 'history' ? (
                                <HistoryScreen
                                    block={block.block}
                                    blocks={blocks.blocks}
                                    blocksLoading={blocks.loading}
                                    sessions={history.sessions}
                                    loadingMesoId={history.loading}
                                    onLoadBlock={history.load}
                                    onOpen={(summary, mesocycle) => {
                                        const isCurrent = mesocycle.id === meso?.id;

                                        // Only a cell of the block being
                                        // trained moves Today's week with it —
                                        // week 4 of another block is not week 4
                                        // of this one.
                                        if (isCurrent) setWeek(summary.week);

                                        setOpenDay({
                                            week: summary.week,
                                            dayIndex: summary.dayIndex,
                                            block: isCurrent ? null : mesocycle,
                                        });
                                        setDaySessionId(summary.id);
                                    }}
                                />
                            ) : null}
                        </>
                    ) : (
                        <div className="screen">
                            <h1 className="title">Nothing loaded.</h1>
                            <p className="lede">
                                The block could not be read. The banner above says why.
                            </p>
                            <div className="stack-22">
                                <button type="button" className="primary" onClick={block.reload}>
                                    Try again
                                </button>
                            </div>
                        </div>
                    )}

                    <TabBar active={tab} onPick={pickTab} />
                </>
            ) : null}

            {screen === 'session' && session.workout ? (
                <SessionScreen
                    workout={session.workout}
                    label={`W${session.workout.week} · ${dayLabel(meso, session.workout.dayIndex)}`}
                    library={library}
                    plan={meso?.days[session.workout.dayIndex]?.plan ?? []}
                    weeks={meso?.weeks ?? session.workout.week}
                    lastSets={lastSets}
                    savedAt={session.savedAt}
                    onAddExercise={() => setPicking(true)}
                    onLogSet={(entryIndex, set) => { void session.logSet(entryIndex, set); }}
                    onRemoveSet={(entryIndex, setIndex) => {
                        void session.removeSet(entryIndex, setIndex);
                    }}
                    onRemoveEntry={(entryIndex) => { void session.removeEntry(entryIndex); }}
                    onReorderEntry={(from, to) => { void session.reorderEntry(from, to); }}
                    onFinish={() => setFinishing(true)}
                    onBack={() => {
                        session.close();
                        setScreen('tabs');
                        block.reload();
                    }}
                />
            ) : null}

            {screen === 'done' && completed && block.block ? (
                <DoneScreen
                    dayLabel={completed.dayLabel}
                    week={completed.week}
                    weeks={meso?.weeks ?? completed.week}
                    doneCount={progress?.doneCount ?? 0}
                    totalCount={progress?.totalCount ?? 0}
                    totals={completed.totals}
                    onHome={() => {
                        session.close();
                        setCompleted(null);
                        pickTab('today');
                        setScreen('tabs');
                    }}
                />
            ) : null}

            {openDay !== null && screen === 'tabs' ? (
                <DaySheet
                    week={openDay.week}
                    dayIndex={openDay.dayIndex}
                    label={dayLabel(openDay.block ?? meso, openDay.dayIndex)}
                    sessions={cell}
                    selectedId={daySessionId}
                    detail={dayDetail}
                    loading={dayLoading}
                    canLog={openDay.block === null}
                    busy={session.busy}
                    onSelect={setDaySessionId}
                    onStart={() => { void startOn(openDay.dayIndex); }}
                    onResume={(sessionId) => { void resume(sessionId); }}
                    onDelete={(sessionId) => { void removeSession(sessionId); }}
                    onClose={closeDay}
                />
            ) : null}

            {openBlock && screen === 'tabs' ? (
                <BlockSheet
                    block={openBlock}
                    volumeKg={blockVolume}
                    busy={planBusy}
                    onSwitch={(mesoId) => { void switchBlock(mesoId); }}
                    onCopy={(source) => { void copyBlock(source); }}
                    onDelete={(mesoId) => { void removeBlock(mesoId); }}
                    onClose={() => setOpenBlock(null)}
                />
            ) : null}

            {picking && screen === 'session' ? (
                <ExercisePicker
                    library={library}
                    busy={session.busy}
                    onPick={(name) => {
                        setPicking(false);
                        void session.addEntry(name);
                    }}
                    onClose={() => setPicking(false)}
                />
            ) : null}

            {finishing && session.workout ? (
                <FinishSheet
                    label={dayLabel(meso, session.workout.dayIndex)}
                    totals={session.workout.totals}
                    busy={session.busy}
                    onSubmit={() => { void submitWorkout(); }}
                    onClose={() => setFinishing(false)}
                />
            ) : null}
        </div>
    );
}
