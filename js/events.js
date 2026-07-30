// ── Event handlers ───────────────────────────────────────────
// Wires the controls: manual sync, magnitude filter, unit toggle,
// keyboard shortcuts, auto-refresh, and the ticking clock.

import { state, save } from './state.js';
import { $, showToast } from './utils.js';
import { render, renderPanel, updateClock, updateSyncLabel } from './render.js';
import { syncAll } from './sync.js';
import { REFRESH_MS } from './config.js';

const MAG_STEPS = [2.5, 3.5, 4.5, 5.5];

export function bindEvents() {
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

function onKeydown(e) {
  // Ignore when typing in a field.
  if (e.target.matches('input, textarea, select')) return;
  const k = e.key.toLowerCase();
  if (k === 'r') {
    e.preventDefault();
    syncAll({ toast: true });
  } else if (k === 'u') {
    e.preventDefault();
    $('unitToggle')?.click();
  } else if (k >= '1' && k <= '4') {
    e.preventDefault();
    state.minMag = MAG_STEPS[Number(k) - 1];
    save(state);
    reflectMagFilter();
    renderPanel('quakes');
  } else if (k === '?') {
    showToast('R sync · U °C/°F · 1-4 magnitude filter');
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
