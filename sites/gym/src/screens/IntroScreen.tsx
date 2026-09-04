import { EffortGraph } from '../components/EffortGraph';
import { todayLabel } from '../lib/format';

/** The three moves a block makes, in the order it makes them. */
const STEPS = [
    {
        label: 'RAMP',
        body: 'Every week you leave fewer reps in the tank. Same exercises, same days —'
            + ' only how close to failure you finish changes.',
    },
    {
        label: 'DELOAD',
        body: 'The last week is the rest week: the same exercises at half the sets, nowhere'
            + ' near failure. It is where the previous weeks actually land.',
    },
    {
        label: 'REPEAT',
        body: 'Then a new block, starting from what the last one built. That stack of blocks'
            + ' is what periodization means.',
    },
];

/**
 * What the first tab shows before there is anything to train.
 *
 * A first run has no week to open on, and an empty screen teaches nothing —
 * least of all to someone who has never planned a block and is about to be
 * asked how many weeks it should be. So the empty state is the explanation
 * instead: what a mesocycle is, the shape it makes, and how long to make one.
 *
 * It carries no call to action of its own. Plan is the second tab, pinned to
 * the bottom of every screen including this one, so a button here would be a
 * second door onto the same room — and one that pushes the reader past the
 * thing they are here to read.
 */
export function IntroScreen() {
    return (
        <div className="screen">
            <div className="masthead">
                <span className="eyebrow eyebrow--wide">{todayLabel()}</span>
                <span className="masthead__mark">LOGBOOK</span>
            </div>

            <h1 className="title">Train in blocks.</h1>
            <p className="lede">
                A mesocycle is one block of training — a few weeks that get harder as they go,
                closed by one easy week. Run them back to back and effort rises and resets
                instead of grinding flat. That is all periodization is.
            </p>

            <EffortGraph />

            <div className="primer">
                {STEPS.map((step) => (
                    <div className="primer__step" key={step.label}>
                        <span className="primer__label">{step.label}</span>
                        <p className="primer__body">{step.body}</p>
                    </div>
                ))}
            </div>

            <div className="note">
                <span className="eyebrow">HOW LONG</span>
                <p className="note__body">
                    Four to six weeks is the sweet spot — long enough for the ramp to add up,
                    short enough that the rest week arrives before fatigue outruns the progress.
                    Three is the shortest block worth calling one; past eight you are deloading
                    late. Blocks here run 3 to 8 weeks, 2 to 6 workouts a week.
                </p>
            </div>
        </div>
    );
}
