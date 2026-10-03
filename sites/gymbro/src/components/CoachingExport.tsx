import { useEffect, useState } from 'react';

import { type ProfileState } from '../hooks/useProfile';
import { coachingExport, coachingFilename, type CoachingInput } from '../lib/coaching';
import { num, type LifterProfile } from '../lib/gym';
import { ProfileModal } from './ProfileModal';

interface CoachingExportProps {
    /** What to export, or null while the block's sets are still being read. */
    input: CoachingInput | null;

    /** The lifter's profile, which the export's *Goals and context* opens on. */
    profile: ProfileState;
}

/** How long "Copied" stays on the button before it goes back to saying what it does. */
const CONFIRM_MS = 2500;

/** `Intermediate · 82 kg · goal set · injuries noted`, or null for an empty profile. */
function profileSummary(profile: LifterProfile): string | null {
    const parts: string[] = [];

    if (profile.experience) {
        parts.push(profile.experience.charAt(0).toUpperCase() + profile.experience.slice(1));
    }

    if (profile.bodyweightKg !== undefined) parts.push(`${num(profile.bodyweightKg)} kg`);
    if (profile.goal) parts.push('goal set');
    if (profile.injuries) parts.push('injuries noted');

    return parts.length === 0 ? null : parts.join(' · ');
}

/**
 * The block, written out for a coaching conversation — copied, or saved as a
 * Markdown file. See `coachingExport` for what is in it and why it is shaped
 * the way it is.
 *
 * Built on the click rather than on every render: it walks every set in the
 * block, and nothing on screen shows it.
 *
 * Copy is the first button because a chat is where this goes; the file is for
 * a coach who takes attachments, or for keeping. Nothing leaves the browser
 * until the person pastes or attaches it themselves.
 *
 * The profile sits under the buttons because it is read in exactly one place —
 * the export's closing section — and this is where somebody notices that
 * section is empty.
 */
export function CoachingExport({ input, profile }: CoachingExportProps) {
    const [copied, setCopied] = useState<'yes' | 'failed' | null>(null);
    const [editing, setEditing] = useState(false);

    useEffect(() => {
        if (copied === null) return;

        const timer = window.setTimeout(() => setCopied(null), CONFIRM_MS);

        return () => window.clearTimeout(timer);
    }, [copied]);

    function build(): { text: string; name: string } | null {
        if (!input) return null;

        return {
            text: coachingExport(input),
            name: coachingFilename(input.block, input.exportedOn),
        };
    }

    async function copy() {
        const built = build();

        if (!built) return;

        try {
            await navigator.clipboard.writeText(built.text);
            setCopied('yes');
        } catch {
            // Refused — a browser that wants a permission it was not given, or
            // a document that lost focus mid-click. The download still works.
            setCopied('failed');
        }
    }

    function download() {
        const built = build();

        if (!built) return;

        const url = URL.createObjectURL(new Blob([built.text], { type: 'text/markdown;charset=utf-8' }));
        const link = document.createElement('a');

        link.href = url;
        link.download = built.name;
        link.click();

        // After the click has handed the URL to the download, not before.
        window.setTimeout(() => URL.revokeObjectURL(url), 0);
    }

    const summary = profileSummary(profile.profile);

    return (
        <div className="coach">
            <span className="stats__list-label">FOR A COACH</span>
            <p className="coach__note">
                The whole block — plan, weekly targets, every set — as Markdown that explains
                itself, to paste into a conversation with a coach or an AI.
            </p>
            <div className="coach__buttons">
                <button type="button" className="primary" onClick={() => { void copy(); }} disabled={!input}>
                    {copied === 'yes' ? 'Copied' : copied === 'failed' ? 'Copy refused' : 'Copy'}
                </button>
                <button
                    type="button"
                    className="ghost"
                    onClick={download}
                    disabled={!input}
                    aria-label="Download as a Markdown file"
                    title="A .md file, named after the block and today's date"
                >
                    Download
                </button>
            </div>
            <div className="coach__profile">
                <span className="coach__profile-text">
                    {summary ?? 'No profile yet — the export’s Goals and context stays blank.'}
                </span>
                <button
                    type="button"
                    className="coach__profile-edit"
                    onClick={() => setEditing(true)}
                    title="Experience, bodyweight, goal and injuries, for the export's Goals and context"
                >
                    {summary ? 'Edit profile' : 'Add profile'}
                </button>
            </div>

            {editing ? (
                <ProfileModal
                    initial={profile.profile}
                    busy={profile.busy}
                    error={profile.error}
                    onSave={profile.save}
                    onClose={() => setEditing(false)}
                />
            ) : null}
        </div>
    );
}
