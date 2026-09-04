import { useCallback, useEffect, useState } from 'react';

import type { GymApi } from '../lib/api';
import { loadTemplates } from '../lib/templates';
import type { DayTemplate, PlannedExercise } from '../lib/types';

export interface TemplatesState {
    /** The ones that shipped, from the CDN. Empty offline. */
    builtIn: DayTemplate[];

    /** The user's own, newest first. */
    saved: DayTemplate[];

    loading: boolean;

    /** A write that is in flight — the sheet disables its buttons on it. */
    busy: boolean;

    /**
     * The API's own message, shown in the sheet rather than in the app-wide
     * banner. A template list that will not load is worth saying inside the
     * screen that wanted it; it is not worth a banner over Today, because
     * nothing else in the app depends on it.
     */
    error: string | null;

    save: (name: string, plan: PlannedExercise[]) => Promise<void>;
    replace: (templateId: string, name: string, plan: PlannedExercise[]) => Promise<void>;
    remove: (templateId: string) => Promise<void>;
}

const NONE: DayTemplate[] = [];

/**
 * The two halves of the template picker: what shipped, and what the user saved.
 *
 * They are fetched from different places for the reason `lib/templates` and
 * `cdn.tf` both give — the built-in list is identical for everybody, so it is a
 * blob, and only the saved half needs a token. They are kept apart here rather
 * than concatenated because only one of them can be edited, and the sheet has
 * to know which row it is looking at.
 *
 * Writes update the local list from what the API answers with rather than
 * refetching. Every one of these calls returns the document it just wrote, so a
 * reload would be a round trip to be told what we were already holding.
 *
 * Not folded into `useBlock`: this is read by one sheet on one tab, and
 * `useBlock` reloads after every submitted session.
 */
export function useTemplates(api: GymApi | null): TemplatesState {
    const [builtIn, setBuiltIn] = useState<DayTemplate[]>(NONE);
    const [saved, setSaved] = useState<DayTemplate[]>(NONE);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;

        void loadTemplates().then((loaded) => {
            if (!cancelled) setBuiltIn(loaded);
        });

        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        if (!api) return;

        let cancelled = false;

        setLoading(true);

        void (async () => {
            try {
                const loaded = await api.templates();

                if (cancelled) return;

                setSaved(loaded);
                setError(null);
            } catch (cause) {
                if (cancelled) return;

                // The API writes its `message` to be shown as-is, which is why
                // it is not reworded here.
                setError(cause instanceof Error ? cause.message : String(cause));
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => { cancelled = true; };
    }, [api]);

    /**
     * One write, with the busy flag and the error around it. Every caller below
     * is the same three lines otherwise, and a failure has to leave the list
     * exactly as it was — which is why nothing here is optimistic.
     */
    const write = useCallback(async (action: () => Promise<void>) => {
        setBusy(true);

        try {
            await action();
            setError(null);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : String(cause));
        } finally {
            setBusy(false);
        }
    }, []);

    const save = useCallback(async (name: string, plan: PlannedExercise[]) => {
        if (!api) return;

        await write(async () => {
            const template = await api.saveTemplate(name, plan);

            // Newest first, matching the order the API lists them in — a ULID
            // id sorts that way, so a fresh save belongs at the front.
            setSaved((current) => [template, ...current]);
        });
    }, [api, write]);

    const replace = useCallback(async (
        templateId: string,
        name: string,
        plan: PlannedExercise[],
    ) => {
        if (!api) return;

        await write(async () => {
            const template = await api.replaceTemplate(templateId, name, plan);

            // In place: re-saving is not a new template, so it keeps its
            // position in the list as well as its id.
            setSaved((current) => current.map((existing) => (
                existing.id === templateId ? template : existing
            )));
        });
    }, [api, write]);

    const remove = useCallback(async (templateId: string) => {
        if (!api) return;

        await write(async () => {
            await api.deleteTemplate(templateId);

            setSaved((current) => current.filter((existing) => existing.id !== templateId));
        });
    }, [api, write]);

    return { builtIn, saved, loading, busy, error, save, replace, remove };
}
