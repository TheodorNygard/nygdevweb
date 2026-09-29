/**
 * The API's bounds on a block, from `GymLimits` in `apifunctionapp/Gym/GymModel.cs`.
 *
 * Repeated here rather than imported from the logger's Plan screen, which holds
 * its own copy for the same reason: they are the server's rule, and a client
 * that lets you build something outside them is a client whose Save fails with
 * a validation error instead of a disabled button.
 */
export const MIN_WEEKS = 3;
export const MAX_WEEKS = 8;
export const MIN_DAYS = 2;
export const MAX_DAYS = 6;

/** How many exercises one day may prescribe — lower than a session's cap. */
export const MAX_PLANNED_PER_DAY = 20;

/** Sets on one planned exercise. The stepper stops here rather than at the API's. */
export const MAX_SETS = 60;

/** What a new day is called before it is named: its position, as in the logger. */
export const DEFAULT_DAY_LABELS = ['Day 1', 'Day 2', 'Day 3', 'Day 4', 'Day 5', 'Day 6'];

/** Longest a block name may be — the length its `maxLength` field stops at. */
export const MAX_NAME = 80;
