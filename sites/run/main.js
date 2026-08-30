// run.nygard.dev — marathon prep dashboard.
//
// The page reads one precomputed JSON blob and draws it. There is no function
// app in the path any more: the build job writes the feed to public blob
// storage and this is a plain cross-origin GET of a static file.
//
// Two places have to agree on the feed's origin, or the browser blocks it:
//   1. FEED_URL below
//   2. connect-src in staticwebapp.config.json
// and the storage account needs a CORS rule allowing https://run.nygard.dev,
// because a blob without one returns no Access-Control-Allow-Origin and the
// browser drops the response. See the README.
const FEED_URL = 'https://nygdevcdn.blob.core.windows.net/data/marathonprep.json';
const REQUEST_TIMEOUT = 10000;  // 10 seconds

// Reference marks. These are conventions, not data — they are always shown
// next to the number they qualify so nothing reads as a measured value.
const MARATHON_KM = 42.195;
const EASY_SHARE_TARGET = 0.8;   // the 80/20 split easy training aims at
const ACWR_SWEET_LOW = 0.8;
const ACWR_SWEET_HIGH = 1.3;

const RUN_TYPE_ORDER = ['easy', 'moderate', 'threshold', 'hard', 'long'];

// DOM elements
const themeToggle = document.getElementById('themeToggle');
const themeIcon = themeToggle.querySelector('use');
const themeColorMeta = document.querySelector('meta[name="theme-color"]');
const refreshButton = document.getElementById('refreshButton');
const refreshText = document.getElementById('refreshText');
const statusEl = document.getElementById('status');
const asOfEl = document.getElementById('asOf');
const dashboardEl = document.getElementById('dashboard');
const kpisEl = document.getElementById('kpis');
const cardsEl = document.getElementById('cards');
const loadErrorEl = document.getElementById('loadError');
const loadErrorDetail = document.getElementById('loadErrorDetail');
const loadErrorUrl = document.getElementById('loadErrorUrl');
const tooltipEl = document.getElementById('tooltip');
const feedLink = document.getElementById('feedLink');

document.getElementById('year').textContent = new Date().getFullYear();
loadErrorUrl.textContent = FEED_URL;
feedLink.href = FEED_URL;

// Last payload rendered, kept so a resize can redraw without refetching.
let currentData = null;
// Cards the reader switched to the table view, by card id, so a redraw keeps it.
const tableViews = new Set();


/* ---------------------------------------------------------------- theme -- */

function setThemeColor(dark) {
    themeColorMeta.setAttribute('content', dark ? '#121212' : '#f8f9fa');
}

// data-theme lives on <html> so `color-scheme` reaches the page canvas, which
// is what themes the scrollbars and native form controls. Both values are
// stamped explicitly — the chart palette has a `prefers-color-scheme` block, so
// "no attribute" would let the OS override a reader who picked light.
function applyTheme(dark) {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    themeIcon.setAttribute('href', dark ? '#sun-icon' : '#moon-icon');
    themeToggle.setAttribute('aria-pressed', String(dark));
    setThemeColor(dark);
}

function initTheme() {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');
    const stored = localStorage.getItem('theme');

    applyTheme(stored === 'dark' || (!stored && prefersDark.matches));
}

themeToggle.addEventListener('click', () => {
    const dark = document.documentElement.getAttribute('data-theme') !== 'dark';

    applyTheme(dark);
    localStorage.setItem('theme', dark ? 'dark' : 'light');
    // Series colours are CSS variables, but they are read into SVG attributes
    // at draw time, so the charts have to be drawn again.
    if (currentData) render(currentData);
}, {passive: true});


/* ----------------------------------------------------------- formatting -- */

// Anything that is not a finite number is missing, whatever shape it arrived
// in. The feed uses null for "not computable yet" and omits keys outright when
// a section has no data.
function num(value) {
    return typeof value === 'number' && isFinite(value) ? value : null;
}

function fmt(value, dp = 1) {
    if (num(value) === null) {
        return '—';
    }
    return value.toLocaleString(undefined, {minimumFractionDigits: dp, maximumFractionDigits: dp});
}

// Decimal minutes per km read as 5.811; runners read 5:49.
function fmtPace(minPerKm) {
    if (num(minPerKm) === null) {
        return '—';
    }
    const totalSeconds = Math.round(minPerKm * 60);

    return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`;
}

function fmtPercent(fraction, dp = 0) {
    if (num(fraction) === null) {
        return '—';
    }
    return `${(fraction * 100).toFixed(dp)}%`;
}

// The feed's dates are calendar days with no zone. Parsing them as UTC keeps a
// run on the day it was logged for readers west of Greenwich.
function parseDay(text) {
    const date = new Date(`${text}T00:00:00Z`);

    return isNaN(date.getTime()) ? null : date;
}

function fmtDay(text) {
    const date = parseDay(text);

    return date ? date.toLocaleDateString(undefined, {day: 'numeric', month: 'short', timeZone: 'UTC'}) : String(text);
}

function fmtDayYear(text) {
    const date = parseDay(text);

    return date ? date.toLocaleDateString(undefined, {day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC'}) : String(text);
}

function capitalise(text) {
    return String(text).charAt(0).toUpperCase() + String(text).slice(1);
}

function plural(count, one, many) {
    return `${count} ${count === 1 ? one : many}`;
}

// Read a themed colour out of the stylesheet. Charts are drawn with SVG
// presentation attributes, so the value has to be resolved rather than
// inherited — which is why a theme change redraws.
function token(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}


/* ----------------------------------------------------------- DOM helpers -- */

const SVG_NS = 'http://www.w3.org/2000/svg';

function svg(tag, attrs = {}, parent = null) {
    const node = document.createElementNS(SVG_NS, tag);

    for (const [key, value] of Object.entries(attrs)) {
        node.setAttribute(key, String(value));
    }
    if (parent) {
        parent.appendChild(node);
    }
    return node;
}

function html(tag, attrs = {}, parent = null) {
    const node = document.createElement(tag);

    for (const [key, value] of Object.entries(attrs)) {
        if (key === 'class') {
            node.className = value;
        } else if (key === 'text') {
            // Feed strings reach the page this way and never through innerHTML:
            // the payload is remote and is not markup.
            node.textContent = value;
        } else {
            node.setAttribute(key, String(value));
        }
    }
    if (parent) {
        parent.appendChild(node);
    }
    return node;
}

function svgText(parent, x, y, content, attrs = {}) {
    const node = svg('text', Object.assign({x, y}, attrs), parent);

    node.textContent = content;
    return node;
}


/* --------------------------------------------------------------- scales -- */

function linear(domainMin, domainMax, rangeMin, rangeMax) {
    const span = domainMax - domainMin || 1;

    return value => rangeMin + ((value - domainMin) / span) * (rangeMax - rangeMin);
}

// Axis ticks land on 1 / 2 / 2.5 / 5 × a power of ten, and the top tick is the
// top of the scale, so a bar never runs past the last gridline.
function niceTicks(max, count = 4) {
    if (!(max > 0)) {
        return [0, 1];
    }
    const magnitude = Math.pow(10, Math.floor(Math.log10(max / count)));
    const normalised = max / count / magnitude;
    const step = (normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 2.5 ? 2.5 : normalised <= 5 ? 5 : 10) * magnitude;
    const ticks = [];

    for (let value = 0; value < max + step * 0.999; value += step) {
        ticks.push(Number(value.toFixed(10)));
    }
    if (ticks[ticks.length - 1] < max) {
        ticks.push(Number((ticks[ticks.length - 1] + step).toFixed(10)));
    }
    return ticks;
}

// A column with a 4px rounded cap and square feet at the baseline.
function columnPath(x, y, width, height, radius = 4) {
    const r = Math.max(0, Math.min(radius, width / 2, height));
    const bottom = y + height;

    return `M${x},${bottom}L${x},${y + r}Q${x},${y} ${x + r},${y}L${x + width - r},${y}Q${x + width},${y} ${x + width},${y + r}L${x + width},${bottom}Z`;
}

function linePath(points) {
    return points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point[0]},${point[1]}`).join('');
}


/* -------------------------------------------------------------- tooltip -- */

let tooltipAnchor = null;

function showTooltip(rows, title, anchor) {
    tooltipEl.replaceChildren();
    html('div', {class: 'tooltip-title', text: title}, tooltipEl);

    for (const row of rows) {
        const line = html('div', {class: 'tooltip-row'}, tooltipEl);

        if (row.color) {
            html('span', {class: 'tooltip-key', style: `background-color:${row.color}`}, line);
        }
        // Values lead, labels follow: here the reader already has the series
        // and wants the number.
        html('span', {class: 'tooltip-value', text: row.value}, line);
        html('span', {class: 'tooltip-name', text: row.name}, line);
    }

    tooltipEl.classList.add('visible');
    tooltipEl.setAttribute('aria-hidden', 'false');
    tooltipAnchor = anchor;
    positionTooltip(anchor);
}

function positionTooltip(anchor) {
    const box = tooltipEl.getBoundingClientRect();
    const margin = 12;
    let left = anchor.x + 14;
    let top = anchor.y - box.height - 14;

    if (left + box.width > window.innerWidth - margin) {
        left = anchor.x - box.width - 14;
    }
    if (left < margin) {
        left = margin;
    }
    if (top < margin) {
        top = anchor.y + 20;
    }
    tooltipEl.style.left = `${left}px`;
    tooltipEl.style.top = `${top}px`;
}

function hideTooltip() {
    tooltipEl.classList.remove('visible');
    tooltipEl.setAttribute('aria-hidden', 'true');
    tooltipAnchor = null;
}

window.addEventListener('scroll', () => {
    if (tooltipAnchor) {
        hideTooltip();
    }
}, {passive: true});

// Wire a mark to the hover layer. The hit target is the mark plus its surface
// gap and then some, never only the painted pixels; keyboard focus shows
// exactly what hover shows.
function attachTooltip(node, title, rows, {focusable = true} = {}) {
    const label = `${title}. ${rows.map(row => `${row.name}: ${row.value}`).join('. ')}`;

    node.setAttribute('class', `${node.getAttribute('class') || ''} mark`.trim());
    node.setAttribute('role', 'img');
    node.setAttribute('aria-label', label);

    node.addEventListener('pointerenter', event => showTooltip(rows, title, {x: event.clientX, y: event.clientY}));
    node.addEventListener('pointermove', event => positionTooltip({x: event.clientX, y: event.clientY}));
    node.addEventListener('pointerleave', hideTooltip);

    if (focusable) {
        node.setAttribute('tabindex', '0');
        node.addEventListener('focus', () => {
            const box = node.getBoundingClientRect();

            showTooltip(rows, title, {x: box.left + box.width / 2, y: box.top});
        });
        node.addEventListener('blur', hideTooltip);
    }
}


/* ---------------------------------------------------------- card shells -- */

// Every chart ships with a table twin. The toggle is the keyboard and
// screen-reader path to the same numbers, so it is a real button, not a
// decoration.
function makeCard(id, {title, subtitle, wide = true}) {
    const card = html('section', {class: wide ? 'card wide' : 'card'}, cardsEl);
    const head = html('div', {class: 'card-head'}, card);

    html('h2', {text: title, id: `${id}-title`}, head);

    const body = html('div', {}, card);
    const tableWrap = html('div', {class: 'table-wrap'}, card);

    if (subtitle) {
        const sub = html('p', {class: 'card-sub', text: subtitle}, card);

        card.insertBefore(sub, body);
    }

    const toggle = html('button', {class: 'view-toggle', type: 'button'}, head);

    function apply(asTable) {
        body.style.display = asTable ? 'none' : '';
        tableWrap.style.display = asTable ? 'block' : 'none';
        toggle.textContent = asTable ? 'Chart' : 'Table';
        toggle.setAttribute('aria-pressed', String(asTable));
        toggle.setAttribute('aria-label', `${asTable ? 'Show chart' : 'Show table'} for ${title}`);
    }

    toggle.addEventListener('click', () => {
        const asTable = !tableViews.has(id);

        if (asTable) {
            tableViews.add(id);
        } else {
            tableViews.delete(id);
        }
        hideTooltip();
        // Redraw rather than just unhide: a chart drawn into a hidden element
        // measures zero width, so the chart body stays visible until its
        // drawing is done and only then is hidden by applyView().
        render(currentData);
    });

    // Called once the caller has finished drawing into `body`.
    const applyView = () => apply(tableViews.has(id));

    return {card, body, tableWrap, applyView};
}

function makeTable(parent, caption, headers, rows) {
    parent.replaceChildren();

    const table = html('table', {}, parent);

    html('caption', {text: caption}, table);

    const headRow = html('tr', {}, html('thead', {}, table));

    for (const header of headers) {
        html('th', {scope: 'col', text: header}, headRow);
    }

    const body = html('tbody', {}, table);

    for (const row of rows) {
        const tr = html('tr', {}, body);

        row.forEach((cell, index) => {
            html(index === 0 ? 'th' : 'td', index === 0 ? {scope: 'row', text: cell} : {text: cell}, tr);
        });
    }
    return table;
}

function makeLegend(parent, entries) {
    const legend = html('div', {class: 'legend'}, parent);

    for (const entry of entries) {
        const item = html('span', {class: 'legend-item'}, legend);

        html('span', {
            class: `legend-key ${entry.shape || 'rect'}`,
            style: `background-color:${entry.color}`
        }, item);
        html('span', {text: entry.name}, item);
    }
    return legend;
}

function makeEmpty(parent, message) {
    const box = html('div', {class: 'empty'}, parent);
    const icon = svg('svg', {class: 'icon', 'aria-hidden': 'true'}, box);

    svg('use', {href: '#info-icon'}, icon);
    html('span', {text: message}, box);
    return box;
}

// Charts are drawn at device pixels rather than scaled from a fixed viewBox,
// so axis text stays the size it was designed at on every screen width.
function makeSvg(parent, height, label) {
    const measured = parent.clientWidth || parent.getBoundingClientRect().width;
    const width = Math.max(260, Math.floor(measured || 640));
    const node = svg('svg', {
        class: 'chart',
        width,
        height,
        viewBox: `0 0 ${width} ${height}`,
        role: 'img',
        'aria-label': label
    }, parent);

    return {node, width, height};
}


/* ------------------------------------------------------------- statuses -- */

// Status is a word plus an icon plus a colour, in that order of importance.
// Two of the four status steps sit below 3:1 on white, so the colour never
// carries the meaning on its own.
function acwrStatus(ratio, threshold) {
    if (num(ratio) === null) {
        return {tone: 'warning', icon: '#info-icon', word: 'No reading'};
    }
    if (ratio >= threshold) {
        return {tone: 'critical', icon: '#alert-icon', word: 'Load spike'};
    }
    if (ratio > ACWR_SWEET_HIGH) {
        return {tone: 'serious', icon: '#alert-icon', word: 'Climbing fast'};
    }
    if (ratio < ACWR_SWEET_LOW) {
        return {tone: 'warning', icon: '#info-icon', word: 'Detraining'};
    }
    return {tone: 'good', icon: '#check-icon', word: 'Sweet spot'};
}

function easyShareStatus(share) {
    if (num(share) === null) {
        return {tone: 'warning', icon: '#info-icon', word: 'No reading'};
    }
    if (share >= EASY_SHARE_TARGET) {
        return {tone: 'good', icon: '#check-icon', word: 'On target'};
    }
    if (share >= 0.5) {
        return {tone: 'serious', icon: '#alert-icon', word: 'Too hard'};
    }
    return {tone: 'critical', icon: '#alert-icon', word: 'Far too hard'};
}

function makeChip(parent, status) {
    const chip = html('span', {class: `chip ${status.tone}`}, parent);
    const icon = svg('svg', {class: 'icon', 'aria-hidden': 'true'}, chip);

    svg('use', {href: status.icon}, icon);
    html('span', {text: status.word}, chip);
    return chip;
}


/* ---------------------------------------------------------- stat tiles --- */

function makeTile(label, value, unit, note, status) {
    const tile = html('div', {class: 'tile'}, kpisEl);

    html('div', {class: 'tile-label', text: label}, tile);

    const valueEl = html('div', {class: 'tile-value'}, tile);

    // Proportional figures, not tabular: at this size tabular digits read loose.
    html('span', {text: value}, valueEl);
    if (unit) {
        html('span', {class: 'unit', text: unit}, valueEl);
    }
    if (status) {
        makeChip(html('div', {style: 'margin-top:6px'}, tile), status);
    }
    if (note) {
        html('div', {class: 'tile-note', text: note}, tile);
    }
    return tile;
}

function renderTiles(data) {
    kpisEl.replaceChildren();

    const weeks = (data.weeklyVolume && Array.isArray(data.weeklyVolume.weeks)) ? data.weeklyVolume.weeks : [];
    const zoneWeeks = (data.weeklyZones && Array.isArray(data.weeklyZones.weeks)) ? data.weeklyZones.weeks : [];
    const current = (data.acwr && data.acwr.current) || {};
    const source = data.source || {};

    // Last 7 days is the acute window the ACWR is already built on, so the two
    // numbers on the page cannot disagree.
    makeTile('Last 7 days', fmt(current.acuteKm), 'km',
        current.date ? `to ${fmtDayYear(current.date)}` : '');

    const rolling = [...weeks].reverse().find(week => num(week.rolling4WeekAvgKm) !== null);
    const rollingWeeks = num(data.weeklyVolume && data.weeklyVolume.rollingWeeks) || 4;

    makeTile(`${rollingWeeks}-week average`, fmt(rolling ? rolling.rolling4WeekAvgKm : null), 'km/wk',
        'chronic training base');

    const longest = weeks.reduce((best, week) => (num(week.longestRunKm) > num(best && best.longestRunKm) ? week : best), null);
    const longestKm = longest ? num(longest.longestRunKm) : null;

    makeTile('Longest run', fmt(longestKm), 'km',
        longestKm ? `${fmtPercent(longestKm / MARATHON_KM)} of the 42.2 km race` : 'none logged');

    const latestZone = [...zoneWeeks].reverse().find(week => num(week.easyShare) !== null);
    const easyShare = latestZone ? num(latestZone.easyShare) : null;

    makeTile('Easy share', fmtPercent(easyShare), '',
        `latest week · target ${fmtPercent(EASY_SHARE_TARGET)}`, easyShareStatus(easyShare));

    const weeksWithRuns = weeks.filter(week => num(week.runs) > 0).length;

    makeTile('Weeks run', String(weeksWithRuns), `of ${weeks.length}`,
        weeks.length ? `since ${fmtDayYear(weeks[0].weekStart)}` : '');

    const skipped = Object.values(source.skipped || {}).reduce((total, count) => total + (num(count) || 0), 0);

    makeTile('Runs logged', String(num(source.runs) ?? '—'), '',
        `${fmt(source.totalKm)} km total${skipped ? ` · ${plural(skipped, 'run', 'runs')} skipped` : ''}`);
}


/* ------------------------------------------------------- chart palette --- */

function palette() {
    return {
        s1: token('--series-1'),
        s2: token('--series-2'),
        s3: token('--series-3'),
        surface: token('--card-bg'),
        good: token('--status-good'),
        critical: token('--status-critical')
    };
}

// Draw a horizontal grid and its y-axis labels, and hand back the y scale.
function yAxis(node, plot, max, formatTick) {
    const ticks = niceTicks(max);
    const top = ticks[ticks.length - 1];
    const y = linear(0, top, plot.bottom, plot.top);

    for (const tick of ticks) {
        svg('line', {
            class: 'gridline',
            x1: plot.left, x2: plot.right, y1: y(tick), y2: y(tick)
        }, node);
        svgText(node, plot.left - 8, y(tick) + 4, formatTick(tick), {'text-anchor': 'end'});
    }
    return {y, top};
}

// Band positions for a categorical x axis (one slot per week).
function bands(plot, count) {
    const width = (plot.right - plot.left) / Math.max(count, 1);

    return {
        width,
        centre: index => plot.left + width * (index + 0.5)
    };
}

// Label every slot when they fit, every other when they don't. Text is never
// rotated into the plot or clipped.
function bandLabels(node, plot, band, count, labelAt) {
    const step = band.width < 52 ? 2 : 1;

    for (let index = 0; index < count; index += 1) {
        if (index % step !== 0 && index !== count - 1) {
            continue;
        }
        svgText(node, band.centre(index), plot.bottom + 18, labelAt(index), {'text-anchor': 'middle'});
    }
}


/* --------------------------------------------------- card: training load -- */

function renderLoad(data) {
    const acwr = data.acwr || {};
    const current = acwr.current || {};
    const points = Array.isArray(acwr.points) ? acwr.points : [];
    const threshold = num(acwr.threshold) ?? 1.5;
    const ratio = num(current.ratio);
    const status = acwrStatus(ratio, threshold);
    const colors = palette();

    const card = makeCard('load', {
        title: 'Training load',
        subtitle: `Acute (${num(acwr.acuteDays) ?? 7}-day) km against the chronic (${num(acwr.chronicDays) ?? 28}-day) base. `
            + 'Injury risk climbs when this week is far bigger than the weeks behind it.'
    });

    // The one hero figure on the page: the number the dashboard leads with.
    const hero = html('div', {class: 'hero'}, card.body);

    html('span', {class: 'hero-value', text: ratio === null ? '—' : fmt(ratio, 2)}, hero);
    html('span', {class: 'hero-unit', text: 'acute : chronic ratio'}, hero);
    makeChip(hero, status);

    const reading = html('p', {class: 'reading'}, card.body);
    const acute = fmt(current.acuteKm);
    const chronicDaily = num(current.chronicDailyKm);

    reading.textContent = ratio === null
        ? 'Not computable yet — there is no chronic base to compare this week against.'
        : `${acute} km in the last ${num(acwr.acuteDays) ?? 7} days against a chronic base of `
            + `${fmt(chronicDaily * (num(acwr.acuteDays) ?? 7))} km per week. `
            + (ratio >= threshold
                ? `That is past the ${fmt(threshold, 1)} flag — the jump is large relative to the base, which is what the ratio is built to catch. On this little history the ratio is volatile: a single run moves it.`
                : `The ${fmt(ACWR_SWEET_LOW, 1)}–${fmt(ACWR_SWEET_HIGH, 1)} band is where load is growing without outrunning the base.`);

    if (!points.length) {
        makeEmpty(card.body, 'No day-by-day history in the feed yet.');
        card.tableWrap.replaceChildren();
        makeEmpty(card.tableWrap, 'No day-by-day history in the feed yet.');
        card.applyView();
        return;
    }

    const height = 260;
    const plot = {top: 16, right: 0, bottom: height - 30, left: 46};
    const {node, width} = makeSvg(card.body, height,
        `Acute to chronic workload ratio by day, ${fmtDayYear(points[0].date)} to ${fmtDayYear(points[points.length - 1].date)}`);

    plot.right = width - 78;

    const maxRatio = points.reduce((max, point) => Math.max(max, num(point.ratio) ?? 0), 0);
    const {y} = yAxis(node, plot, Math.max(maxRatio, threshold * 1.25), tick => fmt(tick, 1));
    const x = linear(0, Math.max(points.length - 1, 1), plot.left, plot.right);

    // The band the ratio is meant to sit in, as a wash rather than a block.
    const bandTop = y(ACWR_SWEET_HIGH);
    const bandBottom = y(ACWR_SWEET_LOW);

    svg('rect', {
        x: plot.left, y: bandTop, width: plot.right - plot.left, height: Math.max(bandBottom - bandTop, 1),
        fill: colors.good, 'fill-opacity': 0.1
    }, node);
    svgText(node, plot.right + 6, (bandTop + bandBottom) / 2 + 4, 'Sweet spot');

    // The flag the feed itself uses. Solid, like every other rule on the page.
    svg('line', {
        x1: plot.left, x2: plot.right, y1: y(threshold), y2: y(threshold),
        stroke: colors.critical, 'stroke-width': 1
    }, node);
    svgText(node, plot.right + 6, y(threshold) + 4, `Flag ${fmt(threshold, 1)}`, {class: 'value-label'});

    svg('line', {class: 'axisline', x1: plot.left, x2: plot.right, y1: plot.bottom, y2: plot.bottom}, node);

    // A null ratio is "no chronic base to divide by", not zero, so the line
    // breaks there instead of diving to the floor.
    let run = [];

    const flush = () => {
        if (run.length > 1) {
            svg('path', {
                d: linePath(run), fill: 'none', stroke: colors.s1,
                'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round'
            }, node);
        } else if (run.length === 1) {
            svg('circle', {cx: run[0][0], cy: run[0][1], r: 2.5, fill: colors.s1}, node);
        }
        run = [];
    };

    points.forEach((point, index) => {
        const value = num(point.ratio);

        if (value === null) {
            flush();
            return;
        }
        run.push([x(index), y(value)]);
    });
    flush();

    const last = points[points.length - 1];

    if (num(last.ratio) !== null) {
        const cx = x(points.length - 1);
        const cy = y(num(last.ratio));

        svg('circle', {cx, cy, r: 4.5, fill: colors.s1, stroke: colors.surface, 'stroke-width': 2}, node);
        svgText(node, plot.right + 6, cy + 4, fmt(last.ratio, 2), {class: 'value-label'});
    }

    svgText(node, plot.left, plot.bottom + 18, fmtDay(points[0].date), {'text-anchor': 'start'});
    svgText(node, plot.right, plot.bottom + 18, fmtDay(last.date), {'text-anchor': 'end'});

    // The crosshair finds the X: readers aim at a date, never at a 2px line.
    const crosshair = svg('line', {
        class: 'axisline', x1: 0, x2: 0, y1: plot.top, y2: plot.bottom, opacity: 0
    }, node);
    const slot = (plot.right - plot.left) / Math.max(points.length - 1, 1);

    points.forEach((point, index) => {
        const hit = svg('rect', {
            x: x(index) - slot / 2, y: plot.top, width: Math.max(slot, 8), height: plot.bottom - plot.top,
            fill: 'transparent'
        }, node);

        attachTooltip(hit, fmtDayYear(point.date), [
            {name: 'ratio', value: fmt(point.ratio, 2), color: colors.s1},
            {name: `acute km (${num(acwr.acuteDays) ?? 7}d)`, value: fmt(point.acuteKm)},
            {name: `chronic km (${num(acwr.chronicDays) ?? 28}d)`, value: fmt(point.chronicKm)}
        ], {focusable: false});
        hit.addEventListener('pointerenter', () => {
            crosshair.setAttribute('x1', x(index));
            crosshair.setAttribute('x2', x(index));
            crosshair.setAttribute('opacity', 1);
        });
        hit.addEventListener('pointerleave', () => crosshair.setAttribute('opacity', 0));
    });

    makeTable(card.tableWrap, 'Acute to chronic workload ratio by day',
        ['Date', 'Acute km', 'Chronic km', 'Ratio', 'Flagged'],
        points.map(point => [
            fmtDayYear(point.date), fmt(point.acuteKm), fmt(point.chronicKm),
            fmt(point.ratio, 2), point.flagged ? 'yes' : 'no'
        ]));
    card.applyView();
}


/* --------------------------------------------------- card: weekly volume -- */

function renderVolume(data) {
    const volume = data.weeklyVolume || {};
    const weeks = Array.isArray(volume.weeks) ? volume.weeks : [];
    const rollingWeeks = num(volume.rollingWeeks) ?? 4;
    const colors = palette();
    const card = makeCard('volume', {
        title: 'Weekly volume',
        subtitle: 'Kilometres per week, the rolling average behind them, and the longest single run of each week.'
    });

    if (!weeks.length) {
        makeEmpty(card.body, 'No weeks in the feed yet.');
        makeEmpty(card.tableWrap, 'No weeks in the feed yet.');
        card.applyView();
        return;
    }

    // Order matters: this is the validated slot order, and reordering it is
    // what breaks the colour-blind separation between the two lines.
    const series = [
        {name: 'Weekly km', color: colors.s1, shape: 'rect'},
        {name: `${rollingWeeks}-week average`, color: colors.s2, shape: 'line'},
        {name: 'Longest run', color: colors.s3, shape: 'line'}
    ];

    makeLegend(card.body, series);

    const height = 280;
    const {node, width} = makeSvg(card.body, height, 'Kilometres per week');
    const plot = {top: 22, right: width - 8, bottom: height - 34, left: 46};
    const max = weeks.reduce((best, week) => Math.max(
        best, num(week.km) ?? 0, num(week.rolling4WeekAvgKm) ?? 0, num(week.longestRunKm) ?? 0
    ), 0);
    const {y} = yAxis(node, plot, max || 1, tick => fmt(tick, tick >= 10 ? 0 : 1));
    const band = bands(plot, weeks.length);
    const columnWidth = Math.min(24, band.width * 0.5);

    weeks.forEach((week, index) => {
        const km = num(week.km) ?? 0;
        const top = y(km);
        const barHeight = plot.bottom - top;

        if (barHeight > 0.5) {
            svg('path', {
                d: columnPath(band.centre(index) - columnWidth / 2, top, columnWidth, barHeight),
                fill: colors.s1
            }, node);
        }
    });

    // Two lines, both in km, on the one axis — never a second scale.
    for (const [key, color] of [['rolling4WeekAvgKm', colors.s2], ['longestRunKm', colors.s3]]) {
        const drawn = weeks
            .map((week, index) => ({value: num(week[key]), index}))
            .filter(item => item.value !== null);

        if (drawn.length > 1) {
            svg('path', {
                d: linePath(drawn.map(item => [band.centre(item.index), y(item.value)])),
                fill: 'none', stroke: color, 'stroke-width': 2,
                'stroke-linejoin': 'round', 'stroke-linecap': 'round'
            }, node);
        }
        for (const item of drawn) {
            svg('circle', {
                cx: band.centre(item.index), cy: y(item.value), r: 4,
                fill: color, stroke: colors.surface, 'stroke-width': 2
            }, node);
        }
    }

    svg('line', {class: 'axisline', x1: plot.left, x2: plot.right, y1: plot.bottom, y2: plot.bottom}, node);
    bandLabels(node, plot, band, weeks.length, index => fmtDay(weeks[index].weekStart));

    // One direct label, on the week the reader is actually asking about.
    const latest = weeks[weeks.length - 1];

    if (num(latest.km) > 0) {
        svgText(node, band.centre(weeks.length - 1), y(latest.km) - 8, `${fmt(latest.km)} km`,
            {'text-anchor': 'middle', class: 'value-label'});
    }

    // The hit target is the whole slot, not the 24px column.
    weeks.forEach((week, index) => {
        const hit = svg('rect', {
            x: band.centre(index) - band.width / 2, y: plot.top,
            width: band.width, height: plot.bottom - plot.top, fill: 'transparent'
        }, node);

        attachTooltip(hit, `Week of ${fmtDayYear(week.weekStart)}`, [
            {name: 'km', value: fmt(week.km), color: colors.s1},
            {name: `${rollingWeeks}-week average`, value: fmt(week.rolling4WeekAvgKm), color: colors.s2},
            {name: 'longest run', value: fmt(week.longestRunKm), color: colors.s3},
            {name: week.runs === 1 ? 'run' : 'runs', value: String(num(week.runs) ?? 0)}
        ]);
    });

    const ran = weeks.filter(week => num(week.runs) > 0).length;

    html('p', {
        class: 'reading',
        text: `${plural(ran, 'week', 'weeks')} of ${weeks.length} had a run in them. `
            + 'Gaps are what the rolling average is there to expose — it keeps a missed week visible for a month.'
    }, card.body);

    makeTable(card.tableWrap, 'Volume by week',
        ['Week starting', 'ISO week', 'Runs', 'Km', 'Longest run km', `${rollingWeeks}-week avg km`],
        weeks.map(week => [
            fmtDayYear(week.weekStart), String(week.isoWeek ?? '—'), String(num(week.runs) ?? 0),
            fmt(week.km), fmt(week.longestRunKm), fmt(week.rolling4WeekAvgKm)
        ]));
    card.applyView();
}


/* ------------------------------------------------------------ card: pace -- */

// Pace only means something next to the effort that produced it, so the run
// types are faceted rather than plotted on top of each other in five colours.
// One series per panel, one shared scale, so panels stay comparable.
function renderPace(data) {
    const pace = data.pace || {};
    const series = Array.isArray(pace.series) ? pace.series : [];
    const colors = palette();
    const card = makeCard('pace', {
        title: 'Pace by run type',
        subtitle: 'Minutes per kilometre, faster upwards. One panel per run type, all sharing one scale.'
    });

    const populated = series.filter(entry => Array.isArray(entry.points) && entry.points.length);
    const empty = series.filter(entry => !Array.isArray(entry.points) || !entry.points.length);
    const all = populated.flatMap(entry => entry.points.map(point => Object.assign({runType: entry.runType}, point)));

    all.sort((left, right) => String(left.date).localeCompare(String(right.date)));

    if (!all.length) {
        makeEmpty(card.body, 'No runs with a pace in the feed yet.');
        makeEmpty(card.tableWrap, 'No runs with a pace in the feed yet.');
        card.applyView();
        return;
    }

    const paces = all.map(point => num(point.paceMinPerKm)).filter(value => value !== null);
    const spread = Math.max(Math.max(...paces) - Math.min(...paces), 0.5);
    const slowest = Math.max(...paces) + spread * 0.2;
    const fastest = Math.min(...paces) - spread * 0.2;
    const times = all.map(point => (parseDay(point.date) || new Date()).getTime());
    const firstDay = Math.min(...times);
    const lastDay = Math.max(...times);

    const panels = html('div', {class: 'panels'}, card.body);
    const order = [...populated].sort((left, right) =>
        RUN_TYPE_ORDER.indexOf(left.runType) - RUN_TYPE_ORDER.indexOf(right.runType));
    // Every panel exists before any is drawn: a chart measured while it is the
    // grid's only child gets the full width, then shrinks when its siblings
    // arrive and takes its text down with it.
    const slots = order.map(entry => ({entry, panel: html('div', {class: 'panel'}, panels)}));

    for (const {entry, panel} of slots) {
        const height = 180;
        const {node, width} = makeSvg(panel, height, `${capitalise(entry.runType)} runs, pace in minutes per kilometre`);
        const plot = {top: 34, right: width - 12, bottom: height - 26, left: 44};

        svgText(node, 0, 14, `${capitalise(entry.runType)} · ${plural(entry.points.length, 'run', 'runs')}`,
            {class: 'panel-title', 'text-anchor': 'start'});

        // Inverted on purpose: a lower min/km is a faster run, and a faster run
        // belongs higher on the page.
        const y = linear(fastest, slowest, plot.top, plot.bottom);

        for (const tick of [fastest, (fastest + slowest) / 2, slowest]) {
            svg('line', {class: 'gridline', x1: plot.left, x2: plot.right, y1: y(tick), y2: y(tick)}, node);
            svgText(node, plot.left - 8, y(tick) + 4, fmtPace(tick), {'text-anchor': 'end'});
        }
        svg('line', {class: 'axisline', x1: plot.left, x2: plot.right, y1: plot.bottom, y2: plot.bottom}, node);

        // A single run has no range to spread across, so it sits mid-panel
        // rather than pinned to one edge as if it were an endpoint.
        const x = lastDay === firstDay
            ? () => (plot.left + plot.right) / 2
            : linear(firstDay, lastDay, plot.left, plot.right);
        const points = [...entry.points].sort((left, right) => String(left.date).localeCompare(String(right.date)));
        const placed = points
            .filter(point => num(point.paceMinPerKm) !== null)
            .map(point => ({
                point,
                cx: x((parseDay(point.date) || new Date()).getTime()),
                cy: y(num(point.paceMinPerKm))
            }));

        if (placed.length > 1) {
            svg('path', {
                d: linePath(placed.map(item => [item.cx, item.cy])),
                fill: 'none', stroke: colors.s1, 'stroke-width': 2,
                'stroke-linejoin': 'round', 'stroke-linecap': 'round'
            }, node);
        }

        for (const item of placed) {
            // A 24px transparent hit area under a 9px dot — nobody reliably
            // lands on the painted pixels.
            const hit = svg('circle', {cx: item.cx, cy: item.cy, r: 12, fill: 'transparent'}, node);

            svg('circle', {
                cx: item.cx, cy: item.cy, r: 4.5,
                fill: colors.s1, stroke: colors.surface, 'stroke-width': 2
            }, node);
            attachTooltip(hit, `${capitalise(entry.runType)} · ${fmtDayYear(item.point.date)}`, [
                {name: 'min/km', value: fmtPace(item.point.paceMinPerKm), color: colors.s1},
                {name: 'km', value: fmt(item.point.distanceKm, 2)},
                {name: 'min', value: fmt(item.point.durationMin)},
                {name: 'bpm avg', value: String(num(item.point.averageHeartRate) ?? '—')}
            ]);
        }

        // Label the latest run only. A number on every dot goes unread.
        const latest = placed[placed.length - 1];

        if (latest) {
            const anchor = latest.cx > (plot.left + plot.right) / 2 ? 'end' : 'start';

            svgText(node, latest.cx + (anchor === 'end' ? -10 : 10), latest.cy + 4,
                fmtPace(latest.point.paceMinPerKm), {'text-anchor': anchor, class: 'value-label'});
        }

        svgText(node, plot.left, plot.bottom + 18, fmtDay(all[0].date), {'text-anchor': 'start'});
        svgText(node, plot.right, plot.bottom + 18, fmtDay(all[all.length - 1].date), {'text-anchor': 'end'});
    }

    if (empty.length) {
        html('p', {
            class: 'reading',
            text: `Nothing logged yet as ${empty.map(entry => entry.runType).join(', ')}. `
                + 'For a marathon block the missing easy and long runs are the gap that matters — '
                + 'they are where the aerobic base and the race-day distance come from.'
        }, card.body);
    }

    makeTable(card.tableWrap, 'Every run in the feed',
        ['Date', 'Type', 'Km', 'Duration min', 'Pace min/km', 'Avg bpm'],
        all.map(point => [
            fmtDayYear(point.date), capitalise(point.runType), fmt(point.distanceKm, 2),
            fmt(point.durationMin), fmtPace(point.paceMinPerKm),
            String(num(point.averageHeartRate) ?? '—')
        ]));
    card.applyView();
}


/* ------------------------------------------------ card: intensity split --- */

function renderZones(data) {
    const zones = data.weeklyZones || {};
    const weeks = Array.isArray(zones.weeks) ? zones.weeks : [];
    const colors = palette();
    const card = makeCard('zones', {
        title: 'Intensity split',
        subtitle: `Minutes per week in the easy zones against zone 3 and up. Easy training aims for about ${fmtPercent(EASY_SHARE_TARGET)} easy.`
    });

    if (!weeks.length) {
        makeEmpty(card.body, 'No zone minutes in the feed yet.');
        makeEmpty(card.tableWrap, 'No zone minutes in the feed yet.');
        card.applyView();
        return;
    }

    makeLegend(card.body, [
        {name: 'Zone 1–2 (easy)', color: colors.s1, shape: 'rect'},
        {name: 'Zone 3+ (hard)', color: colors.s2, shape: 'rect'}
    ]);

    const height = 260;
    const {node, width} = makeSvg(card.body, height, 'Minutes per week by intensity zone');
    const plot = {top: 24, right: width - 8, bottom: height - 34, left: 46};
    const max = weeks.reduce((best, week) => Math.max(best, (num(week.inZonesMinutes) ?? 0)), 0);
    const {y} = yAxis(node, plot, max || 1, tick => fmt(tick, 0));
    const band = bands(plot, weeks.length);
    const columnWidth = Math.min(24, band.width * 0.5);
    const GAP = 2;  // surface gap — white does the separating, never a stroke

    weeks.forEach((week, index) => {
        const easy = num(week.zone12Minutes) ?? 0;
        const hard = num(week.zone3PlusMinutes) ?? 0;
        const left = band.centre(index) - columnWidth / 2;
        const easyTop = y(easy);
        const easyHeight = plot.bottom - easyTop;
        const hardHeight = plot.bottom - y(hard);
        const hardBottom = easyHeight > 0 ? easyTop - GAP : plot.bottom;
        const hardTop = hardBottom - hardHeight;

        // Only the top of the stack gets the rounded data-end; interior
        // segments stay square so the stack reads as one column.
        if (hardHeight > 0.5) {
            svg('path', {d: columnPath(left, hardTop, columnWidth, hardHeight), fill: colors.s2}, node);
        }
        if (easyHeight > 0.5) {
            svg('path', {
                d: hardHeight > 0.5
                    ? `M${left},${easyTop}h${columnWidth}v${easyHeight}h${-columnWidth}Z`
                    : columnPath(left, easyTop, columnWidth, easyHeight),
                fill: colors.s1
            }, node);
        }
    });

    svg('line', {class: 'axisline', x1: plot.left, x2: plot.right, y1: plot.bottom, y2: plot.bottom}, node);
    bandLabels(node, plot, band, weeks.length, index => fmtDay(weeks[index].weekStart));

    const latest = weeks[weeks.length - 1];

    if (num(latest.easyShare) !== null && num(latest.inZonesMinutes) > 0) {
        svgText(node, band.centre(weeks.length - 1), y(latest.inZonesMinutes) - 8,
            `${fmtPercent(latest.easyShare)} easy`, {'text-anchor': 'middle', class: 'value-label'});
    }

    weeks.forEach((week, index) => {
        const hit = svg('rect', {
            x: band.centre(index) - band.width / 2, y: plot.top,
            width: band.width, height: plot.bottom - plot.top, fill: 'transparent'
        }, node);

        attachTooltip(hit, `Week of ${fmtDayYear(week.weekStart)}`, [
            {name: 'min easy', value: fmt(week.zone12Minutes), color: colors.s1},
            {name: 'min hard', value: fmt(week.zone3PlusMinutes), color: colors.s2},
            {name: 'easy share', value: fmtPercent(week.easyShare)},
            {name: 'min below zone 1', value: fmt(week.zone0Minutes)}
        ]);
    });

    const share = num(latest.easyShare);

    html('p', {
        class: 'reading',
        text: share === null
            ? 'No zone minutes in the latest week.'
            : `Latest week ran ${fmtPercent(share)} of its in-zone minutes easy. `
                + (share < EASY_SHARE_TARGET
                    ? 'Nearly all of this block has been hard running, which builds fatigue faster than it builds the aerobic base a marathon is run on.'
                    : 'That is the split a marathon block wants.')
    }, card.body);

    if (zones.note) {
        html('p', {class: 'reading', text: String(zones.note)}, card.body);
    }

    makeTable(card.tableWrap, 'Minutes per week by zone',
        ['Week starting', 'Easy min', 'Hard min', 'Below zone 1 min', 'In zones min', 'Easy share'],
        weeks.map(week => [
            fmtDayYear(week.weekStart), fmt(week.zone12Minutes), fmt(week.zone3PlusMinutes),
            fmt(week.zone0Minutes), fmt(week.inZonesMinutes), fmtPercent(week.easyShare)
        ]));
    card.applyView();
}


/* ------------------------------------------- card: efficiency factor ----- */

function renderEfficiency(data) {
    const efficiency = data.efficiencyFactor || {};
    const points = Array.isArray(efficiency.points) ? efficiency.points : [];
    const colors = palette();
    const basis = efficiency.basis ? String(efficiency.basis) : 'easy runs only';
    const card = makeCard('efficiency', {
        title: 'Aerobic efficiency',
        subtitle: `Speed per heartbeat in ${efficiency.unit ? String(efficiency.unit) : 'm/min per bpm'}, from ${basis}. `
            + (efficiency.interpretation ? String(efficiency.interpretation) : 'Rising = fitter.'),
        wide: false
    });

    if (!points.length) {
        makeEmpty(card.body,
            `Nothing to plot: this is computed from ${basis}, and no easy run has been logged yet. `
            + 'It is the cleanest read on aerobic fitness the feed carries, so it is worth unlocking.');
        makeEmpty(card.tableWrap, 'No easy runs logged yet.');
        card.applyView();
        return;
    }

    const height = 260;
    const {node, width} = makeSvg(card.body, height, 'Aerobic efficiency over time');
    const plot = {top: 22, right: width - 8, bottom: height - 34, left: 46};
    const values = points.map(point => num(point.value ?? point.efficiencyFactor)).filter(value => value !== null);
    const {y} = yAxis(node, plot, Math.max(...values, 1) * 1.1, tick => fmt(tick, 2));
    const x = linear(0, Math.max(points.length - 1, 1), plot.left, plot.right);
    const placed = points
        .map((point, index) => ({point, value: num(point.value ?? point.efficiencyFactor), index}))
        .filter(item => item.value !== null);

    if (placed.length > 1) {
        svg('path', {
            d: linePath(placed.map(item => [x(item.index), y(item.value)])),
            fill: 'none', stroke: colors.s1, 'stroke-width': 2,
            'stroke-linejoin': 'round', 'stroke-linecap': 'round'
        }, node);
    }
    for (const item of placed) {
        const dot = svg('circle', {
            cx: x(item.index), cy: y(item.value), r: 4.5,
            fill: colors.s1, stroke: colors.surface, 'stroke-width': 2
        }, node);

        attachTooltip(dot, fmtDayYear(item.point.date), [
            {name: String(efficiency.unit || ''), value: fmt(item.value, 2), color: colors.s1}
        ]);
    }

    svg('line', {class: 'axisline', x1: plot.left, x2: plot.right, y1: plot.bottom, y2: plot.bottom}, node);
    svgText(node, plot.left, plot.bottom + 18, fmtDay(points[0].date), {'text-anchor': 'start'});
    svgText(node, plot.right, plot.bottom + 18, fmtDay(points[points.length - 1].date), {'text-anchor': 'end'});

    makeTable(card.tableWrap, 'Aerobic efficiency by run',
        ['Date', String(efficiency.unit || 'value')],
        placed.map(item => [fmtDayYear(item.point.date), fmt(item.value, 2)]));
    card.applyView();
}


/* --------------------------------------------------------------- render -- */

function render(data) {
    if (!data) {
        return;
    }
    currentData = data;
    hideTooltip();
    cardsEl.replaceChildren();
    // Before anything is drawn, not after: a chart measured inside a
    // display:none container measures zero and falls back to a default width,
    // which the viewBox then letterboxes into the card.
    dashboardEl.classList.add('loaded');

    const source = data.source || {};
    const asOfParts = [];

    if (data.asOf) {
        asOfParts.push(`Through ${fmtDayYear(data.asOf)}`);
    }
    if (num(source.runs) !== null) {
        asOfParts.push(`${plural(source.runs, 'run', 'runs')} logged`);
    }
    if (source.firstRun && source.lastRun) {
        asOfParts.push(`${fmtDayYear(source.firstRun)} to ${fmtDayYear(source.lastRun)}`);
    }
    asOfEl.textContent = asOfParts.join(' · ');

    renderTiles(data);
    renderLoad(data);
    renderVolume(data);
    renderPace(data);
    renderZones(data);
    renderEfficiency(data);
}


/* ---------------------------------------------------------------- fetch -- */

function setBusy(busy) {
    refreshButton.disabled = busy;
    refreshButton.classList.toggle('loading', busy);
    refreshButton.setAttribute('aria-busy', String(busy));
    refreshText.textContent = busy ? 'Reading…' : 'Refresh';
    // Refetch keeps the frame: the previous render stays put, dimmed.
    dashboardEl.classList.toggle('stale', busy && dashboardEl.classList.contains('loaded'));
}

function setStatus(message, kind = '') {
    statusEl.textContent = message;
    statusEl.className = kind ? `status ${kind}` : 'status';
}

// Turn a fetch rejection into something that can be acted on. A missing CORS
// rule on the storage account and a `connect-src` violation both surface as a
// bare TypeError with nothing in the object to tell them apart, so the two
// have to be reported together.
function describeFailure(error) {
    if (error.name === 'TimeoutError') {
        return `No response within ${REQUEST_TIMEOUT / 1000}s.`;
    }
    if (error.name === 'AbortError') {
        return 'Request cancelled.';
    }
    if (error instanceof TypeError) {
        return 'Could not reach the feed. The blob has to send an Access-Control-Allow-Origin '
            + 'for this site (a CORS rule on the storage account) and its origin has to be in '
            + "this site's connect-src.";
    }
    return error.message || 'Request failed.';
}

function showLoadError(detail) {
    loadErrorDetail.textContent = detail;
    loadErrorEl.style.display = 'block';
}

async function loadFeed() {
    setBusy(true);
    setStatus('Reading the training feed…');
    loadErrorEl.style.display = 'none';

    try {
        // The blob is served with a five-minute cache, so a manual refresh
        // carries a cache-buster. No request headers are set: keeping this a
        // simple request means no CORS preflight to satisfy.
        const response = await fetch(`${FEED_URL}?t=${Date.now()}`, {
            signal: AbortSignal.timeout(REQUEST_TIMEOUT)
        });

        if (!response.ok) {
            throw new Error(`Feed returned ${response.status} ${response.statusText}`.trim());
        }

        const data = await response.json();

        render(data);
        setStatus(`Built ${data.generatedAt ? new Date(data.generatedAt).toLocaleString() : 'from the feed'} · read at ${new Date().toLocaleTimeString()}`, 'success');
    } catch (error) {
        const detail = describeFailure(error);

        setStatus(detail, 'error');
        if (!currentData) {
            showLoadError(detail);
        }
    } finally {
        setBusy(false);
    }
}

refreshButton.addEventListener('click', loadFeed);

// Charts are drawn at pixel sizes, so a width change needs a redraw. Debounced,
// and only on width: a mobile browser collapsing its address bar changes the
// height on every scroll and must not trigger one.
let resizeTimer = null;
let lastWidth = window.innerWidth;

window.addEventListener('resize', () => {
    if (window.innerWidth === lastWidth || !currentData) {
        return;
    }
    lastWidth = window.innerWidth;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => render(currentData), 150);
}, {passive: true});


// Initialize
// The script is deferred, so the DOM is ready and the theme can be applied
// before first paint instead of after every image has finished loading.
initTheme();
loadFeed();
