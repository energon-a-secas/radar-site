// ── Data layer ───────────────────────────────────────────────
// All network calls live here. Two classes of source:
//   1. Keyless + CORS-friendly → fetched directly (USGS, Open-Meteo).
//   2. Blocked or token-bearing → routed through the Worker
//      (CSN local tremors, Metro status, official alert feeds).
// Every fetcher takes the city it is fetching for, so a city switch
// mid-flight cannot re-point a request, and the Worker is only asked for
// sources the city's table entry declares live: the client, not the
// proxy, decides that Bogotá never receives Santiago's Metro board.
// Every call resolves to data or a typed failure; nothing throws past
// this module, so one dead source never blanks the board.

import {
  usgsQuery, weatherUrl, airUrl, WORKER_URL, workerReady,
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

/** POST helper for the Worker. Every call names the city so the proxy
 *  can route to that city's sources (and refuse cities it has none for). */
async function workerPost(path, city, body) {
  return getJSON(`${WORKER_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ city: city.id, ...(body || {}) }),
  });
}

// ── Earthquakes ────────────────────────────────────────────
// USGS is the always-on backbone. Where the city declares a local
// network (Santiago: CSN) the Worker adds it, which reports smaller
// local tremors USGS omits.
export async function fetchQuakes(city) {
  const out = { items: [], sources: [], error: null };

  try {
    const geo = await getJSON(usgsQuery(city));
    const usgs = (geo.features || []).map((f) => normalizeUSGS(f));
    out.items.push(...usgs);
    out.sources.push('USGS');
  } catch (err) {
    out.error = 'USGS unreachable';
  }

  if (workerReady() && city.localNetwork) {
    try {
      const local = await workerPost('/quakes', city);
      const rows = (local.items || []).map((r) => normalizeLocal(r, city.localNetwork));
      // Merge, de-duplicating events within ~2 min and 0.4 mag.
      for (const q of rows) {
        const dup = out.items.some(
          (e) => Math.abs(e.time - q.time) < 120000 && Math.abs(e.mag - q.mag) < 0.4
        );
        if (!dup) out.items.push(q);
      }
      out.sources.push(city.localNetwork);
    } catch { /* Worker or local network down; USGS still carries the panel */ }
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

function normalizeLocal(r, network) {
  return {
    id: `${network.toLowerCase()}-${r.id || r.time}`,
    mag: Number(r.mag) || 0,
    place: r.place || network,
    time: typeof r.time === 'number' ? r.time : new Date(r.time).getTime(),
    depth: Math.round(Number(r.depth) || 0),
    lat: Number(r.lat) || 0,
    lon: Number(r.lon) || 0,
    url: r.url || '',
    source: network,
  };
}

// ── Weather + air ──────────────────────────────────────────
// Open-Meteo is asked for unix epochs (see weatherUrl), so every instant
// here is epoch ms and the city's zone is applied only when formatting.
// A day's calendar date is read from its local midnight in the city's
// zone, never from the browser's.
export async function fetchWeather(city) {
  const out = { current: null, daily: [], hourly: [], error: null };
  try {
    const w = await getJSON(weatherUrl(city));
    out.current = w.current || null;
    out.daily = (w.daily?.time || []).map((t, i) => ({
      date: localDate(t * 1000, city),
      code: w.daily.weather_code[i],
      max: w.daily.temperature_2m_max[i],
      min: w.daily.temperature_2m_min[i],
      pop: w.daily.precipitation_probability_max[i],
      wind: w.daily.wind_speed_10m_max[i],
      sunrise: w.daily.sunrise[i] * 1000,
      sunset: w.daily.sunset[i] * 1000,
    }));
    // Hourly series (next 24h from "now"), for the collapsible curve.
    out.hourly = normalizeHourly(w.hourly);
  } catch {
    out.error = 'Weather unreachable';
  }
  return out;
}

/** 'YYYY-MM-DD' of an instant in the city's zone. */
function localDate(epochMs, city) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: city.tz }).format(new Date(epochMs));
  } catch {
    return new Date(epochMs).toISOString().slice(0, 10);
  }
}

// Open-Meteo returns full local-day hourly arrays; slice to the next
// 24 hours starting at the current hour so the curve reads forward.
function normalizeHourly(hourly) {
  const times = hourly?.time || [];
  if (!times.length) return [];
  const now = Date.now();
  const all = times.map((t, i) => ({
    time: t * 1000,
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

export async function fetchAir(city) {
  try {
    const a = await getJSON(airUrl(city));
    return { aqi: a.current?.us_aqi ?? null, pm25: a.current?.pm2_5 ?? null };
  } catch {
    return { aqi: null, pm25: null };
  }
}

// ── Transport (metro / subte) ──────────────────────────────
// Only cities whose transit entry names a live source are asked; for
// the rest the static line list renders for reference and `live` is
// false so the panel can say why there is no status.
export async function fetchTransport(city) {
  const live = Boolean(workerReady() && city.transit?.live);
  if (!live) {
    return { lines: [], notes: [], source: null, error: null, live: false };
  }
  try {
    const t = await workerPost('/metro', city);
    return {
      lines: t.lines || [],
      notes: t.notes || [],
      source: t.source || city.transit.live,
      error: null,
      live: true,
    };
  } catch {
    return { lines: [], notes: [], source: null, error: 'Metro status unreachable', live: true };
  }
}

// ── Official alert feed ────────────────────────────────────
// The Worker aggregates a city's official authorities into one
// reverse-chronological feed, for the cities where that is wired.
export async function fetchFeed(city) {
  const live = Boolean(workerReady() && city.alerts?.live);
  if (!live) {
    return { items: [], error: null, live: false };
  }
  try {
    const f = await workerPost('/feed', city);
    return { items: f.items || [], error: null, live: true };
  } catch {
    return { items: [], error: 'Alert feed unreachable', live: true };
  }
}
