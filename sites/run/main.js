// Constants
// The function app endpoint returning the spot read as JSON.
// Three places have to agree on this origin, or the call fails in the browser:
//   1. this constant
//   2. connect-src in staticwebapp.config.json (else the CSP blocks it)
//   3. the function app's CORS allowed origins (must list https://run.nygard.dev)
const SPOT_URL = 'https://REPLACE-ME.azurewebsites.net/api/spot';
const REQUEST_TIMEOUT = 10000;  // 10 seconds

// DOM elements
const themeToggle = document.getElementById('themeToggle');
const themeIcon = themeToggle.querySelector('use');
const themeColorMeta = document.querySelector('meta[name="theme-color"]');
const spotButton = document.getElementById('spotButton');
const buttonText = document.getElementById('buttonText');
const statusDiv = document.getElementById('status');
const resultBox = document.getElementById('result');

// Set current year
document.getElementById('year').textContent = new Date().getFullYear();

// Theme switcher
function setThemeColor(dark) {
    themeColorMeta.setAttribute('content', dark ? '#121212' : '#f8f9fa');
}

// data-theme lives on <html> so `color-scheme` reaches the page canvas,
// which is what themes the scrollbars and native form controls.
function applyTheme(dark) {
    if (dark) {
        document.documentElement.setAttribute('data-theme', 'dark');
    } else {
        document.documentElement.removeAttribute('data-theme');
    }
    themeIcon.setAttribute('href', dark ? '#sun-icon' : '#moon-icon');
    themeToggle.setAttribute('aria-pressed', String(dark));
    setThemeColor(dark);
}

function initTheme() {
    const prefersDarkScheme = window.matchMedia('(prefers-color-scheme: dark)');
    const currentTheme = localStorage.getItem('theme');

    applyTheme(currentTheme === 'dark' || (!currentTheme && prefersDarkScheme.matches));
}

themeToggle.addEventListener('click', () => {
    const dark = document.documentElement.getAttribute('data-theme') !== 'dark';

    applyTheme(dark);
    localStorage.setItem('theme', dark ? 'dark' : 'light');
}, {passive: true});

// Status line
function setStatus(message, kind = '') {
    statusDiv.textContent = message;
    statusDiv.className = kind ? `status ${kind}` : 'status';
}

// Render into textContent, never innerHTML: the payload is remote and is shown
// verbatim, so it must never be parsed as markup.
function showBody(text) {
    resultBox.textContent = text;
}

function setBusy(busy) {
    spotButton.disabled = busy;
    spotButton.classList.toggle('loading', busy);
    spotButton.setAttribute('aria-busy', String(busy));
    buttonText.textContent = busy ? 'Reading...' : 'Get spot read';
}

// Turn a fetch rejection into something a human can act on. A blocked CORS
// preflight and a CSP violation both surface as a bare TypeError, so they can
// only be reported together.
function describeFailure(error) {
    if (error.name === 'TimeoutError') {
        return `No response within ${REQUEST_TIMEOUT / 1000}s.`;
    }
    if (error.name === 'AbortError') {
        return 'Request cancelled.';
    }
    if (error instanceof TypeError) {
        return 'Could not reach the function — network, CORS, or CSP.';
    }
    return error.message || 'Request failed.';
}

// Fetch the spot read and show whatever came back
async function getSpotRead() {
    setBusy(true);
    setStatus('Reading...');
    showBody('');

    try {
        const response = await fetch(SPOT_URL, {
            headers: {'Accept': 'application/json'},
            signal: AbortSignal.timeout(REQUEST_TIMEOUT)
        });

        // Read the body either way: a failing function usually explains itself
        // in the body, and that is more useful than the bare status code.
        const body = await response.text();
        let parsed;
        let isJson = true;

        try {
            parsed = JSON.parse(body);
        } catch {
            // Not JSON — fall through and show the raw text.
            isJson = false;
        }

        showBody(isJson ? JSON.stringify(parsed, null, 2) : body);

        if (!response.ok) {
            setStatus(`Function returned ${response.status} ${response.statusText}`.trim(), 'error');
            return;
        }

        if (!isJson) {
            setStatus('Response was not JSON', 'error');
            return;
        }

        setStatus(`Read at ${new Date().toLocaleTimeString()}`, 'success');
    } catch (error) {
        setStatus(describeFailure(error), 'error');
    } finally {
        setBusy(false);
    }
}

spotButton.addEventListener('click', getSpotRead);

// Initialize
// The script is deferred, so the DOM is ready and the theme can be applied
// before first paint instead of after every image has finished loading.
initTheme();
