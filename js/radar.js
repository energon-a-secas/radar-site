// ── Proximity radar ──────────────────────────────────────────
// The Dragon Radar: concentric range rings recessed inside a brushed-metal
// bezel, the seven closest events plotted by bearing + log-distance as
// dragon balls (star count = proximity rank, 1★ nearest), a sweep hand,
// and a ping on the newest event. Centred on the active city. Split out
// of quakes.js so the seismic panel stays inside the fleet's ~500-line
// module guideline. Pure inline SVG, no libraries.

import { magBand, cityImpact } from './config.js';
import { activeCity } from './state.js';
import { escHtml, timeAgo, fromCity } from './utils.js';

// How many events the radar plots: one dragon ball per slot, so the
// star patterns stay on-model (1★ through 7★).
const RADAR_SLOTS = 7;

// Prefix for the radar's SVG def ids, shared by the markup that defines
// them and the markup that references them.
const RADAR_UID = 'rdr';

// One full turn of the sweep hand. Every sweep animation is pinned to the
// document timeline's origin (see syncSweepPhase), so the hand's phase is
// a function of time alone: continuous across the 30 s repaint and the
// 2 min sync instead of restarting with every rebuilt SVG.
const SWEEP_MS = 8000;

/** Pin every sweep animation under `root` to the document timeline's
 *  origin. A CSS animation otherwise starts at the first frame after its
 *  element appears, which (a) restarts the round on every rebuilt radar
 *  and (b) in a hidden tab can be seconds after the markup was written,
 *  so even a negative animation-delay computed at build time drifts.
 *  With startTime = 0 the phase is timeline time modulo the period for
 *  every radar ever built. Call after the seismic panel is painted. */
export function syncSweepPhase(root = document) {
  root.querySelectorAll('.radar-sweep').forEach((el) => {
    if (typeof el.getAnimations !== 'function') return;
    el.getAnimations().forEach((a) => { a.startTime = 0; });
  });
}

// At and above this magnitude a ball gets the red alert ring, the
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

/** The radar for a list of events, centred on the active city. */
export function renderRadar(list) {
  const city = activeCity();
  const size = 320;
  const c = size / 2;
  // The dish sits recessed inside a Dragon-Radar style metal bezel.
  const bezelOuter = c - 5;
  const bezelWidth = 15;
  const bezelInner = bezelOuter - bezelWidth;
  const maxR = bezelInner - 4;
  const maxKm = city.radiusKm;
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

  const nodes = nearestNodes(list, c, maxR, maxKm, city);

  // Newest of the plotted events sets where the sweep's round begins (and
  // where the hand rests under prefers-reduced-motion) and gets the ping,
  // so the radar points at fresh activity.
  const newest = nodes.reduce(
    (latest, n) => (!latest || n.q.time > latest.q.time ? n : latest), null
  );
  const sweepDeg = newest ? newest.rel.bearing : 0;
  const ping = newest
    ? `<circle cx="${newest.x.toFixed(1)}" cy="${newest.y.toFixed(1)}" r="${newest.ballR.toFixed(1)}"
        fill="none" stroke="${magBand(newest.q.mag).color}" stroke-width="1.6" class="radar-ping"/>`
    : '';

  // Bearing lines run from the core out to each ball at the event's true
  // angle from the city, so direction survives even when balls crowd.
  const leaders = nodes.map((n) => {
    const alert = n.q.mag >= ALERT_MAG;
    return `<line x1="${(c + 9 * Math.cos(n.angle)).toFixed(1)}" y1="${(c + 9 * Math.sin(n.angle)).toFixed(1)}"
      x2="${n.x.toFixed(1)}" y2="${n.y.toFixed(1)}"
      class="radar-lead${alert ? ' radar-lead--alert' : ''}"${alert ? ` style="stroke:${magBand(n.q.mag).color}"` : ''}/>`;
  }).join('');

  const balls = nodes.map((n) => {
    const band = magBand(n.q.mag);
    const impact = cityImpact(n.q.mag, n.rel.km, city);
    const felt = impact.felt;
    const cx = n.x.toFixed(1);
    const cy = n.y.toFixed(1);
    let ring = '';
    if (n.q.mag >= ALERT_MAG) {
      ring = `<circle cx="${cx}" cy="${cy}" r="${(n.ballR + 6.5).toFixed(1)}" fill="none" stroke="${band.color}" stroke-width="1" opacity=".3"/>
        <circle cx="${cx}" cy="${cy}" r="${(n.ballR + 3.2).toFixed(1)}" fill="none" stroke="${band.color}" stroke-width="2.2"/>`;
    } else if (felt) {
      ring = `<circle cx="${cx}" cy="${cy}" r="${(n.ballR + 3.4).toFixed(1)}" fill="none" stroke="${band.color}" stroke-width="1.4" opacity=".6"/>`;
    }
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

  // Bezel ticks: the engraved detailing that sells the device read.
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
  captionBits.push(`${maxKm} km range`);
  const caption = captionBits.join(' · ');

  return `
    <div class="radar" role="group" aria-label="Proximity radar of the ${nodes.length} nearest earthquakes centred on ${escHtml(city.short)}, ranked one star for the closest">
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
        <g class="radar-sweep" style="transform-origin:${c}px ${c}px;--sweep-from:${sweepDeg.toFixed(0)}deg;--sweep-period:${SWEEP_MS}ms">
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
function nearestNodes(list, c, maxR, maxKm, city) {
  const nodes = list
    .map((q) => ({ q, rel: fromCity(q.lat, q.lon, city) }))
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
        angle: ((rel.bearing - 90) * Math.PI) / 180,
        radius: (Math.log10(dist + 1) / Math.log10(maxKm + 1)) * maxR,
      };
    });
  return placeNodes(nodes, c, maxR);
}

/** Resolve crowding by sliding a ball along its own bearing to the
 *  nearest free range, outward first, inward once the rim fills up.
 *  The angle from the city is never touched, so every ball still sits in
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
