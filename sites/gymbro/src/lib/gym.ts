/**
 * The logger's domain layer, re-exported under one name.
 *
 * gym.nygard.dev and this site are two front ends onto one API, signing in as
 * one Entra registration. The wire shapes, the block maths and the MSAL wiring
 * are therefore facts about that API rather than about either app, and they
 * live once — in `sites/gym/src/lib`, read from here through the `@gym` alias
 * declared in `vite.config.ts` and `tsconfig.app.json`.
 *
 * A second transcription is the thing being avoided. `lib/types.ts` over there
 * opens by saying it is written as the API answers rather than as the screens
 * want, so a change on the wire shows up as a type error; two copies of it
 * would turn that into a type error in one app and a wrong value in the other.
 *
 * What is imported is infrastructure: types, arithmetic, formatting, the fetch
 * client and the hooks that drive them, MSAL's among them. What is not, and
 * should not be, is anything that draws — the two apps share a contract, not a
 * design, and a component from over there would be a phone layout inside a
 * desktop one. Only what this site uses is re-exported, so the list below is
 * also the whole of what it leans on.
 *
 * The one module deliberately **not** shared is `src/auth.ts`, which is a build
 * entry rather than a library; see the comment in this site's copy.
 */

export { GymApi, messageOf } from '@gym/lib/api';

export { type AuthErrorDetail } from '@gym/lib/errors';

export { equipmentFor } from '@gym/lib/library';

export { useAuth } from '@gym/hooks/useAuth';

export { useHistory } from '@gym/hooks/useHistory';

export { useLibrary } from '@gym/hooks/useLibrary';

export { useTheme } from '@gym/hooks/useTheme';

export { applyTheme, readTheme, THEMES, type Theme } from '@gym/lib/theme';

export { useResource, type Resource } from '@gym/hooks/useResource';

export {
    currentWeek,
    daysForWeek,
    isRestWeek,
    progressOf,
    repsInTank,
    setsForWeek,
} from '@gym/lib/block';

export { kg, num, rpeLabel, sessionDateLabel } from '@gym/lib/format';

export type {
    DayInput,
    ExerciseLibrary,
    MesocycleSummary,
    SessionDetail,
    SessionSummary,
} from '@gym/lib/types';
