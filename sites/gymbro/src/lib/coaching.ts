import { seriesOf, type LiftPoint } from './analytics';
import { GROUPS, NO_GROUP, groupOf } from './groups';
import {
    dayLabel,
    daysForWeek,
    equipmentFor,
    isRestWeek,
    isWarmUpRpe,
    num,
    repsInTank,
    rpeForTank,
    sessionDate,
    sessionOrdinal,
    setsForWeek,
    swappedAway,
    targetsFor,
    type CustomExercise,
    type ExerciseLibrary,
    type LifterProfile,
    type MesocycleSummary,
    type SessionDetail,
    type SessionEntry,
    type WorkSet,
} from './gym';

export interface CoachingInput {
    block: MesocycleSummary;

    /** The block's sessions with their sets, in any order. Drafts included. */
    sessions: readonly SessionDetail[];

    /** The merged library — shipped and the user's own — for equipment and groups. */
    library: ExerciseLibrary | null;

    /** The user's own exercises, so the export can say what each one is. */
    custom: readonly CustomExercise[];

    /** The lifter's profile, which fills in *Goals and context*. `{}` when none is saved. */
    profile: LifterProfile;

    /** Today, `YYYY-MM-DD`. Passed in so the document says when it was true. */
    exportedOn: string;
}

/**
 * What a barbell weighs where the lifter trains. The logger stores the number
 * typed in — the whole load, bar included — and has no field for the bar, so
 * this is the convention the document states rather than a value it reads.
 */
const BAR_KG = 20;

/**
 * The library's equipment word for a dumbbell lift. A dumbbell weight is logged
 * per hand, so for volume a set on one of these counts both hands.
 */
const DUMBBELL = 'Dumbbell';
const DUMBBELL_HANDS = 2;

/** The working sets a week per group the planner's tally is aimed at. */
const SETS_LOW = 10;
const SETS_HIGH = 20;

/** `62.5 × 8 @ 8`, with the warm-up said out loud rather than left to the RPE. */
function setText(set: WorkSet): string {
    const rated = set.rpe === null ? '' : ` @ ${num(set.rpe)}`;

    return `${num(set.weightKg)} × ${set.reps}${rated}${isWarmUpRpe(set.rpe) ? ' (warm-up)' : ''}`;
}

/** `Wk2 D1` — where in the block a session sits, which a date alone cannot say. */
function cellLabel(week: number, dayIndex: number): string {
    return `Wk${week} D${dayIndex + 1}`;
}

/** `62.5 × 8 (Wk1 D1, 2026-09-03)`. */
function pointText(point: LiftPoint): string {
    return `${num(point.weightKg)} × ${point.reps} (${cellLabel(point.week, point.dayIndex)}, ${point.date})`;
}

/** `+5`, `-2.5`, `0` — a delta with its sign said. */
function signed(delta: number): string {
    return `${delta > 0 ? '+' : ''}${num(delta)}`;
}

/**
 * How an exercise moved, read the only way the plan makes comparable: the same
 * exercise on the same plan day, first week it was logged against the latest.
 * D1's bench against D2's would compare two different slots of the week —
 * different fatigue, often different intent — and call the difference progress.
 *
 * One line per plan day the exercise was logged on more than once; weight
 * first, with the reps of both top sets beside it, because a heavier top set
 * for fewer reps is not the same change as one for the same reps. A dash when
 * no day has two sessions to compare.
 */
function changeText(points: readonly LiftPoint[]): string {
    const byDay = new Map<number, LiftPoint[]>();

    for (const point of points) {
        const run = byDay.get(point.dayIndex) ?? [];

        run.push(point);
        byDay.set(point.dayIndex, run);
    }

    const parts: string[] = [];

    for (const [dayIndex, run] of [...byDay].sort(([a], [b]) => a - b)) {
        const first = run[0];
        const last = run[run.length - 1];

        if (run.length < 2 || !first || !last) continue;

        const reps = first.reps === last.reps
            ? `same reps (${first.reps})`
            : `reps ${first.reps} → ${last.reps}`;

        parts.push(
            `D${dayIndex + 1} Wk${first.week} → Wk${last.week}: `
            + `${signed(last.weightKg - first.weightKg)} kg, ${reps}`,
        );
    }

    return parts.length === 0 ? '—' : parts.join('; ');
}

/** A Markdown table, from a header row and body rows. Pipes in cells are escaped. */
function table(head: readonly string[], rows: readonly (readonly string[])[]): string {
    const cell = (value: string) => value.replace(/\|/g, '\\|');
    const line = (cells: readonly string[]) => `| ${cells.map(cell).join(' | ')} |`;

    return [line(head), line(head.map(() => '---')), ...rows.map(line)].join('\n');
}

/** "1 working set", "3 working sets". */
function workingSets(count: number): string {
    return `${count} working set${count === 1 ? '' : 's'}`;
}

function dateOf(sessionId: string): string {
    return sessionDate(sessionId) ?? sessionId;
}

function groupName(group: string): string {
    return group === NO_GROUP ? 'No group' : group;
}

/** How many hands a logged weight stands for: two on a dumbbell lift, one otherwise. */
function handsFor(library: ExerciseLibrary | null, exerciseName: string): number {
    return equipmentFor(library, exerciseName) === DUMBBELL ? DUMBBELL_HANDS : 1;
}

/**
 * Weight × reps over every set, warm-ups included, with a dumbbell set counted
 * for both hands. Summed here rather than read off the API's `volumeKg`, which
 * counts the weight as logged: the document states that dumbbells are per
 * hand, and its volume has to agree with what it states.
 */
function volumeOf(entries: readonly SessionEntry[], library: ExerciseLibrary | null): number {
    let total = 0;

    for (const entry of entries) {
        const hands = handsFor(library, entry.exerciseName);

        for (const set of entry.sets) total += set.weightKg * set.reps * hands;
    }

    return total;
}

/** A profile's free text on one line, so it sits inside a list item. */
function oneLine(text: string): string {
    return text.replace(/\s*\n\s*/g, ' ').trim();
}

/**
 * The working sets per group a given week of the plan prescribes: every
 * planned exercise on the days that week runs, at that week's set count — the
 * plan's own in a training week, halved on the deload. The same arithmetic
 * `targetsFor` uses for each session, summed across the week.
 */
function plannedByGroup(
    block: MesocycleSummary,
    library: ExerciseLibrary | null,
    week: number,
): Map<string, number> {
    const counts = new Map<string, number>();
    const days = daysForWeek(block.days.length, week, block.weeks);

    for (const day of block.days.slice(0, days)) {
        for (const planned of day.plan) {
            const group = groupOf(planned.exerciseName, library);
            const sets = setsForWeek(planned.sets, week, block.weeks);

            counts.set(group, (counts.get(group) ?? 0) + sets);
        }
    }

    return counts;
}

/**
 * The selected block, written for a coaching conversation with a person or an
 * AI model: everything a reader needs to interpret it is in the document.
 *
 * Markdown rather than JSON or CSV, deliberately. A chat is where this ends up,
 * and Markdown is what a language model reads most fluently *and* what the
 * person pasting it can read and edit before sending — a JSON blob would need
 * its schema explained, and a CSV loses the structure of a session. Tables are
 * used where the reader will compare across rows (weeks, lifts), prose-shaped
 * lists where it will read down a session.
 *
 * It opens with how to read it, because the conventions here are the app's
 * own and a reader cannot guess them: RPE 5 and 5.5 are warm-ups and count
 * toward nothing, a plan prescribes sets and never weights, the intensity
 * target is reps in reserve that falls week by week, the last week is a deload
 * at half the sets rounded up, a barbell weight includes the bar and a dumbbell
 * weight is per hand. A model told none of that would read a warm-up as a bad
 * set, the rest week as a collapse and a dumbbell press as half the lift.
 *
 * What it reports is what was logged and nothing derived past the app's own
 * definitions: top sets rather than estimated maxes (the reason Analytics
 * charts them), working sets per group by the same rule as the builder's
 * tally, and targets by the same functions the phone used to show them. The
 * one number it sums for itself is volume, because the API's counts a dumbbell
 * once and this document says a dumbbell is per hand.
 *
 * Where it compares across time it compares like with like: the same exercise
 * on the same plan day, week against week. Every top set is labelled with its
 * week and day as well as its date, because two sessions can share a date and
 * a date alone cannot tell D1 from D2.
 */
export function coachingExport({ block, sessions, library, custom, profile, exportedOn }: CoachingInput): string {
    const ordered = [...sessions].sort((a, b) => a.id.localeCompare(b.id));
    const submitted = ordered.filter((session) => session.status === 'submitted');
    const drafts = ordered.length - submitted.length;
    const out: string[] = [];

    out.push(`# Training log: ${block.name}`);
    out.push(
        `Exported from gymbro on ${exportedOn}. One training block (a mesocycle), as `
        + 'logged set by set on the phone. Everything needed to read it is below.',
    );

    out.push('## How to read this');
    out.push([
        '- Weights are kilograms. A set is written `weight × reps @ RPE`, e.g. `62.5 × 8 @ 8`.',
        `- **Barbell weights include the bar** (a standard ${BAR_KG} kg bar): \`60 × 5\` on a bench press `
            + 'is 60 kg total on the bar, not 60 kg of plates. Nothing is logged per side.',
        '- **Dumbbell weights are per hand**: `30 × 10` on a dumbbell press is two 30 kg dumbbells. '
            + 'Each exercise carries its equipment in brackets, so a reader can tell which rule applies.',
        '- RPE is rated on a 5–10 scale in halves: 10 is nothing left, 9 one rep left, 8 about two, '
            + '7 about three, 6 four or more. A set without `@` was not rated and is still a working set.',
        '- Sets at RPE 5 or 5.5 are warm-ups and are marked `(warm-up)`. They are recorded but do '
            + 'not count as working sets or toward a plan’s set target.',
        '- The plan prescribes **sets only** — never a weight or a rep count. The lifter picks the '
            + 'weight in the session; the week’s intensity target says how close to failure to go.',
        '- Intensity is a reps-in-reserve target per week that tightens as the block goes on. The '
            + '**last week is a deload**: the same exercises at **half the planned sets, rounded up** '
            + '(4 → 2, 3 → 2, 1 → 1), on fewer days (D1 alone, or D1 and D2 once the block trains '
            + 'four days or more), at an easy target. Lower numbers that week are the plan, not a '
            + 'regression.',
        '- Sessions and top sets are labelled `Wk2 D1`: week 2 of the block, the first plan day. '
            + 'Two sessions can share a date, so the label is what tells them apart.',
        '- “Top set” is the heaviest set logged for an exercise in a session (more reps break a '
            + 'tie). It is what was lifted, not an estimated one-rep max.',
        '- “Change” in the progress table compares the top set of **the same exercise on the same '
            + 'plan day** — D1’s bench against D1’s bench — in the first and the latest week it was '
            + 'logged. It is the **weight difference** of those two top sets, with the reps of both '
            + 'beside it; it does not fold reps into the number. An exercise on two plan days gets a '
            + 'line per day, and D1 is never compared with D2.',
        '- “Total volume” is weight × reps summed over every set in the session, warm-ups included, '
            + `with a dumbbell set counted for both hands (× ${DUMBBELL_HANDS}). The app’s own screens `
            + 'count a dumbbell once, so their volume reads lower for dumbbell work.',
        '- “Swapped in for X” means the exercise replaced X in that session — usually because the '
            + 'equipment was taken.',
        '- Muscle groups are the seven the planner counts: '
            + `${GROUPS.join(', ')}. “No group” means the exercise is not described with one.`,
    ].join('\n'));

    // ------------------------------------------------------------------ block

    const training = block.weeks - 1;
    const lastWeek = ordered.reduce((latest, session) => Math.max(latest, session.week), 0);

    out.push('## The block');
    out.push(table(['Block', ''], [
        ['Name', block.name],
        ['Length', `${block.weeks} weeks: ${training} training weeks and a deload in week ${block.weeks}`],
        ['Training days', `${block.days.length} per week`],
        ['Being trained now', block.isCurrent ? 'Yes' : 'No'],
        [
            'Sessions logged',
            `${submitted.length} finished${drafts > 0 ? `, ${drafts} in progress` : ''}`
                + (lastWeek > 0 ? ` — latest in week ${lastWeek}` : ''),
        ],
    ]));

    out.push('### Weekly intensity target');
    out.push(table(
        ['Week', 'Reps in reserve', '≈ RPE', 'Sessions', 'Note'],
        Array.from({ length: block.weeks }, (_, index) => {
            const week = index + 1;
            const tank = repsInTank(week, block.weeks);
            const rest = isRestWeek(week, block.weeks);
            const days = daysForWeek(block.days.length, week, block.weeks);

            return [
                String(week),
                String(tank),
                num(rpeForTank(tank)),
                String(days),
                rest ? 'Deload: half the planned sets, rounded up' : week === training ? 'Hardest week' : '',
            ];
        }),
    ));

    out.push('### Plan — the same every training week');
    out.push(block.days.map((day, index) => {
        const heading = `**D${index + 1} · ${dayLabel(block, index)}**`;

        if (day.plan.length === 0) return `${heading}\n- (nothing planned)`;

        const lines = day.plan.map((planned) => {
            const detail = [equipmentFor(library, planned.exerciseName), groupName(groupOf(planned.exerciseName, library))]
                .join(' · ')
                .toLowerCase();

            return `- ${planned.exerciseName} — ${planned.sets} sets (${detail})`;
        });

        return [heading, ...lines].join('\n');
    }).join('\n\n'));

    // --------------------------------------------------------------- progress

    const series = seriesOf(submitted, dateOf);

    out.push('## Progress by exercise (finished sessions)');

    if (series.length === 0) {
        out.push('Nothing finished yet.');
    } else {
        out.push(
            'Top sets are labelled with the week and plan day they were lifted in. Change compares '
            + 'the same plan day across weeks — see *How to read this*.',
        );
        out.push(table(
            ['Exercise', 'Group', 'Sessions', 'First top set', 'Latest top set', 'Best top set', 'Change (same day)'],
            series.map((lift) => {
                const first = lift.points[0];
                const last = lift.points[lift.points.length - 1];
                const best = lift.points.reduce((top, point) => (
                    point.weightKg > top.weightKg
                    || (point.weightKg === top.weightKg && point.reps > top.reps)
                        ? point
                        : top
                ));

                return [
                    lift.name,
                    groupName(groupOf(lift.name, library)),
                    String(lift.points.length),
                    first ? pointText(first) : '—',
                    last ? pointText(last) : '—',
                    pointText(best),
                    changeText(lift.points),
                ];
            }),
        ));
    }

    // ----------------------------------------------------------------- volume

    const weeks = [...new Set(submitted.map((session) => session.week))].sort((a, b) => a - b);
    const planned = block.days.some((day) => day.plan.length > 0);

    if (weeks.length > 0 || planned) {
        const loggedByWeek = new Map<number, Map<string, number>>();
        let ungrouped = false;

        for (const session of submitted) {
            const counts = loggedByWeek.get(session.week) ?? new Map<string, number>();

            for (const entry of session.entries) {
                const working = entry.sets.filter((set) => !isWarmUpRpe(set.rpe)).length;
                const group = groupOf(entry.exerciseName, library);

                if (group === NO_GROUP && working > 0) ungrouped = true;

                counts.set(group, (counts.get(group) ?? 0) + working);
            }

            loggedByWeek.set(session.week, counts);
        }

        // A training week's prescription — week 1 is always one, since a block
        // is three weeks at least and only the last is the deload.
        const trainingWeek = plannedByGroup(block, library, 1);

        if ((trainingWeek.get(NO_GROUP) ?? 0) > 0) ungrouped = true;

        const columns = ungrouped ? [...GROUPS, NO_GROUP] : GROUPS;

        out.push('## Working sets per muscle group, by week: logged / planned');
        out.push(
            'Each cell is `logged / planned`: the working sets finished in that week’s sessions, '
            + 'warm-ups excluded, against what the plan prescribes for that week — its own set '
            + 'counts in a training week, halved and rounded up on fewer days in the deload. A '
            + 'logged count under the planned one is sets not done; over it is sets added on top '
            + 'of the plan.',
        );

        if (weeks.length > 0) {
            out.push(table(
                ['Week', ...columns.map(groupName)],
                weeks.map((week) => {
                    const prescribed = plannedByGroup(block, library, week);

                    return [
                        `${week}${isRestWeek(week, block.weeks) ? ' (deload)' : ''}`,
                        ...columns.map((group) => (
                            `${loggedByWeek.get(week)?.get(group) ?? 0} / ${prescribed.get(group) ?? 0}`
                        )),
                    ];
                }),
            ));
        } else {
            out.push('No week finished yet, so there is nothing logged to set against the plan.');
        }

        // What the plan asks for in a full training week, and where that sits
        // against the planner's guide — said here so a reader does not hold a
        // plan that chose six sets of arms to a range it never aimed at.
        const prescribed = GROUPS.map((group) => ({ group, sets: trainingWeek.get(group) ?? 0 }));
        const none = prescribed.filter(({ sets }) => sets === 0).map(({ group }) => group);
        const under = prescribed.filter(({ sets }) => sets > 0 && sets < SETS_LOW);
        const over = prescribed.filter(({ sets }) => sets > SETS_HIGH);
        const inRange = prescribed.filter(({ sets }) => sets >= SETS_LOW && sets <= SETS_HIGH);
        const summary = prescribed
            .filter(({ sets }) => sets > 0)
            .map(({ group, sets }) => `${group} ${sets}`)
            .join(', ');
        const outside: string[] = [];

        if (under.length > 0) {
            outside.push(`fewer for ${under.map(({ group, sets }) => `${group} (${sets})`).join(', ')}`);
        }

        if (over.length > 0) {
            outside.push(`more for ${over.map(({ group, sets }) => `${group} (${sets})`).join(', ')}`);
        }

        if (none.length > 0) {
            outside.push(`none for ${none.join(', ')}`);
        }

        out.push(
            `A full training week of this plan prescribes ${summary || 'no working sets'}. `
            + `The planner’s guide is ${SETS_LOW}–${SETS_HIGH} working sets a week per group; `
            + (outside.length === 0
                ? 'every group this plan trains sits inside it.'
                : inRange.length === 0
                    ? `this plan sits outside it everywhere — ${outside.join('; ')}. Read that as the `
                        + 'plan’s choice, not as sets missed; the table above says what was actually done.'
                    : `this plan prescribes ${outside.join('; ')}. Read that as the plan’s choice, `
                        + 'not as sets missed; the table above says what was actually done.'),
        );
    }

    // --------------------------------------------------------------- sessions

    out.push('## Sessions, oldest first');

    if (ordered.length === 0) out.push('No sessions logged in this block yet.');

    for (const session of ordered) {
        const tank = repsInTank(session.week, block.weeks);
        const plan = block.days[session.dayIndex]?.plan ?? [];
        const targets = targetsFor(plan, session.entries, session.week, block.weeks);
        const rest = isRestWeek(session.week, block.weeks);
        const ordinal = sessionOrdinal(session.id);

        out.push(
            `### ${cellLabel(session.week, session.dayIndex)} · ${dayLabel(block, session.dayIndex)} · `
            + `${dateOf(session.id)}${ordinal > 1 ? ` (session ${ordinal} that day)` : ''}`
            + `${rest ? ' · deload' : ''}`,
        );

        const target = `Target: ${tank} rep${tank === 1 ? '' : 's'} in reserve (≈ RPE ${num(rpeForTank(tank))}).`;
        const logged = session.entries.reduce((total, entry) => total + entry.sets.length, 0);

        // A workout started and not lifted — the phone opened on the plan and
        // nothing more — is one line, not a plan read out exercise by exercise
        // with "nothing logged" after each.
        if (session.status !== 'submitted' && logged === 0) {
            const count = session.entries.length;

            out.push(
                `In progress — nothing logged yet. ${target} `
                + (count === 0
                    ? 'No exercises on it.'
                    : `${count} exercise${count === 1 ? '' : 's'} on it from the plan, none lifted.`),
            );

            continue;
        }

        const status = session.status === 'submitted' ? 'Finished' : 'In progress — not finished yet';
        const working = session.entries.reduce(
            (total, entry) => total + entry.sets.filter((set) => !isWarmUpRpe(set.rpe)).length,
            0,
        );
        const rpe = session.avgRpe === null ? '' : ` · average RPE ${session.avgRpe.toFixed(1)}`;

        out.push(
            `${status}. ${target} ${logged} sets (${working} working) · `
            + `${Math.round(volumeOf(session.entries, library))} kg total volume${rpe}.`,
        );

        const lines = session.entries.map((entry, index) => {
            const detail = [equipmentFor(library, entry.exerciseName), groupName(groupOf(entry.exerciseName, library))]
                .join(' · ')
                .toLowerCase();
            const swap = entry.swappedFrom && entry.swappedFrom !== entry.exerciseName
                ? `, swapped in for ${entry.swappedFrom}`
                : '';
            const done = entry.sets.filter((set) => !isWarmUpRpe(set.rpe)).length;
            const asked = targets[index];

            // `targetsFor` has no target for two different reasons, and a
            // coach should hear which: swapped away (its substitute below
            // carries what the plan had left) or never planned at all.
            const count = swappedAway(session.entries, index)
                ? `${workingSets(done)}, then swapped out — the substitute carries the rest`
                : asked === undefined
                    ? `${workingSets(done)}, not in the plan`
                    : `${done} of ${asked} planned working sets`;
            const sets = entry.sets.length === 0 ? 'nothing logged' : entry.sets.map(setText).join('; ');

            return `- **${entry.exerciseName}** (${detail}${swap}) — ${count}: ${sets}`;
        });

        if (lines.length > 0) out.push(lines.join('\n'));
    }

    // ------------------------------------------------------- own exercises

    const used = new Set(ordered.flatMap((session) => session.entries.map((entry) => entry.exerciseName)));

    for (const day of block.days) {
        for (const planned of day.plan) used.add(planned.exerciseName);
    }

    const described = custom.filter((exercise) => used.has(exercise.name));
    const listed = new Set(library?.exercises.map((exercise) => exercise.name) ?? []);
    const undescribed = [...used].filter((name) => !listed.has(name)).sort();

    if (described.length > 0 || undescribed.length > 0) {
        out.push('## Exercises not in the standard library');

        const lines = described.map((exercise) => {
            const parts = [
                exercise.equipment ?? 'equipment not given',
                exercise.group ?? 'no group',
                exercise.muscles?.length ? `trains ${exercise.muscles.join(', ')}` : null,
                exercise.variationOf ? `a variation of ${exercise.variationOf}` : null,
            ].filter((part): part is string => part !== null);

            return `- ${exercise.name}: ${parts.join('; ')}`;
        });

        for (const name of undescribed) {
            lines.push(`- ${name}: a name typed by the lifter, with no description`);
        }

        out.push(lines.join('\n'));
    }

    // ----------------------------------------------------- goals and context

    out.push('## Goals and context');

    const about: string[] = [];

    if (profile.experience) about.push(`- Experience: ${profile.experience}`);
    if (profile.bodyweightKg !== undefined) about.push(`- Bodyweight: ${num(profile.bodyweightKg)} kg`);
    if (profile.goal) about.push(`- Goal: ${oneLine(profile.goal)}`);
    if (profile.injuries) about.push(`- Injuries and limits: ${oneLine(profile.injuries)}`);

    if (about.length === 0) {
        out.push(
            '_Not recorded in the app. Add goals, injuries, schedule, sleep or anything else the reader '
            + 'should weigh before sending._',
        );
    } else {
        out.push(about.join('\n'));
        out.push(
            '_From the lifter’s profile in gymbro. Add schedule, sleep, how the week went or anything '
            + 'else the reader should weigh before sending._',
        );
    }

    return `${out.join('\n\n')}\n`;
}

/** A filename for the download: the block's name, made safe, and the date. */
export function coachingFilename(block: MesocycleSummary, exportedOn: string): string {
    const slug = block.name
        .normalize('NFKD')
        .replace(/[^\w\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .toLowerCase();

    return `gymbro-${slug || 'block'}-${exportedOn}.md`;
}
