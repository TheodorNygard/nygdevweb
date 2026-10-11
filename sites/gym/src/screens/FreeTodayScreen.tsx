import { BlockPrimer } from '../components/BlockPrimer';
import { FreeSessionRows } from '../components/FreeSessionRows';
import { Masthead } from '../components/Masthead';
import { kg, localDate, sessionDate } from '../lib/format';
import type { Theme } from '../lib/theme';
import type { DatedSession } from '../lib/types';

interface FreeTodayScreenProps {
    /** The last few months of workouts, newest first; see `useRecentSessions`. */
    sessions: DatedSession[];
    loading: boolean;
    busy: boolean;

    /** Opens the start sheet: an empty workout, or one from a template. */
    onStart: () => void;

    /** Resumes the workout already open today. */
    onResume: (sessionId: string) => void;
    onOpen: (session: DatedSession) => void;

    theme: Theme;
    onTheme: (theme: Theme) => void;
}

/** How many days "this week" looks back over, today included. */
const WEEK_DAYS = 7;

/**
 * Today, for someone with no block: one button to log a workout, and what they
 * have logged lately.
 *
 * A block's Today is a week of labelled days, because a block decides what
 * each day is. Without one nothing decides that, so there is no grid to show
 * and no "up next" to point at — the only question this screen answers is
 * "log a workout?", and the list underneath is the record of the answers.
 * The one number at the top is the last seven days, which is the unit anyone
 * training without a plan actually counts in.
 *
 * Only freestanding workouts are listed. Someone who stopped running blocks
 * still has those sessions in History, under their blocks, where a week number
 * still means something.
 *
 * On a first run, with nothing logged, the block explainer sits underneath:
 * this is still the one moment anyone reads what a mesocycle is, and the
 * person deciding between the two ways to train should see both.
 */
export function FreeTodayScreen({
    sessions,
    loading,
    busy,
    onStart,
    onResume,
    onOpen,
    theme,
    onTheme,
}: FreeTodayScreenProps) {
    const free = sessions.filter((session) => session.freestanding);
    const today = localDate();
    const draft = free.find((session) => session.status === 'draft' && sessionDate(session.id) === today);

    const since = new Date();
    since.setDate(since.getDate() - (WEEK_DAYS - 1));
    const weekStart = localDate(since);

    const thisWeek = free.filter((session) => (
        session.status === 'submitted' && (sessionDate(session.id) ?? '') >= weekStart
    ));
    const weekVolume = thisWeek.reduce((total, session) => total + session.volumeKg, 0);

    return (
        <div className="screen">
            <Masthead theme={theme} onTheme={onTheme} />

            <h1 className="title">Log a workout.</h1>
            <p className="lede">
                No block, no weeks, no deload. Lift, log every set as you go, and it lands
                here.
            </p>

            <div className="stack-22">
                <button
                    type="button"
                    className="primary"
                    disabled={busy}
                    onClick={() => (draft ? onResume(draft.id) : onStart())}
                >
                    {busy ? 'Working…' : draft ? 'Resume today’s workout' : 'Start a workout'}
                </button>
            </div>

            {free.length > 0 ? (
                <>
                    <div className="hist__head stack-22">
                        <span className="eyebrow">LAST {WEEK_DAYS} DAYS</span>
                        <span className="hist__total">
                            {thisWeek.length} {thisWeek.length === 1 ? 'workout' : 'workouts'}
                            {' · '}
                            {kg(weekVolume)}
                        </span>
                    </div>

                    <span className="section-label">RECENT</span>
                    <div style={{ marginTop: 10 }}>
                        <FreeSessionRows sessions={free} onOpen={onOpen} />
                    </div>
                </>
            ) : loading ? (
                <p className="empty">Reading your workouts…</p>
            ) : (
                <div className="stack-22">
                    <BlockPrimer />
                </div>
            )}
        </div>
    );
}
