// ── Sync engine ──────────────────────────────────────────────
// Fires all data sources concurrently. Each one repaints its own
// panel the moment it resolves, so the board fills progressively
// instead of waiting on the slowest feed.

import { state, save } from './state.js';
import { fetchQuakes, fetchWeather, fetchAir, fetchTransport, fetchFeed } from './api.js';
import { renderPanel, updateSyncLabel } from './render.js';
import { showToast } from './utils.js';

let inFlight = false;

/** Run one full sync cycle across every source. */
export async function syncAll({ toast = false } = {}) {
  if (inFlight) return;
  inFlight = true;
  markLoading();

  const jobs = [
    (async () => {
      const res = await fetchQuakes();
      state.quakes.items = res.items;
      state.quakes.status = res.error && !res.items.length ? 'error' : 'ok';
      state.quakes.updated = Date.now();
      renderPanel('quakes');
    })(),
    (async () => {
      const [wx, air] = await Promise.all([fetchWeather(), fetchAir()]);
      state.weather.current = wx.current;
      state.weather.daily = wx.daily;
      state.weather.hourly = wx.hourly;
      state.weather.air = air;
      state.weather.status = wx.error && !wx.current ? 'error' : 'ok';
      state.weather.updated = Date.now();
      renderPanel('weather');
    })(),
    (async () => {
      const t = await fetchTransport();
      state.transport.lines = t.lines;
      state.transport.notes = t.notes;
      state.transport.source = t.source;
      state.transport.status = t.error ? 'error' : 'ok';
      state.transport.updated = Date.now();
      renderPanel('transport');
    })(),
    (async () => {
      const f = await fetchFeed();
      state.feed.items = f.items;
      state.feed.status = f.error ? 'error' : 'ok';
      state.feed.updated = Date.now();
      renderPanel('feed');
    })(),
  ];

  await Promise.allSettled(jobs);
  state.lastSync = Date.now();
  save(state);
  updateSyncLabel();
  inFlight = false;
  if (toast) showToast('Board synced');
}

function markLoading() {
  for (const key of ['quakes', 'weather', 'transport', 'feed']) {
    if (state[key].status === 'idle') {
      state[key].status = 'loading';
      renderPanel(key);
    }
  }
}
