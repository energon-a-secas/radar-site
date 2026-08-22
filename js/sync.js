// ── Sync engine ──────────────────────────────────────────────
// Fires all data sources concurrently for the active city. Each one
// repaints its own panel the moment it resolves, so the board fills
// progressively instead of waiting on the slowest feed.
//
// A city switch mid-sync starts a new run; the superseded run's
// responses are dropped on arrival so Santiago's readings never land in
// a board that now says Bogotá.

import { state, save, activeCity } from './state.js';
import { fetchQuakes, fetchWeather, fetchAir, fetchTransport, fetchFeed } from './api.js';
import { renderPanel, updateSyncLabel } from './render.js';
import { showToast } from './utils.js';

// The run currently in flight: { city } identity, or null when idle.
let active = null;

/** Run one full sync cycle across every source for the active city. */
export async function syncAll({ toast = false } = {}) {
  const city = activeCity();
  if (active && active.city === city.id) return;   // already syncing this city

  const run = { city: city.id };
  active = run;
  const live = () => active === run;               // a newer run supersedes us
  markLoading();

  const jobs = [
    (async () => {
      const res = await fetchQuakes(city);
      if (!live()) return;
      state.quakes.items = res.items;
      state.quakes.status = res.error && !res.items.length ? 'error' : 'ok';
      state.quakes.updated = Date.now();
      renderPanel('quakes');
    })(),
    (async () => {
      const [wx, air] = await Promise.all([fetchWeather(city), fetchAir(city)]);
      if (!live()) return;
      state.weather.current = wx.current;
      state.weather.daily = wx.daily;
      state.weather.hourly = wx.hourly;
      state.weather.air = air;
      state.weather.status = wx.error && !wx.current ? 'error' : 'ok';
      state.weather.updated = Date.now();
      renderPanel('weather');
    })(),
    (async () => {
      const t = await fetchTransport(city);
      if (!live()) return;
      state.transport.lines = t.lines;
      state.transport.notes = t.notes;
      state.transport.source = t.source;
      state.transport.status = t.error ? 'error' : 'ok';
      state.transport.updated = Date.now();
      renderPanel('transport');
    })(),
    (async () => {
      const f = await fetchFeed(city);
      if (!live()) return;
      state.feed.items = f.items;
      state.feed.status = f.error ? 'error' : 'ok';
      state.feed.updated = Date.now();
      renderPanel('feed');
    })(),
  ];

  await Promise.allSettled(jobs);
  if (!live()) return;                             // a newer run owns the board now
  state.lastSync = Date.now();
  save(state);
  updateSyncLabel();
  active = null;
  if (toast) showToast(`${city.short} board synced`);
}

function markLoading() {
  for (const key of ['quakes', 'weather', 'transport', 'feed']) {
    if (state[key].status === 'idle') {
      state[key].status = 'loading';
      renderPanel(key);
    }
  }
}
