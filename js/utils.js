// ── Shared utilities ─────────────────────────────────────────
// Small, pure helpers used across modules.

import { SANTIAGO } from './config.js';

/** Cached element lookup by ID. */
const _els = {};
export function $(id) {
  return _els[id] || (_els[id] = document.getElementById(id));
}

/** Escape HTML special characters for text content. */
export function escHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Show a temporary toast notification. */
let _toastTimer = null;
export function showToast(msg) {
  let el = document.getElementById('app-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'app-toast';
    el.className = 'toast';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('visible');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('visible'), 2400);
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

/** Format a time in Santiago's timezone. */
export function santiagoTime(input, opts = { hour: '2-digit', minute: '2-digit' }) {
  const d = input instanceof Date ? input : new Date(input);
  try {
    return new Intl.DateTimeFormat('en-GB', { ...opts, timeZone: SANTIAGO.tz }).format(d);
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

/** Distance + bearing of a point from Santiago's centre. */
export function fromSantiago(lat, lon) {
  const km = haversineKm(SANTIAGO.lat, SANTIAGO.lon, lat, lon);
  const toRad = (x) => (x * Math.PI) / 180;
  const dLon = toRad(lon - SANTIAGO.lon);
  const y = Math.sin(dLon) * Math.cos(toRad(lat));
  const x =
    Math.cos(toRad(SANTIAGO.lat)) * Math.sin(toRad(lat)) -
    Math.sin(toRad(SANTIAGO.lat)) * Math.cos(toRad(lat)) * Math.cos(dLon);
  const brng = (Math.atan2(y, x) * 180) / Math.PI;
  return { km, compass: compass(brng) };
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

/** Weekday label ("Mon") for an ISO date, in Santiago tz. */
export function weekday(isoDate) {
  try {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'short', timeZone: SANTIAGO.tz,
    }).format(new Date(`${isoDate}T12:00:00`));
  } catch {
    return isoDate.slice(5);
  }
}

/** True if the ISO date string is today in Santiago. */
export function isToday(isoDate) {
  const now = new Intl.DateTimeFormat('en-CA', { timeZone: SANTIAGO.tz }).format(new Date());
  return isoDate === now;
}
