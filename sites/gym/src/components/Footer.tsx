import { version as msalVersion } from '@azure/msal-browser';

export function Footer() {
    return (
        <footer className="footer">
            <span>{new Date().getFullYear()} Theodor</span>
            <a href="https://nygard.dev">nygard.dev</a>
            <span className="mono">msal-browser {msalVersion}</span>
        </footer>
    );
}
