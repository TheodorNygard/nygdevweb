import { Icon } from './Icons';
import type { Theme } from '../hooks/useTheme';

interface MastheadProps {
    subtitle: string;
    signedIn: boolean;
    signingIn: boolean;
    disabled: boolean;
    theme: Theme;
    onSignIn: () => void;
    onSignOut: () => void;
    onToggleTheme: () => void;
}

export function Masthead(props: MastheadProps) {
    const { theme, signedIn, signingIn, disabled } = props;

    return (
        <header className="masthead">
            <div>
                <h1>Token inspector</h1>
                <span className="underline" />
                <p className="subtitle">{props.subtitle}</p>
            </div>

            <div className="controls">
                <button
                    className={`button${signingIn ? ' loading' : ''}`}
                    type="button"
                    onClick={props.onSignIn}
                    disabled={disabled || signingIn}
                >
                    <span className="spinner" />
                    <Icon name="key" />
                    <span>{signedIn ? 'Switch account' : 'Sign in'}</span>
                </button>

                {signedIn ? (
                    <button className="button secondary" type="button" onClick={props.onSignOut}>
                        <Icon name="signout" />
                        <span>Sign out</span>
                    </button>
                ) : null}

                <button
                    className="theme-switch"
                    type="button"
                    aria-label="Toggle dark mode"
                    aria-pressed={theme === 'dark'}
                    onClick={props.onToggleTheme}
                >
                    <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
                </button>
            </div>
        </header>
    );
}
