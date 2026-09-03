// The wire shapes of func-nygdev-api's /gym routes, transcribed from
// `apifunctionapp/Gym/README.md` and `GymModel.cs` in the NygDevAzure repo.
//
// They are written as the API answers them rather than as the screens want
// them: the mapping into what a screen renders lives in the screen, so a
// change on the wire shows up here as a type error rather than as a value that
// is quietly the wrong thing three files away.

/** One logged set. Array position is its order; there is no id. */
export interface WorkSet {
    weightKg: number;
    reps: number;

    // Optional on purpose — the API takes `rpe` absent or null, and a warm-up
    // logged without one is not the same as one logged at 5.
    rpe: number | null;
}

/**
 * One exercise inside a session. No equipment: the API stores the name only
 * (`GymModel.cs` says so in as many words), so the chip under the name in the
 * design is looked up in the shipped library rather than read off the session.
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

export interface MesoDay {
    dayIndex: number;
    label: string;
}

export interface Mesocycle {
    id: string;
    name: string;
    weeks: number;
    days: MesoDay[];
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
