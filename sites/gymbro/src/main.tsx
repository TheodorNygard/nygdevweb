import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import { applyTheme, readTheme } from './lib/gym';
import './styles.css';

// Before anything renders, so the first paint is already in the chosen theme.
// The CSP admits no inline script in index.html, and this runs before the root
// is populated, which is as early as the page has anything to paint.
applyTheme(readTheme());

const container = document.getElementById('root');

if (!container) throw new Error('#root is missing from index.html');

createRoot(container).render(
    <StrictMode>
        <App />
    </StrictMode>,
);
