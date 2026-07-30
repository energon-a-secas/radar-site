// ── Configuration ────────────────────────────────────────────
// Static constants for the Santiago war room: coordinates, data
// sources, scales, and reference tables. No secrets live here —
// the Worker holds any tokens server-side.

// Santiago de Chile — Plaza de Armas
export const SANTIAGO = {
  lat: -33.4489,
  lon: -70.6693,
  tz: 'America/Santiago',
  label: 'Santiago de Chile',
};

// Cloudflare Worker proxy. The app runs fully on the keyless client
// sources without it and enriches (local tremors, Metro, alerts)
// through it. See worker/ and README for deploy steps.
export const WORKER_URL = 'https://radar-api.neorgon.workers.dev';

export function workerReady() {
  return !WORKER_URL.startsWith('https://REPLACE');
}

// USGS global feed — reliable for M4.5+, works from the browser.
export const USGS_QUERY =
  'https://earthquake.usgs.gov/fdsnws/event/1/query' +
  `?format=geojson&latitude=${SANTIAGO.lat}&longitude=${SANTIAGO.lon}` +
  '&maxradiuskm=650&minmagnitude=2.5&orderby=time&limit=60';

// Open-Meteo — no key, CORS-friendly, Santiago-local timezone.
export const WEATHER_URL =
  'https://api.open-meteo.com/v1/forecast' +
  `?latitude=${SANTIAGO.lat}&longitude=${SANTIAGO.lon}` +
  '&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,' +
  'precipitation,weather_code,wind_speed_10m,wind_direction_10m,surface_pressure' +
  '&hourly=temperature_2m,precipitation_probability,precipitation,weather_code' +
  '&daily=weather_code,temperature_2m_max,temperature_2m_min,' +
  'precipitation_probability_max,wind_speed_10m_max,sunrise,sunset' +
  `&timezone=${encodeURIComponent(SANTIAGO.tz)}&forecast_days=7`;

// Air quality — Santiago's smog is a genuine daily concern.
export const AIR_URL =
  'https://air-quality-api.open-meteo.com/v1/air-quality' +
  `?latitude=${SANTIAGO.lat}&longitude=${SANTIAGO.lon}` +
  `&current=us_aqi,pm2_5&timezone=${encodeURIComponent(SANTIAGO.tz)}`;

// Auto-refresh cadence (ms). Quakes move fast; weather is slow.
export const REFRESH_MS = 120000; // 2 minutes

// Restrained severity ramp. Sub-perceptible events (< M4) read as a
// single muted stone tone so the eye ignores the noise floor; felt
// events climb one amber→crimson heat axis. Two visual ideas, not a
// rainbow: "background" and "heat".
export const MAG_SCALE = [
  { min: 6.0, label: 'Major',    color: '#dc2626', ring: 'rgba(220,38,38,.42)' },
  { min: 5.0, label: 'Moderate', color: '#ef4444', ring: 'rgba(239,68,68,.34)' },
  { min: 4.0, label: 'Light',    color: '#f59e0b', ring: 'rgba(245,158,11,.28)' },
  { min: 0.0, label: 'Minor',    color: '#8a8f9c', ring: 'rgba(138,143,156,.22)' },
];

export function magBand(mag) {
  const m = Number(mag) || 0;
  return MAG_SCALE.find((b) => m >= b.min) || MAG_SCALE[MAG_SCALE.length - 1];
}

// Would this event have been *felt* in Santiago? A pragmatic
// attenuation heuristic, not a seismological model: shaking carries
// further the stronger the quake, so we scale a "felt radius" off the
// magnitude and compare it to the event's distance from the city.
// Tuned against Chilean subduction events — an M5 is broadly felt
// ~120 km out, an M7 across most of central Chile. Returns a small
// object so callers can show a graded label (felt / lightly felt).
export function santiagoImpact(mag, distanceKm) {
  const m = Number(mag) || 0;
  const km = Number(distanceKm) || 0;
  if (m < 3) return { felt: false, level: 'none', label: '' };
  // Felt radius grows roughly exponentially with magnitude.
  const feltRadius = Math.pow(10, 0.5 * m - 1.0); // M4≈100km, M5≈316km, M6≈1000km
  if (km > feltRadius) return { felt: false, level: 'none', label: '' };
  const ratio = km / feltRadius;
  if (ratio < 0.45 && m >= 4.5) return { felt: true, level: 'strong', label: 'Felt in Santiago' };
  if (ratio < 0.75) return { felt: true, level: 'moderate', label: 'Felt in Santiago' };
  return { felt: true, level: 'light', label: 'Lightly felt in Santiago' };
}

// US AQI bands (Open-Meteo returns the US scale).
export const AQI_BANDS = [
  { min: 301, label: 'Hazardous',      color: '#7e1946' },
  { min: 201, label: 'Very unhealthy', color: '#8b5cf6' },
  { min: 151, label: 'Unhealthy',      color: '#dc2626' },
  { min: 101, label: 'For groups',     color: '#f97316' },
  { min: 51,  label: 'Moderate',       color: '#eab308' },
  { min: 0,   label: 'Good',           color: '#22c55e' },
];

export function aqiBand(aqi) {
  const a = Number(aqi) || 0;
  return AQI_BANDS.find((b) => a >= b.min) || AQI_BANDS[AQI_BANDS.length - 1];
}

// Santiago Metro lines with official corporate colours.
export const METRO_LINES = [
  { id: 'L1',  name: 'Línea 1',  color: '#e2001a' },
  { id: 'L2',  name: 'Línea 2',  color: '#f9b000' },
  { id: 'L3',  name: 'Línea 3',  color: '#8b4a1e' },
  { id: 'L4',  name: 'Línea 4',  color: '#0072ce' },
  { id: 'L4A', name: 'Línea 4A', color: '#00b5e2' },
  { id: 'L5',  name: 'Línea 5',  color: '#009639' },
  { id: 'L6',  name: 'Línea 6',  color: '#8d3f97' },
];

// Metro operational states. `rank` drives the transit posture.
export const METRO_STATES = {
  operational: { label: 'Operational', tone: 'ok',   rank: 0 },
  partial:     { label: 'Partial',     tone: 'warn', rank: 1 },
  delayed:     { label: 'Delayed',     tone: 'warn', rank: 1 },
  closed:      { label: 'Closed',      tone: 'crit', rank: 2 },
  unknown:     { label: 'No data',     tone: 'idle', rank: 0 },
};

// WMO weather codes → short label + glyph key (no emoji; glyphs are
// drawn as inline SVG in weather.js).
export const WEATHER_CODES = {
  0:  { label: 'Clear',          icon: 'sun' },
  1:  { label: 'Mostly clear',   icon: 'sun-cloud' },
  2:  { label: 'Partly cloudy',  icon: 'sun-cloud' },
  3:  { label: 'Overcast',       icon: 'cloud' },
  45: { label: 'Fog',            icon: 'fog' },
  48: { label: 'Rime fog',       icon: 'fog' },
  51: { label: 'Light drizzle',  icon: 'drizzle' },
  53: { label: 'Drizzle',        icon: 'drizzle' },
  55: { label: 'Heavy drizzle',  icon: 'drizzle' },
  61: { label: 'Light rain',     icon: 'rain' },
  63: { label: 'Rain',           icon: 'rain' },
  65: { label: 'Heavy rain',     icon: 'rain' },
  66: { label: 'Freezing rain',  icon: 'rain' },
  67: { label: 'Freezing rain',  icon: 'rain' },
  71: { label: 'Light snow',     icon: 'snow' },
  73: { label: 'Snow',           icon: 'snow' },
  75: { label: 'Heavy snow',     icon: 'snow' },
  77: { label: 'Snow grains',    icon: 'snow' },
  80: { label: 'Rain showers',   icon: 'rain' },
  81: { label: 'Rain showers',   icon: 'rain' },
  82: { label: 'Violent showers', icon: 'rain' },
  85: { label: 'Snow showers',   icon: 'snow' },
  86: { label: 'Snow showers',   icon: 'snow' },
  95: { label: 'Thunderstorm',   icon: 'storm' },
  96: { label: 'Storm + hail',   icon: 'storm' },
  99: { label: 'Storm + hail',   icon: 'storm' },
};

export function weatherCode(code) {
  return WEATHER_CODES[code] || { label: 'Unknown', icon: 'cloud' };
}
