// ── Event handlers ───────────────────────────────────────────
// Wires the controls: city selector, manual sync, magnitude filter,
// unit toggle, keyboard shortcuts, auto-refresh, and the ticking clock.

import { state, save, setCity, activeCity } from './state.js';
import { $, escHtml, showToast } from './utils.js';
import { render, renderPanel, updateClock } from './render.js';
import { syncAll } from './sync.js';
import { CITIES, REFRESH_MS } from './config.js';

const MAG_STEPS = [2.5, 3.5, 4.5, 5.5];

export function bindEvents() {
  // City selector: options come from the table so the shell never
  // carries a second copy of the city list.
  buildCitySelect();

  // Manual sync.
  $('syncBtn')?.addEventListener('click', () => syncAll({ toast: true }));

  // Magnitude filter chips (event-delegated).
  $('magFilter')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-mag]');
    if (!btn) return;
    state.minMag = Number(btn.dataset.mag);
    save(state);
    reflectMagFilter();
    renderPanel('quakes');
  });

  // Temperature unit toggle.
  $('unitToggle')?.addEventListener('click', () => {
    state.prefs.tempUnit = state.prefs.tempUnit === 'C' ? 'F' : 'C';
    save(state);
    reflectUnit();
    renderPanel('weather');
  });

  // Collapsible hourly forecast (delegated — the button re-renders).
  $('weather-body')?.addEventListener('click', (e) => {
    if (!e.target.closest('#hourlyToggle')) return;
    state.prefs.hourlyOpen = !state.prefs.hourlyOpen;
    save(state);
    renderPanel('weather');
  });

  // Radar hover card (delegated — the radar is rebuilt on every sync).
  $('quakes-body')?.addEventListener('pointerover', onRadarPointerOver);
  $('quakes-body')?.addEventListener('pointerout', onRadarPointerOut);

  // Keyboard shortcuts.
  document.addEventListener('keydown', onKeydown);

  // Re-sync when the tab regains focus after being idle a while.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && staleBy(60000)) {
      syncAll();
    }
  });

  reflectMagFilter();
  reflectUnit();

  // Live clock + relative-time refresh (cheap, no refetch).
  setInterval(updateClock, 1000);
  setInterval(() => { render(); }, 30000);

  // Auto-refresh data.
  setInterval(() => { if (document.visibilityState === 'visible') syncAll(); }, REFRESH_MS);
}

function buildCitySelect() {
  const sel = $('citySelect');
  if (!sel) return;
  sel.innerHTML = Object.values(CITIES)
    .map((c) => `<option value="${c.id}">${escHtml(c.name)}</option>`)
    .join('');
  sel.value = activeCity().id;
  sel.addEventListener('change', () => switchCity(sel.value));
}

/** Re-centre the board: clear the old city's readings, repaint the
 *  chrome and skeletons, and start a sync for the new one. */
function switchCity(id) {
  if (!setCity(state, id)) return;
  render();
  syncAll({ toast: true });
}

function nextCity() {
  const ids = Object.keys(CITIES);
  const i = ids.indexOf(activeCity().id);
  switchCity(ids[(i + 1) % ids.length]);
}

/** Show the event card above the hovered dragon ball. Text is written as
 *  textContent, never markup, so USGS place strings stay inert. */
function onRadarPointerOver(e) {
  const ball = e.target.closest?.('.radar-ball');
  if (!ball) return;
  const radar = ball.closest('.radar');
  const tip = radar?.querySelector('.radar-tip');
  if (!tip) return;

  const d = ball.dataset;
  tip.querySelector('.radar-tip__head').textContent = `${d.stars}★ · M${d.mag}`;
  tip.querySelector('.radar-tip__place').textContent = d.place;
  tip.querySelector('.radar-tip__meta').textContent =
    [`${d.km} km ${d.dir}`, `${d.depth} km deep`, d.when, d.felt].filter(Boolean).join(' · ');
  tip.style.setProperty('--tip-accent', d.band);
  tip.classList.add('is-on');

  const box = ball.getBoundingClientRect();
  const frame = radar.getBoundingClientRect();
  const half = tip.offsetWidth / 2;
  const x = box.left - frame.left + box.width / 2;
  tip.style.left = `${Math.min(Math.max(x, half + 4), frame.width - half - 4)}px`;

  // Flip below the ball when there is no room to sit above it.
  const above = box.top - frame.top - 8;
  const flip = above - tip.offsetHeight < 0;
  tip.classList.toggle('radar-tip--below', flip);
  tip.style.top = flip ? `${box.bottom - frame.top + 8}px` : `${above}px`;
}

function onRadarPointerOut(e) {
  const ball = e.target.closest?.('.radar-ball');
  if (!ball || ball.contains(e.relatedTarget)) return;
  ball.closest('.radar')?.querySelector('.radar-tip')?.classList.remove('is-on');
}

function onKeydown(e) {
  // Ignore when typing in a field.
  if (e.target.matches('input, textarea, select')) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (k === 'r') {
    e.preventDefault();
    syncAll({ toast: true });
  } else if (k === 'u') {
    e.preventDefault();
    $('unitToggle')?.click();
  } else if (k === 'c') {
    e.preventDefault();
    nextCity();
  } else if (k >= '1' && k <= '4') {
    e.preventDefault();
    state.minMag = MAG_STEPS[Number(k) - 1];
    save(state);
    reflectMagFilter();
    renderPanel('quakes');
  } else if (k === '?') {
    showToast('R sync · C next city · U °C/°F · 1-4 magnitude filter');
  }
}

function reflectMagFilter() {
  $('magFilter')?.querySelectorAll('[data-mag]').forEach((b) => {
    const on = Number(b.dataset.mag) === state.minMag;
    b.classList.toggle('is-active', on);
    b.setAttribute('aria-pressed', String(on));
  });
}

function reflectUnit() {
  const btn = $('unitToggle');
  if (btn) {
    btn.textContent = state.prefs.tempUnit === 'C' ? '°C' : '°F';
    btn.setAttribute('aria-label', `Switch to ${state.prefs.tempUnit === 'C' ? 'Fahrenheit' : 'Celsius'}`);
  }
}

function staleBy(ms) {
  return !state.lastSync || Date.now() - state.lastSync > ms;
}
