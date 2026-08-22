// ── Render orchestration ─────────────────────────────────────
// Owns the posture ribbon (the war-room status line), the city chrome
// (title, header subtitle, clock zone, selector) and delegates each
// panel body to its domain module. Panels update independently so a
// slow source never blocks the rest of the board.

import { state, activeCity } from './state.js';
import { $, cityTime, timeAgo } from './utils.js';
import { renderQuakes, strongest24h, quakes24h, lastFelt24h } from './quakes.js';
import { syncSweepPhase } from './radar.js';
import { renderWeather } from './weather.js';
import { renderTransport, transportRank, disruptedCount } from './transport.js';
import { renderFeed } from './feed.js';

// Overall posture: the single readout a commander glances at first.
// Escalates on strong recent quakes or closed metro lines.
function computePosture() {
  const city = activeCity();
  const strong = strongest24h();
  const felt = lastFelt24h();
  const tRank = transportRank();
  let level = 'nominal';

  const bigMag = strong ? strong.mag : 0;
  // A quake actually felt in the city escalates on its own — that's the
  // signal a resident cares about, not just a distant peak magnitude.
  if (bigMag >= 5.5 || tRank >= 2 || (felt && felt.mag >= 5)) {
    level = 'critical';
  } else if (bigMag >= 4.5 || tRank >= 1 || felt) {
    level = 'elevated';
  }

  const bits = [];
  if (felt) {
    bits.push(`M${felt.mag.toFixed(1)} felt in ${city.short} ${timeAgo(felt.time)}`);
  } else if (strong) {
    bits.push(`Peak M${strong.mag.toFixed(1)} in 24h`);
  }
  const dc = disruptedCount();
  if (dc > 0) {
    const noun = city.transit?.label === 'Subte lines' ? 'Subte' : 'Metro';
    bits.push(`${dc} ${noun} line${dc > 1 ? 's' : ''} affected`);
  }
  const line = bits.length ? bits.join(' · ') : 'All systems nominal';

  return { level, line };
}

const POSTURE_LABEL = {
  nominal: 'NOMINAL',
  elevated: 'ELEVATED',
  critical: 'CRITICAL',
};

/** Update the posture ribbon in place. */
export function renderPosture() {
  const el = $('posture');
  if (!el) return;
  const p = computePosture();
  el.dataset.level = p.level;
  el.innerHTML = `
    <span class="posture__badge">
      <span class="posture__pulse" aria-hidden="true"></span>${POSTURE_LABEL[p.level]}
    </span>
    <span class="posture__line">${p.line}</span>
    <span class="posture__stat">${quakes24h()} events / 24h</span>
  `;
}

/** Everything outside the panels that names the city: document title,
 *  header subtitle, clock zone, the selector's value and the transport
 *  panel's heading. Cheap and idempotent, so it runs on every render. */
export function renderCityChrome() {
  const city = activeCity();
  document.title = `Radar | ${city.short} Situation Board`;
  const sub = document.querySelector('.header-subtitle');
  if (sub) sub.textContent = `${city.short} situation board`;
  const zone = $('clockZone');
  if (zone) zone.textContent = city.short;
  const sel = $('citySelect');
  if (sel && sel.value !== city.id) sel.value = city.id;
  const transportTitle = $('transport-title');
  if (transportTitle) transportTitle.textContent = city.transit?.label || 'Transit';
}

/** Write a panel body + its meta timestamp. */
function paintPanel(id, html, slice) {
  const body = $(`${id}-body`);
  if (body) {
    body.innerHTML = html;
    // The radar's sweep must not restart with every repaint.
    if (id === 'quakes') syncSweepPhase(body);
  }
  const meta = $(`${id}-meta`);
  if (meta) {
    if (slice?.status === 'error') {
      meta.textContent = 'stale';
      meta.dataset.tone = 'error';
    } else if (slice?.updated) {
      meta.textContent = timeAgo(slice.updated);
      meta.dataset.tone = 'ok';
    } else {
      meta.textContent = '';
      meta.dataset.tone = 'idle';
    }
  }
}

/** Full render: called on load, after each sync, and on a city switch. */
export function render(s = state) {
  renderCityChrome();
  renderPosture();
  paintPanel('quakes', renderQuakes(), s.quakes);
  paintPanel('weather', renderWeather(), s.weather);
  paintPanel('transport', renderTransport(), s.transport);
  paintPanel('feed', renderFeed(), s.feed);
  updateClock();
  updateSyncLabel();
}

/** Repaint one panel by name (used as each fetch resolves). */
export function renderPanel(name) {
  const map = {
    quakes: () => paintPanel('quakes', renderQuakes(), state.quakes),
    weather: () => paintPanel('weather', renderWeather(), state.weather),
    transport: () => paintPanel('transport', renderTransport(), state.transport),
    feed: () => paintPanel('feed', renderFeed(), state.feed),
  };
  map[name]?.();
  renderPosture();
}

/** Live clock in the header, on the active city's time. */
export function updateClock() {
  const el = $('clock');
  if (el) {
    el.textContent = cityTime(new Date(), {
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  }
}

/** Sync button label + last-sync stamp. */
export function updateSyncLabel() {
  const el = $('syncStamp');
  if (el) el.textContent = state.lastSync ? `synced ${timeAgo(state.lastSync)}` : 'not synced';
}
