// ── Data layer ───────────────────────────────────────────────
// All network calls live here. Two classes of source:
//   1. Keyless + CORS-friendly → fetched directly (USGS, Open-Meteo).
//   2. Blocked or token-bearing → routed through the Worker
//      (CSN local tremors, Metro status, official alert feeds).
// Every call resolves to data or a typed failure; nothing throws
// past this module, so one dead source never blanks the board.

import {
  USGS_QUERY, WEATHER_URL, AIR_URL, WORKER_URL, workerReady,
} from './config.js';

const TIMEOUT_MS = 9000;

/** fetch + JSON with an abort timeout. Throws on any failure. */
async function getJSON(url, init = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** POST helper for the Worker. */
async function workerPost(path, body) {
  return getJSON(`${WORKER_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
}

// ── Earthquakes ────────────────────────────────────────────
// USGS is the always-on backbone. The Worker (when live) adds the
// Chilean CSN feed, which reports smaller local tremors USGS omits.
export async function fetchQuakes() {
  const out = { items: [], sources: [], error: null };

  try {
    const geo = await getJSON(USGS_QUERY);
    const usgs = (geo.features || []).map((f) => normalizeUSGS(f));
    out.items.push(...usgs);
    out.sources.push('USGS');
  } catch (err) {
    out.error = 'USGS unreachable';
  }

  if (workerReady()) {
    try {
      const csn = await workerPost('/quakes', {});
      const rows = (csn.items || []).map((r) => normalizeCSN(r));
      // Merge, de-duplicating events within ~2 min and 0.4 mag.
      for (const q of rows) {
        const dup = out.items.some(
          (e) => Math.abs(e.time - q.time) < 120000 && Math.abs(e.mag - q.mag) < 0.4
        );
        if (!dup) out.items.push(q);
      }
      out.sources.push('CSN');
    } catch { /* Worker or CSN down — USGS still carries the panel */ }
  }

  out.items.sort((a, b) => b.time - a.time);
  return out;
}

function normalizeUSGS(f) {
  const [lon, lat, depth] = f.geometry?.coordinates || [0, 0, 0];
  return {
    id: `usgs-${f.id}`,
    mag: f.properties?.mag ?? 0,
    place: f.properties?.place || 'Unknown location',
    time: f.properties?.time || Date.now(),
    depth: Math.round(depth || 0),
    lat, lon,
    url: f.properties?.url || '',
    source: 'USGS',
  };
}

function normalizeCSN(r) {
  return {
    id: `csn-${r.id || r.time}`,
    mag: Number(r.mag) || 0,
    place: r.place || 'Chile',
    time: typeof r.time === 'number' ? r.time : new Date(r.time).getTime(),
    depth: Math.round(Number(r.depth) || 0),
    lat: Number(r.lat) || 0,
    lon: Number(r.lon) || 0,
    url: r.url || '',
    source: 'CSN',
  };
}

// ── Weather + air ──────────────────────────────────────────
export async function fetchWeather() {
  const out = { current: null, daily: [], hourly: [], error: null };
  try {
    const w = await getJSON(WEATHER_URL);
    out.current = w.current || null;
    out.daily = (w.daily?.time || []).map((date, i) => ({
      date,
      code: w.daily.weather_code[i],
      max: w.daily.temperature_2m_max[i],
      min: w.daily.temperature_2m_min[i],
      pop: w.daily.precipitation_probability_max[i],
      wind: w.daily.wind_speed_10m_max[i],
      sunrise: w.daily.sunrise[i],
      sunset: w.daily.sunset[i],
    }));
    // Hourly series (next 24h from "now"), for the collapsible curve.
    out.hourly = normalizeHourly(w.hourly);
  } catch {
    out.error = 'Weather unreachable';
  }
  return out;
}

// Open-Meteo returns full local-day hourly arrays; slice to the next
// 24 hours starting at the current hour so the curve reads forward.
function normalizeHourly(hourly) {
  const times = hourly?.time || [];
  if (!times.length) return [];
  const now = Date.now();
  const all = times.map((t, i) => ({
    time: new Date(t).getTime(),
    iso: t,
    temp: hourly.temperature_2m?.[i] ?? null,
    pop: hourly.precipitation_probability?.[i] ?? 0,
    precip: hourly.precipitation?.[i] ?? 0,
    code: hourly.weather_code?.[i] ?? 0,
  }));
  // Find the current hour, then take a 24h forward window.
  let start = all.findIndex((h) => h.time >= now - 3600000);
  if (start < 0) start = 0;
  return all.slice(start, start + 24);
}

export async function fetchAir() {
  try {
    const a = await getJSON(AIR_URL);
    return { aqi: a.current?.us_aqi ?? null, pm25: a.current?.pm2_5 ?? null };
  } catch {
    return { aqi: null, pm25: null };
  }
}

// ── Transport (Metro) ──────────────────────────────────────
// No official API — the Worker scrapes metro.cl's status page.
// Without the Worker we return the static line map with unknown state.
export async function fetchTransport() {
  if (!workerReady()) {
    return { lines: [], notes: [], source: null, error: null };
  }
  try {
    const t = await workerPost('/metro', {});
    return {
      lines: t.lines || [],
      notes: t.notes || [],
      source: t.source || 'metro.cl',
      error: null,
    };
  } catch {
    return { lines: [], notes: [], source: null, error: 'Metro status unreachable' };
  }
}

// ── Official alert feed ────────────────────────────────────
// CSN seismology + SENAPRED emergency + Meteorología, aggregated
// by the Worker into a single reverse-chronological feed.
export async function fetchFeed() {
  if (!workerReady()) {
    return { items: [], error: null };
  }
  try {
    const f = await workerPost('/feed', {});
    return { items: f.items || [], error: null };
  } catch {
    return { items: [], error: 'Alert feed unreachable' };
  }
}
