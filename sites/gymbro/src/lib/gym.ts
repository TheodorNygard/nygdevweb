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
 * client, the MSAL configuration and the two hooks that drive them. What is
 * not, and should not be, is anything that draws — the two apps share a
 * contract, not a design, and a component from over there would be a phone
 * layout inside a desktop one.
 *
 * The one module deliberately **not** shared is `src/auth.ts`, which is a build
 * entry rather than a library; see the comment in this site's copy.
 */

export {
    API_BASE,
    API_SCOPE,
    AUTHORITY,
    CLIENT_ID,
    EXERCISE_LIBRARY_URL,
    LOGIN_SCOPES,
    POST_LOGOUT_REDIRECT_URI,
    REDIRECT_URI,
} from '@gym/lib/config';

export { ApiError, GymApi, NetworkError } from '@gym/lib/api';

export { describeAuthError, type AuthErrorDetail } from '@gym/lib/errors';

export { getMsalInstance, REDIRECT_HANDLING } from '@gym/lib/msal';

export { equipmentFor, loadLibrary } from '@gym/lib/library';

export { useAuth, type AuthActions, type AuthState } from '@gym/hooks/useAuth';

export { useLibrary } from '@gym/hooks/useLibrary';

export { useResource, type Resource } from '@gym/hooks/useResource';

export {
    currentWeek,
    dayLabel,
    isRestWeek,
    progressOf,
    repsInTank,
    sessionsFor,
    setsForWeek,
} from '@gym/lib/block';

export { kg, num, rpeLabel, sessionDateLabel, tankLabel } from '@gym/lib/format';

export type {
    CurrentBlock,
    DayInput,
    ExerciseLibrary,
    Mesocycle,
    MesocycleSummary,
    PlannedExercise,
    SessionEntry,
    SessionSummary,
    Workout,
    WorkSet,
} from '@gym/lib/types';
