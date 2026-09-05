import { useCallback, useEffect, useMemo, useState } from 'react';

import { Banner } from './components/Banner';
import { Rail, type View } from './components/Rail';
import { SignInGate } from './components/SignInGate';
import { useBlocks } from './hooks/useBlocks';
import { useSessions } from './hooks/useSessions';
import { useWorkouts } from './hooks/useWorkouts';
import { seriesOf } from './lib/analytics';
import {
    currentWeek,
    GymApi,
    sessionDateLabel,
    useAuth,
    useLibrary,
    type SessionSummary,
} from './lib/gym';
import { DEFAULT_DAY_LABELS, MIN_DAYS } from './lib/limits';
import { AnalyticsScreen } from './screens/AnalyticsScreen';
import { BlockScreen, draftOf, isDirty, isSaveable, type Draft } from './screens/BlockScreen';
import { DashboardScreen } from './screens/DashboardScreen';
import { LibraryScreen } from './screens/LibraryScreen';

/** Stable empties, so a lookup that misses does not churn its consumers. */
const NO_SESSIONS: SessionSummary[] = [];
const NO_IDS: string[] = [];

/** What a block starts as: five weeks of four unnamed days. */
const NEW_BLOCK_WEEKS = 5;
const NEW_BLOCK_DAYS = 4;

export function App() {
    const auth = useAuth();

    // One client for the life of the sign-in. `getToken` is stable, so this
    // does not churn — and it must not, because every hook below reloads when
    // the client identity changes.
    const api = useMemo(
        () => (auth.account ? new GymApi(auth.getToken) : null),
        [auth.account, auth.getToken],
    );

    const blocks = useBlocks(api);
    const sessions = useSessions(api);
    const library = useLibrary();

    const [view, setView] = useState<View>('dashboard');
    const [selectedId, setSelectedId] = useState<string | null>(null);

    // Edits in flight, by block id. Keyed rather than single so that clicking
    // another block in the sidebar — the ordinary thing to do here — cannot
    // silently throw away a plan somebody was half way through writing.
    const [drafts, setDrafts] = useState<Record<string, Draft>>({});

    // Which week each block is being read at. Derived from its sessions the
    // first time they land, then whatever the block map was last clicked on.
    const [weeks, setWeeks] = useState<Record<string, number>>({});

    const [lift, setLift] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);

    // Open on the block the phone is training, and fall back to the newest —
    // `GET /gym/mesocycles` answers newest first.
    useEffect(() => {
        if (selectedId !== null || blocks.blocks.length === 0) return;

        const current = blocks.blocks.find((block) => block.isCurrent) ?? blocks.blocks[0];

        if (current) setSelectedId(current.id);
    }, [blocks.blocks, selectedId]);

    // A block that is gone — deleted from the phone between reads — should not
    // leave every view rendering nothing.
    useEffect(() => {
        if (selectedId === null || blocks.blocks.length === 0) return;
        if (blocks.blocks.some((block) => block.id === selectedId)) return;

        setSelectedId(blocks.blocks[0]?.id ?? null);
    }, [blocks.blocks, selectedId]);

    // `load` is stable across renders; the state object around it is not, so
    // the dependency has to be the function rather than the hook's return.
    const { load: loadSessions } = sessions;

    useEffect(() => {
        if (selectedId) loadSessions(selectedId);
    }, [selectedId, loadSessions]);

    const selected = blocks.blocks.find((block) => block.id === selectedId) ?? null;
    const blockSessions = selectedId ? sessions.byBlock[selectedId] ?? NO_SESSIONS : NO_SESSIONS;
    const sessionsRead = selectedId !== null && sessions.byBlock[selectedId] !== undefined;

    // The week to read the block at. Not calendar-derived — days are labelled
    // rather than scheduled — so it is the latest week anything was logged in.
    useEffect(() => {
        if (!selected || !sessionsRead) return;

        setWeeks((held) => (
            held[selected.id] === undefined
                ? {
                    ...held,
                    [selected.id]: currentWeek({ mesocycle: selected, sessions: blockSessions }),
                }
                : held
        ));
    }, [selected, sessionsRead, blockSessions]);

    const draft = selected ? drafts[selected.id] ?? draftOf(selected) : null;
    const dirty = selected !== null && draft !== null && isDirty(draft, selected);

    // Clamped: shortening a block can leave the map pointing past its own end.
    const week = selected
        ? Math.min(weeks[selected.id] ?? 1, draft?.weeks ?? selected.weeks)
        : 1;

    // Only Analytics pays for the sessions themselves, and only while it is
    // open. Submitted ones alone: a draft is a workout in progress, and a lift
    // chart that dipped three sets into every session would report the clock.
    const analyticsIds = view === 'stats'
        ? blockSessions
            .filter((session) => session.status === 'submitted')
            .map((session) => session.id)
        : NO_IDS;

    const workouts = useWorkouts(api, analyticsIds);

    const series = useMemo(
        () => seriesOf(workouts.workouts, blockSessions, sessionDateLabel),
        [workouts.workouts, blockSessions],
    );

    const describe = useCallback(
        (cause: unknown) => setActionError(cause instanceof Error ? cause.message : String(cause)),
        [],
    );

    function setDraft(next: Draft) {
        if (!selected) return;

        setSaved(false);
        setDrafts((held) => ({ ...held, [selected.id]: next }));
    }

    async function save() {
        if (!api || !selected || !draft) return;

        setBusy(true);

        try {
            await api.updateMesocycle(selected.id, {
                name: draft.name.trim(),
                weeks: draft.weeks,
                days: draft.days.map((day) => ({ label: day.label.trim(), plan: day.plan })),
            });

            // Dropped rather than replaced: the block list is about to be read
            // again, and what it answers with is the authority on what was
            // saved. A draft left behind would be a second copy racing it.
            setDrafts((held) => {
                const { [selected.id]: _dropped, ...rest } = held;

                return rest;
            });

            setSaved(true);
            blocks.reload();
        } catch (cause) {
            describe(cause);
        } finally {
            setBusy(false);
        }
    }

    async function createBlock() {
        if (!api) return;

        setBusy(true);

        try {
            const created = await api.createMesocycle(
                `Block ${blocks.blocks.length + 1}`,
                NEW_BLOCK_WEEKS,
                DEFAULT_DAY_LABELS.slice(0, Math.max(MIN_DAYS, NEW_BLOCK_DAYS))
                    .map((label) => ({ label, plan: [] })),
            );

            setSelectedId(created.id);
            setView('block');
            blocks.reload();

            // Worth saying out loud: create is also switch on this API, so a
            // block started at the desk is the one the phone opens on from
            // now — which is not what "new" implies on its own.
            setNotice(
                'Block created, and the phone now opens on it. Name it and plan the days here; '
                + 'the block you were training is still in the list.',
            );
        } catch (cause) {
            describe(cause);
        } finally {
            setBusy(false);
        }
    }

    async function makeCurrent() {
        if (!api || !selected) return;

        setBusy(true);

        try {
            await api.switchMesocycle(selected.id);
            blocks.reload();
            setNotice(`The phone now opens on ${selected.name}.`);
        } catch (cause) {
            describe(cause);
        } finally {
            setBusy(false);
        }
    }

    if (!auth.ready) {
        return <div className="spinner">GYMBRO</div>;
    }

    if (!auth.account) {
        return (
            <SignInGate signingIn={auth.signingIn} error={auth.error} onSignIn={auth.signIn} />
        );
    }

    // A token failure while already signed in is a setup problem, not a
    // sign-out — the scope does not exist, consent was revoked, or this origin
    // is not on the registration — and its AADSTS fix is the useful half.
    const authFailure = auth.error
        ? `${auth.error.code} — ${auth.error.message}${auth.error.fix ? ` ${auth.error.fix}` : ''}`
        : null;

    const failure = actionError
        ?? blocks.error
        ?? sessions.error
        ?? (view === 'stats' ? workouts.error : null)
        ?? authFailure;

    const exerciseCount = library?.exercises.length ?? 0;

    const heading: Record<View, [string, string]> = {
        dashboard: [selected?.isCurrent ? 'CURRENT BLOCK' : 'SELECTED BLOCK', 'Overview'],
        block: ['MESOCYCLE', 'Block builder'],
        library: ['EXERCISE LIBRARY', exerciseCount === 0 ? 'Exercises' : `${exerciseCount} exercises`],
        stats: ['PROGRESSION', 'Analytics'],
    };

    const [eyebrow, title] = heading[view];

    const syncLine = dirty
        ? 'unsaved draft'
        : busy
            ? 'saving…'
            : saved
                ? 'saved'
                : blocks.loading
                    ? 'reading…'
                    : 'in sync';

    return (
        <div className="shell">
            <Rail
                view={view}
                onView={setView}
                blocks={blocks.blocks}
                blocksLoading={blocks.loading}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onCreate={() => { void createBlock(); }}
                busy={busy}
                account={auth.account.username || auth.account.name || 'this account'}
                onSignOut={auth.signOut}
            />

            <main className="main">
                {failure ? (
                    <Banner
                        kind="error"
                        label="Something went wrong"
                        message={failure}
                        onDismiss={() => {
                            setActionError(null);
                            auth.dismissError();
                        }}
                    />
                ) : notice ? (
                    <Banner
                        kind="notice"
                        label="Heads up"
                        message={notice}
                        onDismiss={() => setNotice(null)}
                    />
                ) : null}

                <header className="masthead">
                    <div style={{ minWidth: 0 }}>
                        <div className="masthead__eyebrow">{eyebrow}</div>
                        <h1 className="masthead__title">{title}</h1>
                    </div>
                    <div className="masthead__side">
                        <div className="sync">
                            <span className={dirty ? 'sync__dot sync__dot--idle' : 'sync__dot'} />
                            <span className="sync__text">{syncLine}</span>
                        </div>
                        {dirty && draft ? (
                            <button
                                type="button"
                                className="primary"
                                onClick={() => { void save(); }}
                                disabled={busy || !isSaveable(draft)}
                            >
                                {isSaveable(draft) ? 'Save changes' : 'Name every day'}
                            </button>
                        ) : null}
                    </div>
                </header>

                <div className="canvas">
                    {blocks.loading && blocks.blocks.length === 0 ? (
                        <p className="empty">Reading your blocks…</p>
                    ) : !selected || !draft ? (
                        <p className="empty" style={{ paddingLeft: 0 }}>
                            No blocks yet. Start one from the sidebar — five weeks of four days,
                            renamed and planned from there.
                        </p>
                    ) : view === 'dashboard' ? (
                        <DashboardScreen
                            block={selected}
                            sessions={blockSessions}
                            loading={sessions.loading === selected.id}
                            week={week}
                            onWeek={(next) => setWeeks((held) => ({ ...held, [selected.id]: next }))}
                            onEditPlan={() => setView('block')}
                        />
                    ) : view === 'block' ? (
                        <BlockScreen
                            block={selected}
                            draft={draft}
                            onDraft={setDraft}
                            library={library}
                            week={week}
                            busy={busy}
                            onMakeCurrent={() => { void makeCurrent(); }}
                        />
                    ) : view === 'library' ? (
                        <LibraryScreen library={library} block={selected} />
                    ) : (
                        <AnalyticsScreen
                            series={series}
                            selected={lift}
                            onSelect={setLift}
                            done={workouts.done}
                            total={workouts.total}
                            loading={workouts.loading}
                        />
                    )}
                </div>
            </main>
        </div>
    );
}
