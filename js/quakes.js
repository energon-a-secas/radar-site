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

// How many events the radar plots — one dragon ball per slot, so the
// star patterns stay on-model (1★ through 7★).
const RADAR_SLOTS = 7;

// Prefix for the radar's SVG def ids, shared by the markup that defines
// them and the markup that references them.
const RADAR_UID = 'rdr';

// At and above this magnitude a ball gets the red alert ring — the
// threshold where an event stops being background noise for the city.
const ALERT_MAG = 5.0;

// Clear space a ball keeps from the bezel and from the centre marker.
// The alert ring adds ~6.5 beyond the ball itself, so RIM_PAD covers it.
const RIM_PAD = 9;
const CORE_PAD = 10;

// Star positions in ball-radius units (y grows downward) plus the star's
// own outer radius, following the canonical dragon ball arrangements.
const STAR_LAYOUTS = {
  1: { size: 0.40, at: [[0, 0]] },
  2: { size: 0.34, at: [[-0.30, -0.30], [0.30, 0.30]] },
  3: { size: 0.32, at: [[0, -0.36], [-0.32, 0.26], [0.32, 0.26]] },
  4: { size: 0.30, at: [[-0.31, -0.31], [0.31, -0.31], [-0.31, 0.31], [0.31, 0.31]] },
  5: { size: 0.27, at: [[0, -0.46], [-0.46, -0.02], [0.46, -0.02], [-0.28, 0.44], [0.28, 0.44]] },
  6: { size: 0.25, at: [[0, -0.46], [-0.48, 0], [0, 0], [0.48, 0], [-0.28, 0.46], [0.28, 0.46]] },
  7: { size: 0.24, at: [[-0.28, -0.46], [0.28, -0.46], [-0.50, 0], [0, 0], [0.50, 0], [-0.28, 0.46], [0.28, 0.46]] },
};

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

// Proximity radar: concentric range rings with the seven closest events
// plotted by bearing + log-distance. Each event is a dragon ball whose
// star count is its proximity rank — 1★ nearest, 7★ farthest of the
// seven. Magnitude still reads through ball size and the band-coloured
// halo on events felt in the city. Pure inline SVG, no libraries.
function renderRadar(list) {
  const size = 320;
  const c = size / 2;
  // The dish sits recessed inside a Dragon-Radar style metal bezel.
  const bezelOuter = c - 5;
  const bezelWidth = 15;
  const bezelInner = bezelOuter - bezelWidth;
  const maxR = bezelInner - 4;
  const maxKm = 650;
  const uid = RADAR_UID;

  // Distance for a given normalized ring fraction (log scale) → km label.
  // Rounded to a step the value can actually survive: a flat 50 km step
  // collapsed the inner ring to a meaningless "0".
  const kmAt = (f) => {
    const km = Math.pow(10, f * Math.log10(maxKm + 1)) - 1;
    const step = km < 100 ? 10 : 50;
    return Math.max(step, Math.round(km / step) * step);
  };
  const ringFracs = [0.33, 0.66, 1];

  const nodes = nearestNodes(list, c, maxR, maxKm);

  // Newest of the plotted events drives the sweep hand's resting angle
  // and the ping, so the radar feels "live" and points at fresh activity.
  const newest = nodes.reduce(
    (latest, n) => (!latest || n.q.time > latest.q.time ? n : latest), null
  );
  const sweepDeg = newest ? bearingDeg(newest.q.lat, newest.q.lon) : 0;
  const ping = newest
    ? `<circle cx="${newest.x.toFixed(1)}" cy="${newest.y.toFixed(1)}" r="${newest.ballR.toFixed(1)}"
        fill="none" stroke="${magBand(newest.q.mag).color}" stroke-width="1.6" class="radar-ping"/>`
    : '';

  // Bearing lines run from the core out to each ball at the event's true
  // angle from Santiago, so direction survives even when balls crowd.
  const leaders = nodes.map((n) => {
    const alert = n.q.mag >= ALERT_MAG;
    return `<line x1="${(c + 9 * Math.cos(n.angle)).toFixed(1)}" y1="${(c + 9 * Math.sin(n.angle)).toFixed(1)}"
      x2="${n.x.toFixed(1)}" y2="${n.y.toFixed(1)}"
      class="radar-lead${alert ? ' radar-lead--alert' : ''}"${alert ? ` style="stroke:${magBand(n.q.mag).color}"` : ''}/>`;
  }).join('');

  const balls = nodes.map((n) => {
    const band = magBand(n.q.mag);
    const felt = santiagoImpact(n.q.mag, n.rel.km).felt;
    const cx = n.x.toFixed(1);
    const cy = n.y.toFixed(1);
    let ring = '';
    if (n.q.mag >= ALERT_MAG) {
      ring = `<circle cx="${cx}" cy="${cy}" r="${(n.ballR + 6.5).toFixed(1)}" fill="none" stroke="${band.color}" stroke-width="1" opacity=".3"/>
        <circle cx="${cx}" cy="${cy}" r="${(n.ballR + 3.2).toFixed(1)}" fill="none" stroke="${band.color}" stroke-width="2.2"/>`;
    } else if (felt) {
      ring = `<circle cx="${cx}" cy="${cy}" r="${(n.ballR + 3.4).toFixed(1)}" fill="none" stroke="${band.color}" stroke-width="1.4" opacity=".6"/>`;
    }
    const impact = santiagoImpact(n.q.mag, n.rel.km);
    const label = `${n.stars} star. M${n.q.mag.toFixed(1)} ${n.q.place}, ${n.rel.km} km ${n.rel.compass}${felt ? `, ${impact.label}` : ''}`;
    return `
      <g class="radar-ball" role="img" aria-label="${escHtml(label)}"
        data-stars="${n.stars}" data-mag="${n.q.mag.toFixed(1)}" data-place="${escHtml(n.q.place)}"
        data-km="${n.rel.km}" data-dir="${n.rel.compass}" data-depth="${n.q.depth}"
        data-when="${escHtml(timeAgo(n.q.time))}" data-felt="${escHtml(impact.label)}"
        data-band="${band.color}">
        ${ring}${dragonBall(n.x, n.y, n.ballR, n.stars)}
      </g>`;
  }).join('');

  // Bezel ticks — the engraved detailing that sells the device read.
  // The top slot is left clear for the N marking.
  const bezelMid = bezelInner + bezelWidth / 2;
  const ticks = Array.from({ length: 24 }, (_, i) => {
    if (i === 0) return '';
    const a = ((i * 15) - 90) * Math.PI / 180;
    const major = i % 6 === 0;
    const r1 = bezelInner + 2.5;
    const r2 = bezelInner + (major ? bezelWidth - 3.5 : 5);
    return `<line x1="${(c + r1 * Math.cos(a)).toFixed(1)}" y1="${(c + r1 * Math.sin(a)).toFixed(1)}"
      x2="${(c + r2 * Math.cos(a)).toFixed(1)}" y2="${(c + r2 * Math.sin(a)).toFixed(1)}"
      class="radar-tick${major ? ' radar-tick--major' : ''}"/>`;
  }).join('');

  const rings = ringFracs.map((f) =>
    `<circle cx="${c}" cy="${c}" r="${(maxR * f).toFixed(1)}" class="radar-ring"/>`
  ).join('');

  // Range labels sit just inside each ring on the vertical axis.
  const rangeLabels = ringFracs.map((f) =>
    `<text x="${c + 3}" y="${(c - maxR * f + 9).toFixed(1)}" class="radar-km">${kmAt(f)}</text>`
  ).join('');

  const captionBits = nodes.length > 1
    ? [`${nodes.length} nearest`, `1★ closest → ${nodes.length}★ farthest`]
    : ['Nearest event'];
  if (nodes.some((n) => n.q.mag >= ALERT_MAG)) captionBits.push(`M${ALERT_MAG.toFixed(1)}+ ringed red`);
  captionBits.push('650 km range');
  const caption = captionBits.join(' · ');

  return `
    <div class="radar" role="group" aria-label="Proximity radar of the ${nodes.length} nearest earthquakes centred on Santiago, ranked one star for the closest">
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
          <radialGradient id="${uid}-ball" cx="34%" cy="30%" r="72%">
            <stop offset="0%" stop-color="#ffeeb4"/>
            <stop offset="30%" stop-color="#ffcb54"/>
            <stop offset="70%" stop-color="#f79a1b"/>
            <stop offset="100%" stop-color="#d96b06"/>
          </radialGradient>
          <filter id="${uid}-ball-shadow" x="-40%" y="-40%" width="180%" height="180%">
            <feDropShadow dx="0" dy="1.2" stdDeviation="1.8" flood-color="#000" flood-opacity=".5"/>
          </filter>
          <linearGradient id="${uid}-bezel" x1="0.15" y1="0" x2="0.8" y2="1">
            <stop offset="0%" stop-color="#f4f6f9"/>
            <stop offset="20%" stop-color="#c2c9d3"/>
            <stop offset="44%" stop-color="#7f8895"/>
            <stop offset="62%" stop-color="#cdd4dd"/>
            <stop offset="82%" stop-color="#89929f"/>
            <stop offset="100%" stop-color="#5f6772"/>
          </linearGradient>
        </defs>
        <circle cx="${c}" cy="${c}" r="${bezelMid}" fill="none" stroke="url(#${uid}-bezel)" stroke-width="${bezelWidth}"/>
        <circle cx="${c}" cy="${c}" r="${bezelOuter}" class="radar-bezel-edge"/>
        <circle cx="${c}" cy="${c}" r="${bezelInner}" class="radar-bezel-edge"/>
        ${ticks}
        <circle cx="${c}" cy="${c}" r="${bezelInner}" class="radar-screen"/>
        <circle cx="${c}" cy="${c}" r="${maxR}" fill="url(#${uid}-glow)"/>
        <line x1="${c}" y1="${c - maxR}" x2="${c}" y2="${c + maxR}" class="radar-cross"/>
        <line x1="${c - maxR}" y1="${c}" x2="${c + maxR}" y2="${c}" class="radar-cross"/>
        ${rings}
        <g class="radar-sweep" style="transform-origin:${c}px ${c}px;transform:rotate(${sweepDeg.toFixed(0)}deg)">
          <path d="M${c} ${c} L${c} ${c - maxR} A${maxR} ${maxR} 0 0 1 ${(c + maxR * Math.sin(Math.PI / 4)).toFixed(1)} ${(c - maxR * Math.cos(Math.PI / 4)).toFixed(1)} Z" fill="url(#${uid}-sweep)"/>
        </g>
        ${rangeLabels}
        <text x="${c}" y="${(c - bezelMid + 3.4).toFixed(1)}" class="radar-n" text-anchor="middle">N</text>
        ${leaders}
        <circle cx="${c}" cy="${c}" r="3.5" class="radar-core"/>
        <circle cx="${c}" cy="${c}" r="7" class="radar-core-ring"/>
        ${ping}
        <g filter="url(#${uid}-ball-shadow)">${balls}</g>
      </svg>
      <div class="radar-tip" aria-hidden="true">
        <span class="radar-tip__head"></span>
        <span class="radar-tip__place"></span>
        <span class="radar-tip__meta"></span>
      </div>
      <span class="radar-scale">${caption}</span>
    </div>
  `;
}

/** The closest events, resolved to radar polar coordinates and star ranks. */
function nearestNodes(list, c, maxR, maxKm) {
  const nodes = list
    .map((q) => ({ q, rel: fromSantiago(q.lat, q.lon) }))
    .sort((a, b) => a.rel.km - b.rel.km)
    .slice(0, RADAR_SLOTS)
    .map(({ q, rel }, i) => {
      // log scale keeps near events legible without crowding the core
      const dist = Math.min(rel.km, maxKm);
      return {
        q,
        rel,
        stars: i + 1,
        ballR: 7.5 + Math.min(Math.max(q.mag - 2.5, 0), 4.5) * 1.15,
        angle: ((bearingDeg(q.lat, q.lon) - 90) * Math.PI) / 180,
        radius: (Math.log10(dist + 1) / Math.log10(maxKm + 1)) * maxR,
      };
    });
  return placeNodes(nodes, c, maxR);
}

/** Resolve crowding by sliding a ball along its own bearing to the
 *  nearest free range — outward first, inward once the rim fills up.
 *  The angle from Santiago is never touched, so every ball still sits in
 *  the true direction of its quake; a swarm reads as a chain down one
 *  bearing rather than a pile. Only range gives, and the tooltip and
 *  event list still carry the exact distance. */
function placeNodes(nodes, c, maxR) {
  const minR = 20;
  const maxSlide = maxR - minR;
  nodes.forEach((n, i) => {
    const placed = nodes.slice(0, i);
    const home = n.radius;
    // Bound the ball's *edge*, not its centre, so nothing rides onto the
    // bezel or swallows the core marker.
    const ceiling = maxR - n.ballR - RIM_PAD;
    const floor = Math.max(minR, n.ballR + CORE_PAD);
    const fits = (r) => r >= floor && r <= ceiling
      && placed.every((o) => gapAt(r, n.angle, o) >= n.ballR + o.ballR + 1.5);

    let free = fits(home) ? home : null;
    for (let step = 0.75; free === null && step <= maxSlide; step += 0.75) {
      if (fits(home + step)) free = home + step;
      else if (fits(home - step)) free = home - step;
    }

    n.radius = Math.min(Math.max(free ?? home, floor), Math.max(floor, ceiling));
    n.x = c + n.radius * Math.cos(n.angle);
    n.y = c + n.radius * Math.sin(n.angle);
  });
  return nodes;
}

/** Straight-line distance from a polar point to an already-placed node. */
function gapAt(radius, angle, other) {
  const sq = radius ** 2 + other.radius ** 2
    - 2 * radius * other.radius * Math.cos(angle - other.angle);
  return Math.sqrt(Math.max(0, sq));
}

/** A glassy orange sphere carrying `stars` five-pointed stars. The
 *  highlight sits under the stars so the count stays countable. */
function dragonBall(x, y, r, stars) {
  const layout = STAR_LAYOUTS[stars];
  const gleamX = x - r * 0.42;
  const gleamY = y - r * 0.50;
  const points = layout.at
    .map(([sx, sy]) => `<path class="radar-star" d="${starPath(x + sx * r, y + sy * r, r * layout.size)}"/>`)
    .join('');
  return `<circle class="radar-ball__body" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="url(#${RADAR_UID}-ball)"/>
    <ellipse class="radar-ball__gleam" cx="${gleamX.toFixed(1)}" cy="${gleamY.toFixed(1)}"
      rx="${(r * 0.27).toFixed(1)}" ry="${(r * 0.17).toFixed(1)}"
      transform="rotate(-40 ${gleamX.toFixed(1)} ${gleamY.toFixed(1)})"/>
    ${points}`;
}

/** Path data for a five-pointed star centred at (cx, cy), one point up. */
function starPath(cx, cy, outer) {
  const inner = outer * 0.42;
  let d = '';
  for (let i = 0; i < 10; i++) {
    const radius = i % 2 ? inner : outer;
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    d += `${i ? 'L' : 'M'}${(cx + radius * Math.cos(angle)).toFixed(2)} ${(cy + radius * Math.sin(angle)).toFixed(2)}`;
  }
  return `${d}Z`;
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
    <div class="skeleton" style="height:310px;width:310px;border-radius:50%;margin:0 auto"></div>
  `;
}

function errorState(msg) {
  return `<p class="panel-error">${escHtml(msg)}</p>`;
}
