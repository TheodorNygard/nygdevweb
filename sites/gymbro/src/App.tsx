import { useEffect, useMemo, useState } from 'react';

import { Banner } from './components/Banner';
import { Rail, type View } from './components/Rail';
import { SignInGate } from './components/SignInGate';
import { useBlocks } from './hooks/useBlocks';
import { useWorkouts } from './hooks/useWorkouts';
import { seriesOf } from './lib/analytics';
import {
    currentWeek,
    GymApi,
    localDate,
    messageOf,
    sessionDateLabel,
    useAuth,
    useCustomExercises,
    useFavorites,
    useHistory,
    useLibrary,
    useTemplates,
    useTheme,
    withCustom,
    type MesocycleSummary,
    type SessionSummary,
} from './lib/gym';
import { DEFAULT_DAY_LABELS, MAX_NAME, MIN_DAYS } from './lib/limits';
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

/** What a copied block is called until it is renamed. */
const COPY_SUFFIX = ' (copy)';

/**
 * Putting the phone back where it was after a create, which on this API is
 * also a switch. `to` is the block that was being trained; `from` is the name
 * of the one just made, for the notice that follows.
 */
interface Undo {
    to: MesocycleSummary;
    from: string;
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

    const blocks = useBlocks(api);

    // The starred and recently used exercises ride along on the block list —
    // no call of their own. Recent is written by Submit on the phone, so it is
    // as fresh as the last time this list was read.
    const favorites = useFavorites(api, blocks.favorites, blocks.recent);
    const history = useHistory(api);
    // The user's own exercises, merged into the shipped library every view
    // reads — so the builder's tally, the picker and the Library table treat a
    // described exercise exactly like a shipped one. Read at sign-in rather
    // than when the Library view opens: the builder's groups panel needs them
    // too, and the dashboard opens on it.
    const customExercises = useCustomExercises(api);
    const shippedLibrary = useLibrary();

    const library = useMemo(
        () => withCustom(shippedLibrary, customExercises.exercises),
        [shippedLibrary, customExercises.exercises],
    );

    // Every exercise name any block plans. A name typed for last block is
    // offered in this block's picker rather than retyped — and misspelled,
    // which splits its history in two — and the Library view lists the ones
    // nothing describes yet, to describe.
    const knownNames = useMemo(
        () => [...new Set(blocks.blocks.flatMap((block) => (
            block.days.flatMap((day) => day.plan.map((planned) => planned.exerciseName))
        )))],
        [blocks.blocks],
    );

    const [view, setView] = useState<View>('dashboard');
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [theme, pickTheme] = useTheme();

    // Only read once the builder is first opened: templates are used by nothing
    // else here, and the built-in half is a CDN fetch a session that only reads
    // the dashboard would be paying for. Held from then on, the way the
    // logger's `opened` record holds its tabs: passing `api` only while the
    // builder was showing flipped it back to null on every other view, and the
    // hook re-read `GET /gym/templates` — a function invocation — on every
    // return. Its own writes keep the list current, and the list only changes
    // through them or the phone.
    const [builderOpened, setBuilderOpened] = useState(false);

    if (view === 'block' && !builderOpened) setBuilderOpened(true);

    const templates = useTemplates(builderOpened ? api : null);

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

    // The way back from the switch a create made, offered on the notice that
    // says so. Lives exactly as long as that notice: any other notice, or
    // dismissing it, takes it away.
    const [undo, setUndo] = useState<Undo | null>(null);
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

        // The block the phone opens on, if it is still there: deleting the one
        // being read is the ordinary way to land here, and the API repoints the
        // phone at the newest block left.
        const fallback = blocks.blocks.find((block) => block.isCurrent) ?? blocks.blocks[0];

        setSelectedId(fallback?.id ?? null);
    }, [blocks.blocks, selectedId]);

    // `load` is stable across renders; the state object around it is not, so
    // the dependency has to be the function rather than the hook's return.
    const { load: loadSessions } = history;

    useEffect(() => {
        if (selectedId) loadSessions(selectedId);
    }, [selectedId, loadSessions]);

    const selected = blocks.blocks.find((block) => block.id === selectedId) ?? null;
    const blockSessions = selectedId ? history.sessions[selectedId] ?? NO_SESSIONS : NO_SESSIONS;
    const sessionsRead = selectedId !== null && history.sessions[selectedId] !== undefined;

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

    // Any block's, not only the one on screen: the drafts are keyed so that
    // selecting another block keeps a half-written plan, and closing the tab
    // would throw away every one of them at once.
    const anyDirty = blocks.blocks.some((block) => {
        const held = drafts[block.id];

        return held !== undefined && isDirty(held, block);
    });

    // The browser's own "leave site?" while there is something to lose, and
    // only then — a prompt on every close teaches people to click through it.
    // Signing out navigates away too, and is covered by the same prompt.
    useEffect(() => {
        if (!anyDirty) return;

        function onBeforeUnload(event: BeforeUnloadEvent) {
            event.preventDefault();

            // What older Chromium and Safari still look for; the text is
            // ignored everywhere, so it is left empty.
            event.returnValue = '';
        }

        window.addEventListener('beforeunload', onBeforeUnload);

        return () => window.removeEventListener('beforeunload', onBeforeUnload);
    }, [anyDirty]);

    // What deleting the block would take with it, from its own sessions. Null
    // until they have been read, and the confirmation waits on it.
    const blockVolumeKg = sessionsRead
        ? blockSessions
            .filter((session) => session.status === 'submitted')
            .reduce((total, session) => total + session.volumeKg, 0)
        : null;

    // Clamped: shortening a block can leave the map pointing past its own end.
    const week = selected
        ? Math.min(weeks[selected.id] ?? 1, draft?.weeks ?? selected.weeks)
        : 1;

    // Only Analytics pays for the sessions themselves, and only while it is
    // open — one call for the whole block, rather than one per session. The ids
    // are passed so a session logged on the phone since is noticed; the read is
    // the block's, not theirs. Submitted ones alone: a draft is a workout in
    // progress, and a lift chart that dipped three sets into every session
    // would report the clock.
    const analyticsIds = view === 'stats'
        ? blockSessions
            .filter((session) => session.status === 'submitted')
            .map((session) => session.id)
        : NO_IDS;

    const workouts = useWorkouts(
        api,
        view === 'stats' ? selectedId : null,
        analyticsIds,
    );

    const series = useMemo(
        () => seriesOf(workouts.sessions, sessionDateLabel),
        [workouts.sessions],
    );

    // What Analytics' coaching export writes out: the block as saved — not a
    // draft in the builder, which nobody has trained — with every set it holds.
    // Null until those sets are in hand, which is what keeps the buttons off.
    const coaching = useMemo(
        () => (selected && !workouts.loading && workouts.sessions.length > 0
            ? {
                block: selected,
                sessions: workouts.sessions,
                library,
                custom: customExercises.exercises,
                exportedOn: localDate(),
            }
            : null),
        [selected, workouts.loading, workouts.sessions, library, customExercises.exercises],
    );

    function setDraft(next: Draft) {
        if (!selected) return;

        setSaved(false);
        setDrafts((held) => ({ ...held, [selected.id]: next }));
    }

    // Every write here is the same shape: one call under the busy flag, and a
    // failure in the banner. What differs is what the answer changes.
    async function write(action: (client: GymApi) => Promise<void>) {
        if (!api) return;

        setBusy(true);

        try {
            await action(api);
        } catch (cause) {
            setActionError(messageOf(cause));
        } finally {
            setBusy(false);
        }
    }

    function save() {
        if (!selected || !draft) return;

        void write(async (client) => {
            await client.updateMesocycle(selected.id, {
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
        });
    }

    /** A notice, and the undo that goes with it if there is one. Null clears both. */
    function announce(message: string | null, offer: Undo | null = null) {
        setNotice(message);
        setUndo(offer);
    }

    // The block the phone opens on before a create moves it. Null for the
    // very first block, which has nothing to go back to.
    function trainedNow(): MesocycleSummary | null {
        return blocks.blocks.find((block) => block.isCurrent) ?? null;
    }

    function undoSwitch(offer: Undo) {
        void write(async (client) => {
            await client.switchMesocycle(offer.to.id);
            blocks.reload();
            announce(
                `The phone opens on ${offer.to.name} again. ${offer.from} stays in the list, `
                + 'and Train this block moves the phone to it whenever you mean it to.',
            );
        });
    }

    function createBlock() {
        const previous = trainedNow();

        void write(async (client) => {
            const created = await client.createMesocycle(
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
            announce(
                'Block created, and the phone now opens on it. Name it and plan the days here; '
                + 'the block you were training is still in the list.',
                previous ? { to: previous, from: created.name } : null,
            );
        });
    }

    /**
     * A new block from the plan on screen — drafted edits included — the way the
     * logger's "copy its shape" does it: create takes the same three fields the
     * source is made of, plans and all, so there is no copy route. The source
     * keeps whatever it was, draft and all; creating is also switching, which is
     * why the notice says so.
     */
    function copyBlock(from: Draft) {
        const name = `${from.name.trim().slice(0, MAX_NAME - COPY_SUFFIX.length)}${COPY_SUFFIX}`;
        const previous = trainedNow();

        void write(async (client) => {
            const created = await client.createMesocycle(
                name,
                from.weeks,
                from.days.map((day) => ({ label: day.label.trim(), plan: day.plan })),
            );

            setSelectedId(created.id);
            blocks.reload();
            announce(
                `Copied to ${created.name}, and the phone now opens on it. Rename it in the `
                + 'block name field; the original is unchanged.',
                previous ? { to: previous, from: created.name } : null,
            );
        });
    }

    function removeBlock() {
        if (!selected) return;

        const gone = selected;

        void write(async (client) => {
            await client.deleteMesocycle(gone.id);

            setDrafts((held) => {
                const { [gone.id]: _dropped, ...rest } = held;

                return rest;
            });

            // The list still holds it until the read below lands, and the effect
            // above moves the selection off a block that is gone.
            blocks.reload();
            announce(
                `Deleted ${gone.name} and `
                + (gone.sessionCount === 1 ? '1 logged session.' : `${gone.sessionCount} logged sessions.`),
            );
        });
    }

    function makeCurrent() {
        if (!selected) return;

        void write(async (client) => {
            await client.switchMesocycle(selected.id);
            blocks.reload();
            announce(`The phone now opens on ${selected.name}.`);
        });
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

    // Ahead of the read failures rather than behind them, because when the
    // token layer is down they *are* it: every read asks for a token first, so
    // what they report is the same failure with the diagnosis stripped off.
    // `getToken` clears this the moment a token comes back, so it never masks
    // an unrelated failure that came later.
    const failure = authFailure
        ?? actionError
        ?? blocks.error
        ?? history.error
        ?? (view === 'stats' ? workouts.error : null);

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
                onCreate={createBlock}
                busy={busy}
                theme={theme}
                onTheme={pickTheme}
                account={auth.account.username || auth.account.name || 'this account'}
                onSignOut={auth.signOut}
            />

            <main className="main">
                {failure ? (
                    <Banner
                        kind="error"
                        label="Something went wrong"
                        message={failure}
                        action={auth.error ? {
                            label: auth.signingIn ? 'Opening Entra ID…' : 'Sign in again',
                            busy: auth.signingIn,
                            onClick: auth.reauthenticate,
                        } : null}
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
                        action={undo ? {
                            label: `Undo: keep training ${undo.to.name}`,
                            busy,
                            onClick: () => undoSwitch(undo),
                        } : null}
                        onDismiss={() => announce(null)}
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
                                onClick={save}
                                disabled={busy || !isSaveable(draft)}
                            >
                                {isSaveable(draft) ? 'Save changes' : 'Add the missing names'}
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
                            library={library}
                            sessions={blockSessions}
                            loading={history.loading === selected.id}
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
                            templates={templates}
                            volumeKg={blockVolumeKg}
                            busy={busy}
                            onMakeCurrent={makeCurrent}
                            onCopy={copyBlock}
                            onDelete={removeBlock}
                            knownNames={knownNames}
                            favorites={favorites}
                        />
                    ) : view === 'library' ? (
                        <LibraryScreen
                            library={library}
                            block={selected}
                            knownNames={knownNames}
                            custom={customExercises}
                            favorites={favorites}
                        />
                    ) : (
                        <AnalyticsScreen
                            series={series}
                            selected={lift}
                            onSelect={setLift}
                            loading={workouts.loading}
                            coaching={coaching}
                        />
                    )}
                </div>
            </main>
        </div>
    );
}
