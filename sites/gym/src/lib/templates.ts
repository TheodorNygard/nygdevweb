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
 *
 * The cost of that choice is what `warn` below is for, and it is the only
 * `console` call in this app. A library that fails to load looks fine — the
 * bundled copy stands in — but a template list that fails to load looks like a
 * feature that shipped empty, which is indistinguishable on screen from a CDN
 * file that is genuinely there and genuinely empty. The first time this
 * happened it was a blob uploaded under the wrong name, and nothing anywhere
 * said so. Now it does.
 */
const NONE: DayTemplate[] = [];

/**
 * Says why the list is empty, in the one place a developer will look. Not shown
 * to the user: the sheet's empty state does that, and deliberately without
 * naming a cause it cannot know.
 */
function warn(why: string): DayTemplate[] {
    console.warn(`The built-in day templates did not load from ${TEMPLATE_LIBRARY_URL} — ${why}. The template picker shows only your own saved templates until this is fixed.`);

    return NONE;
}

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

            if (!response.ok) {
                // A 404 here is the blob published under a name this does not
                // ask for — the file is `gym-templates.json`, prefixed like
                // `gym-exercises.json` beside it, because the `data` container
                // is shared with the running dashboard's feed.
                return warn(`the CDN answered ${response.status}`);
            }

            const payload: unknown = await response.json();

            return isLibrary(payload)
                ? payload.templates
                : warn('the file is not a {version, templates} document');
        } catch (cause) {
            // Offline, or no CORS rule for this origin — indistinguishable from
            // here, and either way the sheet still plans days by hand.
            return warn(`the fetch itself failed (${String(cause)})`);
        }
    })();

    return pending;
}

/** How many sets a template prescribes in total — the second half of its row. */
export function setsIn(plan: PlannedExercise[]): number {
    return plan.reduce((total, exercise) => total + exercise.sets, 0);
}
