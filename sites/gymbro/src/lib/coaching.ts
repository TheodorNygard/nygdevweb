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
    swappedAway,
    targetsFor,
    type CustomExercise,
    type ExerciseLibrary,
    type MesocycleSummary,
    type SessionDetail,
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

    /** Today, `YYYY-MM-DD`. Passed in so the document says when it was true. */
    exportedOn: string;
}

/** `62.5 × 8 @ 8`, with the warm-up said out loud rather than left to the RPE. */
function setText(set: WorkSet): string {
    const rated = set.rpe === null ? '' : ` @ ${num(set.rpe)}`;

    return `${num(set.weightKg)} × ${set.reps}${rated}${isWarmUpRpe(set.rpe) ? ' (warm-up)' : ''}`;
}

function pointText(point: LiftPoint): string {
    return `${num(point.weightKg)} × ${point.reps} (${point.date})`;
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
 * target is reps in reserve that falls week by week, and the last week is a
 * deload. A model told none of that would read a warm-up as a bad set and the
 * rest week as a collapse.
 *
 * What it reports is what was logged and nothing derived past the app's own
 * definitions: top sets rather than estimated maxes (the reason Analytics
 * charts them), working sets per group by the same rule as the builder's
 * tally, and targets by the same functions the phone used to show them.
 */
export function coachingExport({ block, sessions, library, custom, exportedOn }: CoachingInput): string {
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
        '- RPE is rated on a 5–10 scale in halves: 10 is nothing left, 9 one rep left, 8 about two, '
            + '7 about three, 6 four or more. A set without `@` was not rated and is still a working set.',
        '- Sets at RPE 5 or 5.5 are warm-ups and are marked `(warm-up)`. They are recorded but do '
            + 'not count as working sets or toward a plan’s set target.',
        '- The plan prescribes **sets only** — never a weight or a rep count. The lifter picks the '
            + 'weight in the session; the week’s intensity target says how close to failure to go.',
        '- Intensity is a reps-in-reserve target per week that tightens as the block goes on. The '
            + '**last week is a deload**: the same exercises at half the planned sets, on fewer days, '
            + 'at an easy target. Lower numbers that week are the plan, not a regression.',
        '- “Top set” is the heaviest set logged for an exercise in a session (more reps break a '
            + 'tie). It is what was lifted, not an estimated one-rep max.',
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
                rest ? 'Deload: half the planned sets' : week === training ? 'Hardest week' : '',
            ];
        }),
    ));

    out.push('### Plan — the same every training week');
    out.push(block.days.map((day, index) => {
        const heading = `**D${index + 1} · ${dayLabel(block, index)}**`;

        if (day.plan.length === 0) return `${heading}\n- (nothing planned)`;

        const lines = day.plan.map((planned) => {
            const group = groupOf(planned.exerciseName, library);
            const detail = [equipmentFor(library, planned.exerciseName), group === NO_GROUP ? 'no group' : group]
                .join(' · ');

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
        out.push(table(
            ['Exercise', 'Group', 'Sessions', 'First top set', 'Latest top set', 'Best top set', 'Change'],
            series.map((lift) => {
                const first = lift.points[0];
                const last = lift.points[lift.points.length - 1];
                const best = lift.points.reduce((top, point) => (
                    point.weightKg > top.weightKg
                    || (point.weightKg === top.weightKg && point.reps > top.reps)
                        ? point
                        : top
                ));
                const group = groupOf(lift.name, library);

                return [
                    lift.name,
                    group === NO_GROUP ? 'No group' : group,
                    String(lift.points.length),
                    first ? pointText(first) : '—',
                    last ? pointText(last) : '—',
                    pointText(best),

                    // One session is a starting point, not a change of zero.
                    lift.points.length < 2
                        ? '—'
                        : `${lift.change >= 0 ? '+' : ''}${num(lift.change)} kg`,
                ];
            }),
        ));
    }

    // ----------------------------------------------------------------- volume

    const weeks = [...new Set(submitted.map((session) => session.week))].sort((a, b) => a - b);

    if (weeks.length > 0) {
        const byWeek = new Map<number, Map<string, number>>();
        let ungrouped = false;

        for (const session of submitted) {
            const counts = byWeek.get(session.week) ?? new Map<string, number>();

            for (const entry of session.entries) {
                const working = entry.sets.filter((set) => !isWarmUpRpe(set.rpe)).length;
                const group = groupOf(entry.exerciseName, library);

                if (group === NO_GROUP && working > 0) ungrouped = true;

                counts.set(group, (counts.get(group) ?? 0) + working);
            }

            byWeek.set(session.week, counts);
        }

        const columns = ungrouped ? [...GROUPS, NO_GROUP] : GROUPS;

        out.push('## Working sets per muscle group, by week');
        out.push(
            'Counted from what was logged, warm-ups excluded. Ten to twenty working sets a week per '
            + 'group is the range the planner aims for.',
        );
        out.push(table(
            ['Week', ...columns.map((group) => (group === NO_GROUP ? 'No group' : group))],
            weeks.map((week) => [
                String(week),
                ...columns.map((group) => String(byWeek.get(week)?.get(group) ?? 0)),
            ]),
        ));
    }

    // --------------------------------------------------------------- sessions

    out.push('## Sessions, oldest first');

    if (ordered.length === 0) out.push('No sessions logged in this block yet.');

    for (const session of ordered) {
        const tank = repsInTank(session.week, block.weeks);
        const plan = block.days[session.dayIndex]?.plan ?? [];
        const targets = targetsFor(plan, session.entries, session.week, block.weeks);
        const rest = isRestWeek(session.week, block.weeks);

        out.push(
            `### ${dateOf(session.id)} · Week ${session.week}${rest ? ' (deload)' : ''} · `
            + `D${session.dayIndex + 1} ${dayLabel(block, session.dayIndex)}`,
        );

        const status = session.status === 'submitted' ? 'Finished' : 'In progress — not finished yet';
        const rpe = session.avgRpe === null ? '' : ` · average RPE ${session.avgRpe.toFixed(1)}`;

        out.push(
            `${status}. Target: ${tank} reps in reserve (≈ RPE ${num(rpeForTank(tank))}). `
            + `${session.setCount} sets · ${Math.round(session.volumeKg)} kg total volume${rpe}.`,
        );

        const lines = session.entries.map((entry, index) => {
            const group = groupOf(entry.exerciseName, library);
            const detail = [equipmentFor(library, entry.exerciseName), group === NO_GROUP ? 'no group' : group]
                .join(' · ');
            const swap = entry.swappedFrom && entry.swappedFrom !== entry.exerciseName
                ? `, swapped in for ${entry.swappedFrom}`
                : '';
            const working = entry.sets.filter((set) => !isWarmUpRpe(set.rpe)).length;
            const target = targets[index];

            // `targetsFor` has no target for two different reasons, and a
            // coach should hear which: swapped away (its substitute below
            // carries what the plan had left) or never planned at all.
            const count = swappedAway(session.entries, index)
                ? `${workingSets(working)}, then swapped out — the substitute carries the rest`
                : target === undefined
                    ? `${workingSets(working)}, not in the plan`
                    : `${working} of ${target} planned working sets`;
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

    out.push('## Goals and context');
    out.push(
        '_Not recorded in the app. Add goals, injuries, schedule, sleep or anything else the reader '
        + 'should weigh before sending._',
    );

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
