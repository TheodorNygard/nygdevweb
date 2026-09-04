import { TEMPLATE_LIBRARY_URL } from './config';
import type { DayTemplate, PlannedExercise, TemplateLibrary } from './types';

/**
 * The built-in day templates, fetched anonymously from the CDN rather than the
 * API: they are identical for every user, so they cost no function invocation,
 * no token and no RU. The blob carries `Cache-Control: public, max-age=86400`,
 * so this only avoids asking for it twice in one page load.
 */
let pending: Promise<DayTemplate[]> | null = null;

/**
 * There is no bundled fallback here, unlike `lib/library`, and the difference
 * is deliberate.
 *
 * A picker with no exercises in it blocks logging, and logging happens in a
 * basement with no signal — so the exercise library ships a copy of itself in
 * the bundle rather than let that happen. Planning is not that: it happens at a
 * desk, and a day with no template offered is still a day you can plan by hand
 * in the same sheet. So the offline answer here is an empty list and a picker
 * that says so, rather than a second copy of a shipped file that can drift from
 * the one on the CDN without anything noticing.
 */
const NONE: DayTemplate[] = [];

function isTemplate(value: unknown): value is DayTemplate {
    if (typeof value !== 'object' || value === null) return false;

    const raw = value as Record<string, unknown>;

    return typeof raw['id'] === 'string'
        && typeof raw['name'] === 'string'
        && Array.isArray(raw['plan']);
}

function isLibrary(value: unknown): value is TemplateLibrary {
    if (typeof value !== 'object' || value === null) return false;

    const raw = value as Record<string, unknown>;

    return Array.isArray(raw['templates']) && raw['templates'].every(isTemplate);
}

export function loadTemplates(): Promise<DayTemplate[]> {
    pending ??= (async () => {
        try {
            // No Authorization header, deliberately: one would turn a simple
            // cross-origin GET into a preflight the blob endpoint has no CORS
            // rule for, and the file needs no token.
            const response = await fetch(TEMPLATE_LIBRARY_URL, { credentials: 'omit' });

            if (!response.ok) return NONE;

            const payload: unknown = await response.json();

            return isLibrary(payload) ? payload.templates : NONE;
        } catch {
            // Offline, or no CORS rule for this origin — indistinguishable, and
            // either way the sheet still plans days by hand.
            return NONE;
        }
    })();

    return pending;
}

/** How many sets a template prescribes in total — the second half of its row. */
export function setsIn(plan: PlannedExercise[]): number {
    return plan.reduce((total, exercise) => total + exercise.sets, 0);
}
