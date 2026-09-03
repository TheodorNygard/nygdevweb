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

/** `GET /gym/mesocycles/current`. A null mesocycle is a first run, not a fault. */
export interface CurrentBlock {
    mesocycle: Mesocycle | null;
    sessions: SessionSummary[];
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

/** The library published on the CDN, not by the API. */
export interface ExerciseLibrary {
    version: string;
    equipment: string[];
    exercises: { name: string; equipment: string }[];
}
