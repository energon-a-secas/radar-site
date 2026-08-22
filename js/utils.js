// Generic helpers come from the DOM Kit (js/neorgon-dom.js, vendored from
// packages/neorgon-ui/dom/). They are re-exported so every existing
// `import { escHtml } from './utils.js'` keeps working.
//
// Do not edit js/neorgon-dom.js. Edit the canonical source and run
// packages/neorgon-ui/sync-dom.sh.
import { escHtml, showToast as kitToast } from './neorgon-dom.js';
export { escHtml };

// ── Shared utilities ─────────────────────────────────────────
// Small, pure helpers used across modules. Anything that depends on
// *where* the board is centred reads the active city, so switching city
// re-points distance, bearing, clock and calendar helpers at once.

import { activeCity } from './state.js';

/** Cached element lookup by ID. */
const _els = {};
export function $(id) {
  return _els[id] || (_els[id] = document.getElementById(id));
}


/** This site's own toast contract, rendered by the kit. */
export function showToast(msg) {
  return kitToast(msg, { id: 'app-toast', className: 'toast',
    visibleClass: 'visible', duration: 2400 });
}


/** Relative time, compact ("4m ago", "2h ago", "3d ago"). */
export function timeAgo(input) {
  const then = input instanceof Date ? input.getTime() : new Date(input).getTime();
  if (!Number.isFinite(then)) return '';
  const secs = Math.round((Date.now() - then) / 1000);
  if (secs < 45) return 'just now';
  if (secs < 90) return '1m ago';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  return `${months}mo ago`;
}

/** Format a time in the active city's timezone. */
export function cityTime(input, opts = { hour: '2-digit', minute: '2-digit' }, city = activeCity()) {
  const d = input instanceof Date ? input : new Date(input);
  try {
    return new Intl.DateTimeFormat('en-GB', { ...opts, timeZone: city.tz }).format(d);
  } catch {
    return d.toISOString().slice(11, 16);
  }
}

/** Great-circle distance in km between two lat/lon points. */
export function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

/** Distance, initial bearing (degrees clockwise from north) and compass
 *  point of a location as seen from the active city's centre. */
export function fromCity(lat, lon, city = activeCity()) {
  const km = haversineKm(city.lat, city.lon, lat, lon);
  const toRad = (x) => (x * Math.PI) / 180;
  const dLon = toRad(lon - city.lon);
  const y = Math.sin(dLon) * Math.cos(toRad(lat));
  const x =
    Math.cos(toRad(city.lat)) * Math.sin(toRad(lat)) -
    Math.sin(toRad(city.lat)) * Math.cos(toRad(lat)) * Math.cos(dLon);
  const bearing = (Math.atan2(y, x) * 180) / Math.PI;
  return { km, bearing, compass: compass(bearing) };
}

/** Bearing degrees → 8-point compass. */
export function compass(deg) {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}

/** Temperature conversion + formatting honoring the unit pref. */
export function fmtTemp(celsius, unit = 'C') {
  if (celsius === null || celsius === undefined || Number.isNaN(celsius)) return '--';
  const v = unit === 'F' ? (celsius * 9) / 5 + 32 : celsius;
  return `${Math.round(v)}°`;
}

/** Weekday label ("Mon") for a 'YYYY-MM-DD' date in the active city's
 *  zone. Anchored at UTC noon so the browser's own zone never shifts it. */
export function weekday(isoDate, city = activeCity()) {
  try {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'short', timeZone: city.tz,
    }).format(new Date(`${isoDate}T12:00:00Z`));
  } catch {
    return isoDate.slice(5);
  }
}

/** True if the ISO date string is today in the active city. */
export function isToday(isoDate, city = activeCity()) {
  const now = new Intl.DateTimeFormat('en-CA', { timeZone: city.tz }).format(new Date());
  return isoDate === now;
}
