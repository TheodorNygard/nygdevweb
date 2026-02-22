// Constants
const FOUNDRY_URL = 'https://rpg.nygard.dev';
const WEBHOOK_URL = 'https://prod-19.norwayeast.logic.azure.com:443/workflows/22fe1114d4e84963912784519f33e676/triggers/POST/paths/invoke?api-version=2016-10-01&sp=%2Ftriggers%2FPOST%2Frun&sv=1.0&sig=8LHefy-KqDqf-rEYoNhagAdIMd4Ui0UBKgOwZWbTmN0';
const CHECK_TIMEOUT = 3000;       // 3 seconds for status check
const POLLING_INTERVAL = 5000;   // 5 seconds between server startup checks
const PERIODIC_CHECK = 300000;    // 5 minutes for regular status checks
const MAX_STARTUP_WAIT = 600000;  // 10 minutes maximum wait time

// DOM elements
const themeToggle = document.getElementById('themeToggle');
const themeIcon = themeToggle.querySelector('use');
const themeColorMeta = document.querySelector('meta[name="theme-color"]');
const foundryButton = document.getElementById('foundryButton');
const buttonText = document.getElementById('buttonText');
const statusIndicator = document.querySelector('.status-indicator');
const statusDiv = document.getElementById('status');

// Track active startup polling interval to prevent duplicates
let activePollingInterval = null;

// Set current year
document.getElementById('year').textContent = new Date().getFullYear();

// Fetch with timeout
async function fetchWithTimeout(url, options = {}, timeout = CHECK_TIMEOUT) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        return response;
    } catch (error) {
        clearTimeout(timeoutId);
        throw error;
    }
}

// Theme switcher
function setThemeColor(dark) {
    themeColorMeta.setAttribute('content', dark ? '#121212' : '#f8f9fa');
}

function initTheme() {
    const prefersDarkScheme = window.matchMedia('(prefers-color-scheme: dark)');
    const currentTheme = localStorage.getItem('theme');
    const dark = currentTheme === 'dark' || (!currentTheme && prefersDarkScheme.matches);

    if (dark) {
        document.body.setAttribute('data-theme', 'dark');
        themeIcon.setAttribute('href', '#sun-icon');
    }
    setThemeColor(dark);
}

themeToggle.addEventListener('click', () => {
    let theme;

    if (document.body.getAttribute('data-theme') === 'dark') {
        document.body.removeAttribute('data-theme');
        themeIcon.setAttribute('href', '#moon-icon');
        theme = 'light';
    } else {
        document.body.setAttribute('data-theme', 'dark');
        themeIcon.setAttribute('href', '#sun-icon');
        theme = 'dark';
    }

    setThemeColor(theme === 'dark');
    localStorage.setItem('theme', theme);
}, {passive: true});

// Check if Foundry server is online
async function checkFoundryStatus() {
    statusIndicator.className = 'status-indicator status-checking';
    buttonText.textContent = 'Checking status...';

    try {
        await fetchWithTimeout(FOUNDRY_URL, {
            method: 'HEAD',
            mode: 'no-cors'
        });

        // Server is online
        setFoundryOnline();
    } catch (error) {
        // Server is offline
        setFoundryOffline();
    }
}

// Set button to "online" state
function setFoundryOnline() {
    statusIndicator.className = 'status-indicator status-online';
    buttonText.textContent = 'Go to Foundry RPG';
    foundryButton.onclick = () => window.open(FOUNDRY_URL, '_blank');
    statusDiv.textContent = 'Foundry server is online';
    statusDiv.className = 'status success';
    foundryButton.classList.remove('loading');
    foundryButton.disabled = false;
}

// Set button to "offline" state
function setFoundryOffline() {
    statusIndicator.className = 'status-indicator status-offline';
    buttonText.textContent = 'Start Foundry Server';
    foundryButton.onclick = startFoundryServer;
    statusDiv.textContent = 'Foundry server is offline';
    statusDiv.className = 'status error';
    foundryButton.classList.remove('loading');
    foundryButton.disabled = false;
}

// Start the Foundry server via webhook
function startFoundryServer() {
    foundryButton.classList.add('loading');
    foundryButton.disabled = true;
    statusDiv.textContent = 'Starting server...';
    statusDiv.className = 'status';

    fetchWithTimeout(WEBHOOK_URL, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ message: 'Webhook triggered' }),
        mode: 'no-cors'
    })
    .then(() => {
        statusDiv.textContent = 'Server starting! It will be ready in a few minutes.';
        statusDiv.classList.add('success');
        startPollingForServerStart();
    })
    .catch(() => {
        statusDiv.textContent = 'Error starting server. Please try again.';
        statusDiv.classList.add('error');
        foundryButton.classList.remove('loading');
        foundryButton.disabled = false;
    });
}

// Poll to check if server is up
function startPollingForServerStart() {
    statusIndicator.className = 'status-indicator status-checking';
    buttonText.textContent = 'Server starting...';

    let pollingCount = 0;
    const maxPolls = Math.ceil(MAX_STARTUP_WAIT / POLLING_INTERVAL);

    // Remove loading spinner but keep button disabled for better UX
    setTimeout(() => {
        foundryButton.classList.remove('loading');
        foundryButton.disabled = false;
    }, 3000);

    // Clear any existing polling loop before starting a new one
    if (activePollingInterval !== null) {
        clearInterval(activePollingInterval);
    }

    // Check every 5 seconds
    activePollingInterval = setInterval(() => {
        pollingCount++;

        fetchWithTimeout(FOUNDRY_URL, {
            method: 'HEAD',
            mode: 'no-cors'
        })
        .then(() => {
            // Got a response - but nginx can reply before Foundry is ready.
            // Confirm with a second check before declaring online.
            clearInterval(activePollingInterval);
            activePollingInterval = null;
            statusIndicator.className = 'status-indicator status-checking';
            buttonText.textContent = 'Almost ready...';
            setTimeout(() => {
                fetchWithTimeout(FOUNDRY_URL, { method: 'HEAD', mode: 'no-cors' })
                    .then(() => setFoundryOnline())
                    .catch(() => {
                        // Still not truly ready - resume polling
                        startPollingForServerStart();
                    });
            }, 8000);
        })
        .catch(() => {
            // Server still starting
            if (pollingCount >= maxPolls) {
                clearInterval(activePollingInterval);
                activePollingInterval = null;
                statusDiv.textContent = 'Server might be taking longer than expected. Try refreshing.';
                setFoundryOffline();
            }
        });
    }, POLLING_INTERVAL);
}

// Initialize
function init() {
    initTheme();
    checkFoundryStatus();
    setInterval(checkFoundryStatus, PERIODIC_CHECK);
}

window.addEventListener('load', init, {passive: true});
