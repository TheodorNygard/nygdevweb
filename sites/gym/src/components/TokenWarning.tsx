import { Icon } from './Icons';

// The page prints bearer tokens in full. That is the point of it, and also the
// one thing a visitor should be told without having to ask.
export function TokenWarning() {
    return (
        <div className="warning">
            <Icon name="alert" />
            <p>
                Everything below is a live credential. A token shown here can be
                replayed by anyone who reads it, right up until it expires — so
                treat a screenshot of this page the way you would treat a
                password. Tokens are held in <code>sessionStorage</code> and go
                away when the tab closes; nothing is sent anywhere but Entra ID.
            </p>
        </div>
    );
}
