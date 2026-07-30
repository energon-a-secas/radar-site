// ── Seismic panel ────────────────────────────────────────────
// Renders the earthquake watch: a headline "latest event" readout,
// a proximity radar, and a chronological strip. Chile sits on the
// Nazca–South American plate boundary, so this is the lead module.

import { magBand, santiagoImpact } from './config.js';
import { state } from './state.js';
import { escHtml, timeAgo, fromSantiago, santiagoTime } from './utils.js';

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

/** Santiago-impact verdict for one event (distance-aware). */
function impactOf(q) {
  return santiagoImpact(q.mag, fromSantiago(q.lat, q.lon).km);
}

/** Most recent event in the last 24h that was felt in the city, or null. */
export function lastFelt24h() {
  const cutoff = Date.now() - 86400000;
  return state.quakes.items
    .filter((q) => q.time >= cutoff && impactOf(q).felt)
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
    return `<p class="panel-empty">No events at or above M${state.minMag.toFixed(1)} in range.</p>`;
  }

  return `
    ${renderHeadline(latest)}
    ${renderInsight(list)}
    ${renderTimeline(list)}
    ${renderRadar(list.slice(0, 12))}
    <ol class="quake-list" aria-label="Recent earthquakes">
      ${list.slice(0, 8).map(renderRow).join('')}
    </ol>
  `;
}

// 24h magnitude timeline: each event a plotted stem, height = magnitude,
// x = time-since (right edge = now). Reads as a heartbeat of the day's
// seismicity and makes clusters obvious. Pure inline SVG.
function renderTimeline(list) {
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
    const felt = santiagoImpact(q.mag, fromSantiago(q.lat, q.lon).km).felt;
    const dot = felt
      ? `<circle cx="${cx}" cy="${cy}" r="4.5" fill="none" stroke="${band.color}" stroke-width="1.4" opacity=".9"/>`
      : '';
    return `<line x1="${cx}" y1="${baseY}" x2="${cx}" y2="${cy}" stroke="${band.color}" stroke-width="2" stroke-linecap="round" opacity=".85"/>
      <circle cx="${cx}" cy="${cy}" r="2.6" fill="${band.color}"><title>M${q.mag.toFixed(1)} · ${timeAgo(q.time)}${felt ? ' · felt in Santiago' : ''}</title></circle>${dot}`;
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
  const nearest = list.reduce((min, q) => {
    const d = fromSantiago(q.lat, q.lon).km;
    return !min || d < min.km ? { km: d, q } : min;
  }, null);
  const strongest = list.reduce((max, q) => (!max || q.mag > max.mag ? q : max), null);
  const day = list.filter((q) => q.time >= Date.now() - 86400000).length;

  const stats = [
    { k: 'in range', v: String(list.length) },
    nearest && { k: 'nearest', v: `${nearest.km} km` },
    strongest && { k: 'strongest', v: `M${strongest.mag.toFixed(1)}` },
    { k: 'last 24h', v: String(day) },
  ].filter(Boolean);

  return `
    <dl class="insight" aria-label="Seismic summary">
      ${stats.map((s) => `<div><dt>${s.k}</dt><dd>${escHtml(s.v)}</dd></div>`).join('')}
    </dl>
  `;
}

function renderHeadline(q) {
  const band = magBand(q.mag);
  const rel = fromSantiago(q.lat, q.lon);
  const impact = santiagoImpact(q.mag, rel.km);
  const badge = impact.felt
    ? `<span class="felt-badge felt-badge--${impact.level}">
         <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11Z"/><circle cx="12" cy="10" r="2.5"/></svg>
         ${escHtml(impact.label)}
       </span>`
    : '';
  return `
    <div class="quake-headline" style="--band:${band.color};--ring:${band.ring}">
      <div class="quake-mag" aria-label="Magnitude ${q.mag.toFixed(1)}">
        <span class="quake-mag__num">${q.mag.toFixed(1)}</span>
        <span class="quake-mag__unit">M</span>
      </div>
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

// Proximity radar: concentric range rings with events plotted by
// bearing + log-distance. Pure inline SVG, no libraries.
function renderRadar(items) {
  const size = 200;
  const c = size / 2;
  const maxR = c - 16;
  const maxKm = 650;
  const uid = 'rdr';

  // Distance for a given normalized ring fraction (log scale) → km label.
  const kmAt = (f) => Math.round((Math.pow(10, f * Math.log10(maxKm + 1)) - 1) / 50) * 50;
  const ringFracs = [0.33, 0.66, 1];

  // Newest event drives the sweep hand's resting angle so the radar
  // feels "live" and points at the latest activity.
  const newest = items[0];
  const sweepDeg = newest ? bearingDeg(newest.lat, newest.lon) : 0;

  const dots = items.map((q, i) => {
    const rel = fromSantiago(q.lat, q.lon);
    const dist = Math.min(rel.km, maxKm);
    // log scale keeps near events legible without crowding the core
    const r = (Math.log10(dist + 1) / Math.log10(maxKm + 1)) * maxR;
    const bearing = bearingDeg(q.lat, q.lon);
    const rad = ((bearing - 90) * Math.PI) / 180;
    const x = c + r * Math.cos(rad);
    const y = c + r * Math.sin(rad);
    const band = magBand(q.mag);
    const dotR = 2.6 + Math.max(0, q.mag - 2) * 1.5;
    const felt = santiagoImpact(q.mag, rel.km).felt;
    // Latest event pings; felt events get a halo ring.
    const halo = felt
      ? `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(dotR + 3).toFixed(1)}" fill="none" stroke="${band.color}" stroke-width="1" opacity=".5"/>`
      : '';
    const ping = i === 0
      ? `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${dotR.toFixed(1)}" fill="none" stroke="${band.color}" stroke-width="1.5" class="radar-ping"/>`
      : '';
    return `${halo}<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${dotR.toFixed(1)}"
      fill="${band.color}" fill-opacity="0.9"><title>M${q.mag.toFixed(1)}, ${escHtml(q.place)} · ${rel.km} km</title></circle>${ping}`;
  }).join('');

  const rings = ringFracs.map((f) =>
    `<circle cx="${c}" cy="${c}" r="${(maxR * f).toFixed(1)}" class="radar-ring"/>`
  ).join('');

  // Range labels sit just inside each ring on the vertical axis.
  const rangeLabels = ringFracs.map((f) =>
    `<text x="${c + 3}" y="${(c - maxR * f + 9).toFixed(1)}" class="radar-km">${kmAt(f)}</text>`
  ).join('');

  return `
    <div class="radar" role="img" aria-label="Proximity radar of nearby earthquakes centred on Santiago">
      <svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
        <defs>
          <radialGradient id="${uid}-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="rgba(0,99,229,.16)"/>
            <stop offset="60%" stop-color="rgba(0,99,229,.05)"/>
            <stop offset="100%" stop-color="rgba(0,99,229,0)"/>
          </radialGradient>
          <linearGradient id="${uid}-sweep" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stop-color="var(--accent-bright)" stop-opacity="0"/>
            <stop offset="100%" stop-color="var(--accent-bright)" stop-opacity=".55"/>
          </linearGradient>
        </defs>
        <circle cx="${c}" cy="${c}" r="${maxR}" fill="url(#${uid}-glow)"/>
        <line x1="${c}" y1="14" x2="${c}" y2="${size - 14}" class="radar-cross"/>
        <line x1="14" y1="${c}" x2="${size - 14}" y2="${c}" class="radar-cross"/>
        ${rings}
        <g class="radar-sweep" style="transform-origin:${c}px ${c}px;transform:rotate(${sweepDeg.toFixed(0)}deg)">
          <path d="M${c} ${c} L${c} ${c - maxR} A${maxR} ${maxR} 0 0 1 ${(c + maxR * Math.sin(Math.PI / 4)).toFixed(1)} ${(c - maxR * Math.cos(Math.PI / 4)).toFixed(1)} Z" fill="url(#${uid}-sweep)"/>
        </g>
        ${rangeLabels}
        <text x="${c}" y="11" class="radar-n" text-anchor="middle">N</text>
        <circle cx="${c}" cy="${c}" r="3.5" class="radar-core"/>
        <circle cx="${c}" cy="${c}" r="7" class="radar-core-ring"/>
        ${dots}
      </svg>
      <span class="radar-scale">650 km range · km rings · centred on Santiago</span>
    </div>
  `;
}

function bearingDeg(lat, lon) {
  const toRad = (x) => (x * Math.PI) / 180;
  const dLon = toRad(lon - -70.6693);
  const y = Math.sin(dLon) * Math.cos(toRad(lat));
  const x =
    Math.cos(toRad(-33.4489)) * Math.sin(toRad(lat)) -
    Math.sin(toRad(-33.4489)) * Math.cos(toRad(lat)) * Math.cos(dLon);
  return (Math.atan2(y, x) * 180) / Math.PI;
}

function renderRow(q) {
  const band = magBand(q.mag);
  const rel = fromSantiago(q.lat, q.lon);
  const impact = santiagoImpact(q.mag, rel.km);
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
        <span class="quake-row__meta">${rel.km} km ${rel.compass} &middot; ${q.depth} km &middot; ${santiagoTime(q.time)} &middot; ${q.source}</span>
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
    <div class="skeleton" style="height:190px;width:190px;border-radius:50%;margin:0 auto"></div>
  `;
}

function errorState(msg) {
  return `<p class="panel-error">${escHtml(msg)}</p>`;
}
