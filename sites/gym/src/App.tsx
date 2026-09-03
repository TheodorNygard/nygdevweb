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
import { useElapsed } from './hooks/useElapsed';
import { useLibrary } from './hooks/useLibrary';
import { useSession } from './hooks/useSession';
import { GymApi } from './lib/api';
import { currentWeek, dayLabel, progressOf, sessionsFor } from './lib/block';
import { DoneScreen } from './screens/DoneScreen';
import { HistoryScreen } from './screens/HistoryScreen';
import { PlanScreen } from './screens/PlanScreen';
import { SessionScreen } from './screens/SessionScreen';
import { TodayScreen } from './screens/TodayScreen';
import type { MesocycleSummary, SessionTotals, Workout } from './lib/types';

/** Which of the three full-screen states is showing. Sheets layer over these. */
type Screen = 'tabs' | 'session' | 'done';

interface Completed {
    dayLabel: string;
    week: number;
    elapsed: number;
    totals: SessionTotals;
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

    const block = useBlock(api);
    const blocks = useBlocks(api);
    const session = useSession(api);
    const library = useLibrary();

    const [screen, setScreen] = useState<Screen>('tabs');
    const [tab, setTab] = useState<Tab>('today');

    // Null until the block arrives: the week being trained is derived from the
    // sessions in it, and guessing 1 first would flash the wrong week.
    const [week, setWeek] = useState<number | null>(null);

    const [openDay, setOpenDay] = useState<number | null>(null);
    const [daySessionId, setDaySessionId] = useState<string | null>(null);
    const [dayDetail, setDayDetail] = useState<Workout | null>(null);
    const [dayLoading, setDayLoading] = useState(false);

    // The block whose sheet is open, and the volume logged in it. The volume
    // is fetched rather than listed because it needs the sets — see
    // `GET /gym/mesocycles`, which carries counts and deliberately not this.
    const [openBlock, setOpenBlock] = useState<MesocycleSummary | null>(null);
    const [blockVolume, setBlockVolume] = useState<number | null>(null);

    const [picking, setPicking] = useState(false);
    const [finishing, setFinishing] = useState(false);
    const [completed, setCompleted] = useState<Completed | null>(null);

    const [planBusy, setPlanBusy] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);

    // The stopwatch in the session header. Client-side: the API stores no
    // timestamp finer than the day, so there is nothing to count from but the
    // moment this screen opened.
    const [sessionStartedAt, setSessionStartedAt] = useState<number | null>(null);
    const elapsed = useElapsed(sessionStartedAt);

    useEffect(() => {
        if (block.block && week === null) setWeek(currentWeek(block.block));
    }, [block.block, week]);

    // The day sheet's detail: the entries behind a session's totals. Fetched
    // rather than held, because `/mesocycles/current` sends summaries only —
    // and it is one read for a sheet that is opened deliberately.
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
        setSessionStartedAt(Date.now());
        setScreen('session');
    }

    async function resume(sessionId: string) {
        const opened = await session.open(sessionId);

        if (!opened) return;

        closeDay();
        setSessionStartedAt(Date.now());
        setScreen('session');
    }

    async function removeSession(sessionId: string) {
        if (!api) return;

        try {
            await api.deleteWorkout(sessionId);
            closeDay();
            block.reload();
        } catch (cause) {
            describe(cause);
        }
    }

    async function addExercise(exerciseName: string) {
        setPicking(false);
        await session.addEntry(exerciseName);
    }

    async function submitWorkout() {
        const workout = session.workout;

        if (!workout) return;

        const done = await session.submit();

        if (!done) return;

        setCompleted({
            dayLabel: dayLabel(meso, workout.dayIndex),
            week: workout.week,
            elapsed,
            totals: workout.totals,
        });
        setFinishing(false);
        setSessionStartedAt(null);
        setScreen('done');
        block.reload();
    }

    async function savePlan(patch: { name: string; weeks: number; days: string[] }) {
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
            // be re-derived rather than carried across: week 4 of the block you
            // just left is not week 4 of this one.
            setWeek(null);
            setTab('today');
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
            // The API has no copy route and needs none: create takes the same
            // three fields the source is made of, and creating is also
            // switching. Nothing is copied out of the source but its shape —
            // the sessions stay where they were logged.
            await api.createMesocycle(
                `${source.name} (copy)`,
                source.weeks,
                source.days.map((day) => day.label),
            );

            setOpenBlock(null);
            block.reload();
            blocks.reload();
            setWeek(1);

            // Stays on Plan rather than jumping to Today: a copy is almost
            // always renamed straight afterwards, and the field to do it in is
            // at the top of this screen.
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

    async function createPlan(plan: { name: string; weeks: number; days: string[] }) {
        if (!api) return;

        setPlanBusy(true);

        try {
            await api.createMesocycle(plan.name, plan.weeks, plan.days);
            block.reload();
            blocks.reload();
            setWeek(1);
            setTab('today');
        } catch (cause) {
            describe(cause);
        } finally {
            setPlanBusy(false);
        }
    }

    // A token failure while already signed in is a setup problem, not a
    // sign-out — the scope does not exist, or consent was revoked — and its
    // AADSTS fix is the useful half of it, so it is carried into the banner
    // rather than left on a screen nobody reaches once signed in.
    const authFailure = auth.error
        ? `${auth.error.code} — ${auth.error.message}${auth.error.fix ? ` ${auth.error.fix}` : ''}`
        : null;

    const banner = actionError ?? session.error ?? block.error ?? blocks.error ?? authFailure;
    const bannerIsNotice = !banner && session.notice !== null;

    const cell = openDay !== null && block.block
        ? sessionsFor(block.block.sessions, activeWeek, openDay)
        : [];

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

                                        setOpenDay(dayIndex);
                                        setDaySessionId(sessions[0]?.id ?? null);
                                    }}
                                    onPlan={() => setTab('plan')}
                                />
                            ) : null}

                            {tab === 'plan' ? (
                                <PlanScreen
                                    block={block.block}
                                    blocks={blocks.blocks}
                                    blocksLoading={blocks.loading}
                                    onOpenBlock={setOpenBlock}
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
                                    onOpen={(summary) => {
                                        setWeek(summary.week);
                                        setOpenDay(summary.dayIndex);
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

                    <TabBar active={tab} onPick={setTab} />
                </>
            ) : null}

            {screen === 'session' && session.workout ? (
                <SessionScreen
                    workout={session.workout}
                    label={`W${session.workout.week} · ${dayLabel(meso, session.workout.dayIndex)}`}
                    library={library}
                    elapsed={elapsed}
                    savedAt={session.savedAt}
                    onAddExercise={() => setPicking(true)}
                    onLogSet={(entryIndex, set) => { void session.logSet(entryIndex, set); }}
                    onRemoveSet={(entryIndex, setIndex) => {
                        void session.removeSet(entryIndex, setIndex);
                    }}
                    onFinish={() => setFinishing(true)}
                    onBack={() => {
                        session.close();
                        setSessionStartedAt(null);
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
                    doneCount={meso ? progressOf(meso, block.block.sessions).doneCount : 0}
                    totalCount={meso ? progressOf(meso, block.block.sessions).totalCount : 0}
                    elapsed={completed.elapsed}
                    totals={completed.totals}
                    onHome={() => {
                        session.close();
                        setCompleted(null);
                        setTab('today');
                        setScreen('tabs');
                    }}
                />
            ) : null}

            {openDay !== null && screen === 'tabs' ? (
                <DaySheet
                    week={activeWeek}
                    dayIndex={openDay}
                    label={dayLabel(meso, openDay)}
                    sessions={cell}
                    selectedId={daySessionId}
                    detail={dayDetail}
                    loading={dayLoading}
                    busy={session.busy}
                    onSelect={setDaySessionId}
                    onStart={() => { void startOn(openDay); }}
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
                    onPick={(name) => { void addExercise(name); }}
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
