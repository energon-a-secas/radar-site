// ── State management ─────────────────────────────────────────
// One shared mutable object. Data slices hold the latest payloads
// from each source; `prefs` persists to localStorage.

const STORAGE_KEY = 'radar-v1';

export const state = {
  // Live data slices — empty until first fetch resolves.
  quakes: { items: [], status: 'idle', updated: null },
  weather: { current: null, daily: [], hourly: [], air: null, status: 'idle', updated: null },
  transport: { lines: [], notes: [], status: 'idle', updated: null, source: null },
  feed: { items: [], status: 'idle', updated: null },

  // Session flags.
  lastSync: null,
  minMag: 2.5,

  // Persisted preferences.
  prefs: {
    tempUnit: 'C',       // 'C' | 'F'
    hourlyOpen: false,   // collapsible hourly forecast open/closed
  },
};

/** Load persisted prefs from localStorage. */
export function loadSaved(s) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      if (saved.prefs) Object.assign(s.prefs, saved.prefs);
      if (typeof saved.minMag === 'number') s.minMag = saved.minMag;
    }
  } catch { /* ignore corrupted data */ }
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
