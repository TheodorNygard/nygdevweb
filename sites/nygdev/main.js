const FOUNDRY_URL = 'https://rpg.nygard.dev';
const WEBHOOK_URL = 'https://prod-19.norwayeast.logic.azure.com:443/workflows/22fe1114d4e84963912784519f33e676/triggers/POST/paths/invoke?api-version=2016-10-01&sp=%2Ftriggers%2FPOST%2Frun&sv=1.0&sig=8LHefy-KqDqf-rEYoNhagAdIMd4Ui0UBKgOwZWbTmN0';
const CHECK_TIMEOUT = 3000;        // per status request
const POLLING_INTERVAL = 5000;     // between startup checks
const PERIODIC_CHECK = 300000;     // between idle status checks
const MAX_STARTUP_WAIT = 600000;   // total budget for a start, from the click
const SETTLE_DELAY = 8000;         // nginx answers before Foundry is ready
const SPINNER_HOLD = 3000;         // spinner comes off, the wait carries on

// DOM elements
const themeToggle = document.getElementById('themeToggle');
const themeIcon = themeToggle.querySelector('use');
const themeColorMeta = document.querySelector('meta[name="theme-color"]');
const foundryButton = document.getElementById('foundryButton');
const buttonText = document.getElementById('buttonText');
const statusDiv = document.getElementById('status');

// True from the webhook call until the server answers or the budget runs out,
// including the pause between the two confirmation pings. The periodic check
// stands down while it is set, so a routine poll cannot overwrite
// "Server starting..." with "offline" halfway through a start.
let awaitingStart = false;
let pollTimer = null;

document.getElementById('year').textContent = new Date().getFullYear();

function ping() {
    return fetch(FOUNDRY_URL, {
        method: 'HEAD',
        mode: 'no-cors',
        signal: AbortSignal.timeout(CHECK_TIMEOUT)
    });
}

// data-theme lives on <html> so `color-scheme` reaches the page canvas, which
// themes the scrollbars and native form controls.
function applyTheme(dark) {
    if (dark) {
        document.documentElement.setAttribute('data-theme', 'dark');
    } else {
        document.documentElement.removeAttribute('data-theme');
    }
    themeIcon.setAttribute('href', dark ? '#sun-icon' : '#moon-icon');
    themeToggle.setAttribute('aria-pressed', String(dark));
    themeColorMeta.setAttribute('content', dark ? '#121212' : '#f8f9fa');
}

function initTheme() {
    const stored = localStorage.getItem('theme');

    applyTheme(stored === 'dark'
        || (!stored && window.matchMedia('(prefers-color-scheme: dark)').matches));
}

themeToggle.addEventListener('click', () => {
    const dark = document.documentElement.getAttribute('data-theme') !== 'dark';

    applyTheme(dark);
    localStorage.setItem('theme', dark ? 'dark' : 'light');
}, {passive: true});

// The die is the status light: rolling while checking, green online, red offline.
function setDiceState(state) {
    foundryButton.classList.remove('is-checking', 'is-online', 'is-offline');
    foundryButton.classList.add(state);
}

function setStatus(message, kind = '') {
    statusDiv.textContent = message;
    statusDiv.className = kind ? `status ${kind}` : 'status';
}

// The two resting states. Both clear the message line, which carries start and
// error notices only, and end any start in progress.
function settle(state, label, onClick) {
    awaitingStart = false;
    stopPolling();
    setDiceState(state);
    buttonText.textContent = label;
    foundryButton.onclick = onClick;
    foundryButton.classList.remove('loading');
    foundryButton.disabled = false;
    setStatus('');
}

function setFoundryOnline() {
    settle('is-online', 'Go to Foundry RPG', () => window.open(FOUNDRY_URL, '_blank'));
}

function setFoundryOffline() {
    settle('is-offline', 'Start Foundry Server', startFoundryServer);
}

function stopPolling() {
    clearInterval(pollTimer);
    pollTimer = null;
}

async function checkFoundryStatus() {
    // A start is already being waited out, and its own loop owns the button.
    if (awaitingStart) {
        return;
    }
    setDiceState('is-checking');
    buttonText.textContent = 'Checking status...';

    try {
        await ping();
        setFoundryOnline();
    } catch {
        setFoundryOffline();
    }
}

function startFoundryServer() {
    foundryButton.classList.add('loading');
    foundryButton.disabled = true;
    setStatus('Starting server...');

    fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({message: 'Webhook triggered'}),
        mode: 'no-cors',
        signal: AbortSignal.timeout(CHECK_TIMEOUT)
    })
    .then(() => {
        setStatus('Server starting! It will be ready in a few minutes.', 'success');
        awaitingStart = true;
        pollForServerStart(Date.now() + MAX_STARTUP_WAIT);
    })
    .catch(() => {
        setStatus('Error starting server. Please try again.', 'error');
        foundryButton.classList.remove('loading');
        foundryButton.disabled = false;
    });
}

// Wait for the server to come up. The deadline is carried through rather than
// recomputed, so the confirmation step below can restart the loop without
// extending the budget past MAX_STARTUP_WAIT.
function pollForServerStart(deadline) {
    stopPolling();
    setDiceState('is-checking');
    buttonText.textContent = 'Server starting...';

    // The spinner comes off early — the button stays usable while the wait
    // carries on in the background.
    setTimeout(() => {
        foundryButton.classList.remove('loading');
        foundryButton.disabled = false;
    }, SPINNER_HOLD);

    const giveUp = () => {
        setFoundryOffline();
        setStatus('Server might be taking longer than expected. Try refreshing.', 'error');
    };

    pollTimer = setInterval(() => {
        ping().then(() => {
            // nginx can answer before Foundry itself is ready, so a first
            // response only earns a second check.
            stopPolling();
            setDiceState('is-checking');
            buttonText.textContent = 'Almost ready...';
            setTimeout(() => {
                ping()
                    .then(setFoundryOnline)
                    .catch(() => (Date.now() < deadline ? pollForServerStart(deadline) : giveUp()));
            }, SETTLE_DELAY);
        }).catch(() => {
            if (Date.now() >= deadline) {
                giveUp();
            }
        });
    }, POLLING_INTERVAL);
}

// The script is deferred, so the DOM is ready and the theme lands before first
// paint rather than after every image has loaded.
initTheme();
checkFoundryStatus();
setInterval(checkFoundryStatus, PERIODIC_CHECK);
