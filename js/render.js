// ── Render orchestration ─────────────────────────────────────
// Owns the posture ribbon (the war-room status line) and delegates
// each panel body to its domain module. Panels update independently
// so a slow source never blocks the rest of the board.

import { state } from './state.js';
import { $, santiagoTime, timeAgo } from './utils.js';
import { renderQuakes, strongest24h, quakes24h, lastFelt24h } from './quakes.js';
import { renderWeather } from './weather.js';
import { renderTransport, transportRank, disruptedCount } from './transport.js';
import { renderFeed } from './feed.js';

// Overall posture: the single readout a commander glances at first.
// Escalates on strong recent quakes or closed Metro lines.
function computePosture() {
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
    bits.push(`M${felt.mag.toFixed(1)} felt in Santiago ${timeAgo(felt.time)}`);
  } else if (strong) {
    bits.push(`Peak M${strong.mag.toFixed(1)} in 24h`);
  }
  const dc = disruptedCount();
  if (dc > 0) bits.push(`${dc} Metro line${dc > 1 ? 's' : ''} affected`);
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

/** Write a panel body + its meta timestamp. */
function paintPanel(id, html, slice) {
  const body = $(`${id}-body`);
  if (body) body.innerHTML = html;
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

/** Full render — called on load and after each sync. */
export function render(s = state) {
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

/** Live Santiago clock in the header. */
export function updateClock() {
  const el = $('clock');
  if (el) {
    el.textContent = santiagoTime(new Date(), {
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  }
}

/** Sync button label + last-sync stamp. */
export function updateSyncLabel() {
  const el = $('syncStamp');
  if (el) el.textContent = state.lastSync ? `synced ${timeAgo(state.lastSync)}` : 'not synced';
}
