// ── State management ─────────────────────────────────────────
// One shared mutable object. Data slices hold the latest payloads
// from each source; `prefs` persists to localStorage.

import { CITIES, DEFAULT_CITY, cityById } from './config.js';

const STORAGE_KEY = 'radar-v1';

/** Fresh, empty data slices: used at boot and whenever the city changes,
 *  so a new city never inherits the previous one's readings. */
function emptySlices() {
  return {
    quakes: { items: [], status: 'idle', updated: null },
    weather: { current: null, daily: [], hourly: [], air: null, status: 'idle', updated: null },
    transport: { lines: [], notes: [], status: 'idle', updated: null, source: null },
    feed: { items: [], status: 'idle', updated: null },
  };
}

export const state = {
  // Live data slices — empty until first fetch resolves.
  ...emptySlices(),

  // Session flags.
  lastSync: null,
  minMag: 2.5,

  // Persisted preferences.
  prefs: {
    city: DEFAULT_CITY,  // key into CITIES; the board centres here
    tempUnit: 'C',       // 'C' | 'F'
    hourlyOpen: false,   // collapsible hourly forecast open/closed
  },
};

/** The city the board is centred on. Always a real table entry: an
 *  unknown saved id falls back to the default rather than a blank board. */
export function activeCity() {
  return cityById(state.prefs.city) || CITIES[DEFAULT_CITY];
}

/** Load persisted prefs from localStorage, then let `?city=` in the URL
 *  override the saved city so a link to a board is shareable. */
export function loadSaved(s, search = location.search) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      if (saved.prefs) Object.assign(s.prefs, saved.prefs);
      if (typeof saved.minMag === 'number') s.minMag = saved.minMag;
    }
  } catch { /* ignore corrupted data */ }
  const fromUrl = new URLSearchParams(search).get('city');
  if (cityById(fromUrl)) s.prefs.city = fromUrl;
  if (!cityById(s.prefs.city)) s.prefs.city = DEFAULT_CITY;
}

/** Switch the board to another city: persist, clear every data slice,
 *  and reflect it in the URL (the default city carries no parameter).
 *  Returns false when the id is unknown or already active. */
export function setCity(s, id) {
  if (!cityById(id) || id === s.prefs.city) return false;
  s.prefs.city = id;
  s.lastSync = null;
  Object.assign(s, emptySlices());
  save(s);
  try {
    const url = new URL(location.href);
    if (id === DEFAULT_CITY) url.searchParams.delete('city');
    else url.searchParams.set('city', id);
    history.replaceState(null, '', url);
  } catch { /* history API unavailable: the pref still persists */ }
  return true;
}

/** Persist prefs + filter to localStorage. */
export function save(s) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ prefs: s.prefs, minMag: s.minMag })
    );
  } catch { /* quota exceeded or private browsing */ }
}
