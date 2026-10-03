// The wire shapes of func-nygdev-api's /gym routes, transcribed from
// `apifunctionapp/Gym/README.md` and `GymModel.cs` in the NygDevAzure repo.
// Written as the API answers them rather than as the screens want them, so a
// change on the wire shows up here as a type error rather than as a value that
// is quietly the wrong thing three files away.

/** One logged set. Array position is its order; there is no id. */
export interface WorkSet {
    weightKg: number;
    reps: number;

    // Optional on purpose: a warm-up logged without an RPE is not the same as
    // one logged at 5.
    rpe: number | null;
}

/**
 * One exercise inside a session. No equipment — the API stores the name only,
 * so the chip under the name is looked up in the shipped library.
 */
export interface SessionEntry {
    exerciseName: string;

    /**
     * The exercise this one was swapped in for, when it was — always the
     * *original*, so a second swap still names what the plan asked for. Absent
     * rather than null on every other entry, which is how the API sends it.
     */
    swappedFrom?: string;

    sets: WorkSet[];
}

export interface SessionTotals {
    exerciseCount: number;
    setCount: number;
    volumeKg: number;
    avgRpe: number | null;
}

export type SessionStatus = 'draft' | 'submitted';

/** A session in full — what the logging screen edits. */
export interface Workout {
    id: string;
    mesoId: string;
    week: number;
    dayIndex: number;
    status: SessionStatus;
    entries: SessionEntry[];
    totals: SessionTotals;
}

/**
 * A session as the block map and History see it: totals flattened onto the
 * summary rather than nested under `totals`, which is how the API sends it.
 */
export interface SessionSummary {
    id: string;
    week: number;
    dayIndex: number;
    status: SessionStatus;
    exerciseCount: number;
    setCount: number;
    volumeKg: number;
    avgRpe: number | null;
}

/**
 * The same summary with the sets left on it — `GET /gym/workouts?include=entries`.
 *
 * A separate type rather than an optional field on the summary above, because
 * the key is present exactly when it was asked for: a screen holding one of
 * these knows it has the sets, and the block map cannot accidentally read a
 * `?.entries` that is never populated for it.
 *
 * The API derives every total by walking these, so including them costs the
 * bytes and nothing else. That is what makes charting a block one call rather
 * than one call per session — see `hooks/useWorkouts` in the planner.
 */
export interface SessionDetail extends SessionSummary {
    entries: SessionEntry[];
}

/**
 * One exercise a day prescribes: a name and a number of sets.
 *
 * Deliberately no target weight and — since reps stopped being planned — no
 * target reps. Both are what a session discovers rather than what a programme
 * decides, and a prescribed one is wrong the moment it is beaten. How hard the
 * sets should be comes from the week instead: see `repsInTank` in `lib/block`.
 *
 * Blocks saved while reps were planned still carry a `reps` on the wire. It is
 * not in this type because nothing reads it, and the API ignores it on the way
 * back in.
 */
export interface PlannedExercise {
    exerciseName: string;
    sets: number;
}

/**
 * A labelled day of the block, and what it plans. The plan hangs off the day
 * rather than off a cell, so every week's "Upper A" shares it — days are
 * labelled, not scheduled. `plan` is empty on a day that prescribes nothing.
 */
export interface MesoDay {
    dayIndex: number;
    label: string;
    plan: PlannedExercise[];
}

/** What create and patch send for a day: the label, and what it prescribes. */
export interface DayInput {
    label: string;
    plan: PlannedExercise[];
}

export interface Mesocycle {
    id: string;
    name: string;
    weeks: number;
    days: MesoDay[];
}

/**
 * A block as the Plan tab's list sees it. The counts are what make the row
 * readable and the delete answerable. No volume here on purpose: it needs the
 * sets, so the delete confirmation fetches it for the one block it is asking
 * about rather than every row paying for it on every list.
 */
export interface MesocycleSummary extends Mesocycle {
    isCurrent: boolean;
    sessionCount: number;
    submittedCount: number;
}

/**
 * The exercises a user reaches for: the ones they starred, in the order they
 * starred them, and the ones their last few finished workouts lifted, most
 * recent first. Names, as every reference to an exercise is. They ride along
 * on both block reads rather than having a route of their own.
 */
export interface ExercisePicks {
    favorites: string[];
    recent: string[];
}

/**
 * `GET /gym/mesocycles/current`. A null mesocycle is a first run, not a fault.
 *
 * The picks are optional here because a copy of this held in storage from
 * before they existed has neither, and absent means empty.
 */
export interface CurrentBlock extends Partial<ExercisePicks> {
    mesocycle: Mesocycle | null;
    sessions: SessionSummary[];
}

/** `GET /gym/mesocycles`: every block, and the same picks `/current` carries. */
export interface BlockList extends ExercisePicks {
    mesocycles: MesocycleSummary[];
}

/** `POST /gym/workouts` — `resumed` says whether this Start found a draft. */
export interface StartedWorkout {
    resumed: boolean;
    workout: Workout;
}

/** `POST …/entries`. `alreadyRecorded` is a success, not a failure. */
export interface EntryResult {
    alreadyRecorded: boolean;
    entryIndex: number;
    entryCount: number;
    exerciseName: string;
}

/** `POST …/sets`. Same rule: `alreadyRecorded` means the first attempt landed. */
export interface SetResult {
    alreadyRecorded: boolean;
    entryIndex: number;
    setIndex: number;
    setCount: number;
}

export interface RemoveSetResult {
    alreadyRemoved: boolean;
    entryIndex: number;
    setCount: number;
}

/**
 * `DELETE …/entries/{i}`. Same rule again: `alreadyRemoved` means the first
 * attempt landed.
 *
 * Only an entry with no sets can be removed — an exercise that was lifted is a
 * logged workout, and no call here deletes one as a side effect. That is where
 * the screen's rule comes from rather than the other way round: the × appears
 * on an exercise once its last set is gone.
 */
export interface RemoveEntryResult {
    alreadyRemoved: boolean;
    entryIndex: number;
    entryCount: number;
}

/**
 * `POST …/entries/swap`. `entryIndex` is where the substitute now sits; `replaced`
 * says whether it took the original's place (nothing was logged on it) or went in
 * straight after it (something was, and stays where it was lifted).
 */
export interface SwapEntryResult {
    alreadyApplied: boolean;
    entryIndex: number;
    entryCount: number;
    replaced: boolean;
    exerciseName: string;
}

/** `PUT …/sets/{j}`. `alreadyApplied` means the set already held these values. */
export interface EditSetResult {
    alreadyApplied: boolean;
    entryIndex: number;
    setIndex: number;
    setCount: number;
}

/**
 * `POST …/entries/move`. `alreadyApplied` is the same rule as `alreadyRecorded`
 * elsewhere: it means this exact move already landed, not that it failed.
 *
 * There is no `order` field anywhere in this API, on this or on a workout or a
 * plan — array position **is** the order, on the wire and in storage alike, and
 * a client that wants it reads the `entries` array as it stands.
 */
export interface EntryMoveResult {
    alreadyApplied: boolean;
    from: number;
    to: number;
    entryCount: number;
}

/**
 * One exercise in the shipped library.
 *
 * A variation is an exercise of its own with `variationOf` naming its family's
 * root — `Preacher Curl` → `Bicep Curl` — rather than an attribute on one. An
 * entry stores a name, so a variation has its own history and its own top sets
 * for free, and what it counts toward is read off `group` and `variationOf`
 * rather than written anywhere.
 *
 * All three descriptive fields are optional: a library cached from before they
 * existed still works, and simply has nothing to suggest a swap from.
 */
export interface LibraryExercise {
    name: string;
    equipment: string;

    /** The family's root, for a variation. Never another variation. */
    variationOf?: string;

    /** The job the movement does — `horizontal-push`, `hinge`, `curl`. */
    pattern?: string;

    /** The muscle group it is planned against, one of gymbro's seven. */
    group?: string;

    /**
     * The muscles it trains, the main one first — `Chin-up` is lats, then
     * biceps. Finer than `group`, which puts biceps and triceps both under
     * Arms: this is what tells a curl's alternatives from a pushdown's.
     */
    muscles?: string[];
}

/** The library published on the CDN, not by the API. */
export interface ExerciseLibrary {
    version: string;
    equipment: string[];
    exercises: LibraryExercise[];
}

/**
 * An exercise of the user's own, from `GET /gym/exercises`: the library's shape
 * with an id, and equipment optional because the API stores it that way.
 *
 * A description of a name rather than a thing plans point at. Plans and
 * sessions hold exercises by name and still do, so describing one describes
 * every session that already used it, and deleting the description leaves
 * them all as they were. The name cannot change for the same reason — the id
 * is derived from it.
 */
export interface CustomExercise {
    id: string;
    name: string;
    equipment?: string;
    group?: string;
    muscles?: string[];
    variationOf?: string;
}

/** What is sent to describe one: all of it but the id, which the API derives from the name. */
export type CustomExerciseInput = Omit<CustomExercise, 'id'>;

/**
 * A saved day plan: a name, and the exercises it drops into a day.
 *
 * The same shape as a day's `plan` and deliberately not a richer one, because
 * applying a template is a copy into the Plan tab's draft and nothing else.
 * Nothing on a block records where a day's exercises came from, so renaming or
 * deleting a template never reaches back into a block filled from it.
 *
 * Both halves of the picker are this type. A built-in one has an id like
 * `builtin_push` and comes from the CDN; a saved one has `template_01k4…` and
 * comes from the API. They stay in separate lists rather than being merged and
 * sorted out again by their prefix, because only one of the two can be edited.
 */
export interface DayTemplate {
    id: string;
    name: string;
    plan: PlannedExercise[];
}

/** The built-in templates published on the CDN, not by the API. */
export interface TemplateLibrary {
    version: string;
    templates: DayTemplate[];
}
