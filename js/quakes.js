// ── Seismic panel ────────────────────────────────────────────
// Renders the earthquake watch: a headline "latest event" readout, a
// derived summary, the 24h timeline, the proximity radar (radar.js) and
// a chronological strip. Four of the five cities on the table sit over an
// active subduction margin, so this is the lead module.

import { magBand, cityImpact } from './config.js';
import { state, activeCity } from './state.js';
import { escHtml, timeAgo, fromCity, cityTime } from './utils.js';
import { renderRadar } from './radar.js';

/** Events at or above the active magnitude filter. */
export function filteredQuakes() {
  return state.quakes.items.filter((q) => q.mag >= state.minMag);
}

/** Count of events in the last 24h (unfiltered — situational total). */
export function quakes24h() {
  const cutoff = Date.now() - 86400000;
  return state.quakes.items.filter((q) => q.time >= cutoff).length;
}

/** Strongest event in the last 24h, or null. */
export function strongest24h() {
  const cutoff = Date.now() - 86400000;
  return state.quakes.items
    .filter((q) => q.time >= cutoff)
    .reduce((max, q) => (!max || q.mag > max.mag ? q : max), null);
}

/** City-impact verdict for one event (distance-aware). */
function impactOf(q, city = activeCity()) {
  return cityImpact(q.mag, fromCity(q.lat, q.lon, city).km, city);
}

/** Most recent event in the last 24h that was felt in the city, or null. */
export function lastFelt24h() {
  const cutoff = Date.now() - 86400000;
  const city = activeCity();
  return state.quakes.items
    .filter((q) => q.time >= cutoff && impactOf(q, city).felt)
    .reduce((latest, q) => (!latest || q.time > latest.time ? q : latest), null);
}

export function renderQuakes() {
  const s = state.quakes;
  if (s.status === 'loading' && !s.items.length) return skeleton();
  if (s.status === 'error' && !s.items.length) {
    return errorState('Seismic feed unreachable. Retry from the sync button.');
  }

  const list = filteredQuakes();
  const latest = list[0];
  if (!latest) {
    const city = activeCity();
    return `<p class="panel-empty">No events at or above M${state.minMag.toFixed(1)} within ${city.radiusKm} km of ${escHtml(city.short)}.</p>`;
  }

  return `
    ${renderHeadline(latest)}
    ${renderInsight(list)}
    ${renderTimeline(list)}
    ${renderRadar(list)}
    <ol class="quake-list" aria-label="Recent earthquakes">
      ${list.slice(0, 8).map(renderRow).join('')}
    </ol>
  `;
}

// 24h magnitude timeline: each event a plotted stem, height = magnitude,
// x = time-since (right edge = now). Reads as a heartbeat of the day's
// seismicity and makes clusters obvious. Pure inline SVG.
function renderTimeline(list) {
  const city = activeCity();
  const span = 86400000; // 24h window
  const now = Date.now();
  const events = list
    .filter((q) => q.time >= now - span)
    .sort((a, b) => a.time - b.time);

  if (events.length < 2) return '';

  const w = 300, h = 78;
  const padX = 6, padTop = 8, baseY = h - 16;
  const plotW = w - padX * 2;
  const maxMag = Math.max(5, ...events.map((q) => q.mag));

  const x = (t) => padX + ((t - (now - span)) / span) * plotW;
  const y = (mag) => baseY - (mag / maxMag) * (baseY - padTop);

  const stems = events.map((q) => {
    const band = magBand(q.mag);
    const cx = x(q.time).toFixed(1);
    const cy = y(q.mag).toFixed(1);
    const felt = impactOf(q, city).felt;
    const dot = felt
      ? `<circle cx="${cx}" cy="${cy}" r="4.5" fill="none" stroke="${band.color}" stroke-width="1.4" opacity=".9"/>`
      : '';
    return `<line x1="${cx}" y1="${baseY}" x2="${cx}" y2="${cy}" stroke="${band.color}" stroke-width="2" stroke-linecap="round" opacity=".85"/>
      <circle cx="${cx}" cy="${cy}" r="2.6" fill="${band.color}"><title>M${q.mag.toFixed(1)} · ${timeAgo(q.time)}${felt ? ` · felt in ${escHtml(city.short)}` : ''}</title></circle>${dot}`;
  }).join('');

  // Reference gridline at M4 (the "felt" threshold locally).
  const refY = y(4).toFixed(1);
  const hours = [18, 12, 6].map((hb) => {
    const gx = x(now - hb * 3600000).toFixed(1);
    return `<line x1="${gx}" y1="${padTop}" x2="${gx}" y2="${baseY}" class="tl-grid"/><text x="${gx}" y="${h - 3}" class="tl-tick" text-anchor="middle">${hb}h</text>`;
  }).join('');

  return `
    <div class="timeline" role="img" aria-label="Magnitude of events over the last 24 hours">
      <div class="timeline__head">
        <span class="timeline__title">24h activity</span>
        <span class="timeline__scale">${events.length} events · peak M${maxMag.toFixed(1)}</span>
      </div>
      <svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" preserveAspectRatio="none">
        <line x1="${padX}" y1="${baseY}" x2="${w - padX}" y2="${baseY}" class="tl-axis"/>
        <line x1="${padX}" y1="${refY}" x2="${w - padX}" y2="${refY}" class="tl-ref"/>
        <text x="${w - padX}" y="${Number(refY) - 3}" class="tl-tick" text-anchor="end">M4 felt</text>
        ${hours}
        ${stems}
        <text x="${padX}" y="${h - 3}" class="tl-tick">24h ago</text>
        <text x="${w - padX}" y="${h - 3}" class="tl-tick" text-anchor="end">now</text>
      </svg>
    </div>
  `;
}

// One derived-insight line: reads as intelligence, not a raw count.
function renderInsight(list) {
  const city = activeCity();
  const nearest = list.reduce((min, q) => {
    const d = fromCity(q.lat, q.lon, city).km;
    return !min || d < min.km ? { km: d, q } : min;
  }, null);
  const strongest = list.reduce((max, q) => (!max || q.mag > max.mag ? q : max), null);
  const day = list.filter((q) => q.time >= Date.now() - 86400000).length;

  const stats = [
    { k: 'in range', v: String(list.length) },
    nearest && { k: 'nearest', v: `${nearest.km} km` },
    // The peak figure carries its own severity colour — the one number
    // here that means something different at M3 than at M6.
    strongest && { k: 'strongest', v: `M${strongest.mag.toFixed(1)}`, tone: magBand(strongest.mag).color },
    { k: 'last 24h', v: String(day) },
  ].filter(Boolean);

  return `
    <dl class="insight" aria-label="Seismic summary">
      ${stats.map((s) => `
        <div${s.tone ? ` class="insight--toned" style="--tile:${s.tone}"` : ''}>
          <dt>${s.k}</dt><dd>${escHtml(s.v)}</dd>
        </div>`).join('')}
    </dl>
  `;
}

function renderHeadline(q) {
  const city = activeCity();
  const band = magBand(q.mag);
  const rel = fromCity(q.lat, q.lon, city);
  const impact = cityImpact(q.mag, rel.km, city);
  const badge = impact.felt
    ? `<span class="felt-badge felt-badge--${impact.level}">
         <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11Z"/><circle cx="12" cy="10" r="2.5"/></svg>
         ${escHtml(impact.label)}
       </span>`
    : '';
  return `
    <div class="quake-headline" style="--band:${band.color};--ring:${band.ring}">
      ${magDial(q.mag)}
      <div class="quake-headline__meta">
        <span class="quake-band">${band.label}</span>
        <p class="quake-place">${escHtml(q.place)}</p>
        <p class="quake-sub">
          ${rel.km} km ${rel.compass} of centre &middot; ${q.depth} km deep &middot;
          <time datetime="${new Date(q.time).toISOString()}">${timeAgo(q.time)}</time>
        </p>
        ${badge}
      </div>
    </div>
  `;
}

// Top of the dial's scale. Chile's instrumental record tops out just
// under M10, but an M8 ring keeps the everyday M3–M6 range readable.
const MAG_DIAL_MAX = 8;

// Magnitude dial: the reading is the arc, not just the number. Text is
// placed in SVG user space so the numeral is centred on the circle's own
// axis — the unit glyph can never shove it off-centre.
function magDial(mag) {
  const size = 92;
  const c = size / 2;
  const r = 35;
  const circ = 2 * Math.PI * r;
  const frac = Math.min(Math.max(mag, 0) / MAG_DIAL_MAX, 1);

  const ticks = [4, 5, 6].map((m) => {
    const a = (m / MAG_DIAL_MAX) * 2 * Math.PI - Math.PI / 2;
    return `<line x1="${(c + (r - 6) * Math.cos(a)).toFixed(1)}" y1="${(c + (r - 6) * Math.sin(a)).toFixed(1)}"
      x2="${(c + (r + 6) * Math.cos(a)).toFixed(1)}" y2="${(c + (r + 6) * Math.sin(a)).toFixed(1)}"
      class="mag-dial__tick"/>`;
  }).join('');

  return `
    <svg class="mag-dial" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}"
      role="img" aria-label="Magnitude ${mag.toFixed(1)} of ${MAG_DIAL_MAX}">
      <circle class="mag-dial__well" cx="${c}" cy="${c}" r="${r}"/>
      <circle class="mag-dial__track" cx="${c}" cy="${c}" r="${r}"/>
      ${ticks}
      <circle class="mag-dial__arc" cx="${c}" cy="${c}" r="${r}"
        stroke-dasharray="${(circ * frac).toFixed(1)} ${circ.toFixed(1)}"
        transform="rotate(-90 ${c} ${c})"/>
      <text class="mag-dial__num" x="${c}" y="${c - 3}" text-anchor="middle" dominant-baseline="central">${mag.toFixed(1)}</text>
      <text class="mag-dial__unit" x="${c}" y="${c + 19}" text-anchor="middle" dominant-baseline="central">M</text>
    </svg>`;
}

function renderRow(q) {
  const city = activeCity();
  const band = magBand(q.mag);
  const rel = fromCity(q.lat, q.lon, city);
  const impact = cityImpact(q.mag, rel.km, city);
  const tag = q.url
    ? `<a class="quake-row__link" href="${escHtml(q.url)}" target="_blank" rel="noopener noreferrer" aria-label="Open event details">↗</a>`
    : '';
  const feltDot = impact.felt
    ? `<span class="quake-row__felt" title="${escHtml(impact.label)}" aria-label="${escHtml(impact.label)}"></span>`
    : '';
  return `
    <li class="quake-row${impact.felt ? ' quake-row--felt' : ''}">
      <span class="quake-chip" style="--band:${band.color}">${q.mag.toFixed(1)}</span>
      <span class="quake-row__body">
        <span class="quake-row__place">${feltDot}${escHtml(q.place)}</span>
        <span class="quake-row__meta">${rel.km} km ${rel.compass} &middot; ${q.depth} km &middot; ${cityTime(q.time)} &middot; ${q.source}</span>
      </span>
      <span class="quake-row__ago"><time datetime="${new Date(q.time).toISOString()}">${timeAgo(q.time)}</time></span>
      ${tag}
    </li>
  `;
}

function skeleton() {
  return `
    <div class="quake-headline skeleton-block">
      <div class="skeleton" style="width:76px;height:76px;border-radius:50%"></div>
      <div style="flex:1"><div class="skeleton" style="height:14px;width:60%;margin-bottom:10px"></div>
      <div class="skeleton" style="height:12px;width:80%"></div></div>
    </div>
    <div class="skeleton" style="height:310px;width:310px;border-radius:50%;margin:0 auto"></div>
  `;
}

function errorState(msg) {
  return `<p class="panel-error">${escHtml(msg)}</p>`;
}
