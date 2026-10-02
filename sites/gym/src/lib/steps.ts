// The numbers a set is composed from, shared by the logger and the sheet that
// corrects a logged set — one control, used in two places, has to step and
// stop the same way in both.

/** The design's steps: 2.5 kg of weight, one rep, half a point of RPE. */
export const WEIGHT_STEP = 2.5;
export const REP_STEP = 1;
export const RPE_MIN = 5;
export const RPE_MAX = 10;

/** The API's bounds, so a typed number cannot compose a set it would refuse. */
export const MAX_WEIGHT_KG = 1000;
export const MAX_REPS = 200;

/** A typed number, held inside the bounds the API would accept. */
export function clamp(value: number, low: number, high: number): number {
    return Math.min(high, Math.max(low, value));
}
