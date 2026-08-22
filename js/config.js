// ── Configuration ────────────────────────────────────────────
// Static constants for the situation board: the city table, data
// sources, scales, and reference tables. No secrets live here; the
// Worker holds any tokens server-side.

// ── Cities ─────────────────────────────────────────────────
// One entry per city the board can centre on. Santiago is the default
// and the only city with live enrichment through the Worker; the rest
// run on the keyless global sources (USGS + Open-Meteo) and declare
// honestly which local feeds are not wired:
//   localNetwork  national seismic network the Worker merges in (or null)
//   transit       metro/subway reference board; `live` names the Worker
//                 source when one exists, null means lines for reference
//                 only; the whole field is null when the city has no metro
//   alerts        official authorities behind the alert feed; `live` is
//                 true only when the Worker aggregates them
// Adding a city is one entry here: everything else reads the table.
export const CITIES = {
  santiago: {
    id: 'santiago',
    name: 'Santiago de Chile',
    short: 'Santiago',
    country: 'Chile',
    lat: -33.4489, lon: -70.6693,            // Plaza de Armas
    tz: 'America/Santiago',
    radiusKm: 650,
    localNetwork: 'CSN',
    transit: {
      name: 'Metro de Santiago',
      label: 'Metro lines',
      live: 'metro.cl',
      lines: [
        { id: 'L1',  name: 'Línea 1',  color: '#e2001a' },
        { id: 'L2',  name: 'Línea 2',  color: '#f9b000' },
        { id: 'L3',  name: 'Línea 3',  color: '#8b4a1e' },
        { id: 'L4',  name: 'Línea 4',  color: '#0072ce' },
        { id: 'L4A', name: 'Línea 4A', color: '#00b5e2' },
        { id: 'L5',  name: 'Línea 5',  color: '#009639' },
        { id: 'L6',  name: 'Línea 6',  color: '#8d3f97' },
      ],
    },
    alerts: { authorities: ['CSN', 'SENAPRED', 'Meteorología'], live: true },
  },
  bogota: {
    id: 'bogota',
    name: 'Bogotá',
    short: 'Bogotá',
    country: 'Colombia',
    lat: 4.5981, lon: -74.0758,              // Plaza de Bolívar
    tz: 'America/Bogota',
    radiusKm: 650,
    localNetwork: null,                      // SGC not wired
    transit: null,                           // no metro in service; TransMilenio is BRT
    transitNote: 'TransMilenio (BRT) publishes no status feed this board can read.',
    alerts: { authorities: ['SGC', 'UNGRD', 'IDEAM'], live: false },
  },
  lima: {
    id: 'lima',
    name: 'Lima',
    short: 'Lima',
    country: 'Peru',
    lat: -12.0464, lon: -77.0303,            // Plaza Mayor
    tz: 'America/Lima',
    radiusKm: 650,
    localNetwork: null,                      // IGP not wired
    transit: {
      name: 'Metro de Lima y Callao',
      label: 'Metro lines',
      live: null,
      lines: [
        { id: 'L1', name: 'Línea 1', color: '#00a650' },
        { id: 'L2', name: 'Línea 2', color: '#f2c500' },
      ],
    },
    alerts: { authorities: ['IGP', 'INDECI', 'SENAMHI'], live: false },
  },
  cdmx: {
    id: 'cdmx',
    name: 'Mexico City',
    short: 'Mexico City',
    country: 'Mexico',
    lat: 19.4326, lon: -99.1332,             // Zócalo
    tz: 'America/Mexico_City',
    radiusKm: 650,
    localNetwork: null,                      // SSN not wired
    transit: {
      name: 'Metro CDMX',
      label: 'Metro lines',
      live: null,
      lines: [
        { id: 'L1',  name: 'Línea 1',  color: '#f04e98' },
        { id: 'L2',  name: 'Línea 2',  color: '#005eb8' },
        { id: 'L3',  name: 'Línea 3',  color: '#af9800' },
        { id: 'L4',  name: 'Línea 4',  color: '#6bbbae' },
        { id: 'L5',  name: 'Línea 5',  color: '#ffd100' },
        { id: 'L6',  name: 'Línea 6',  color: '#da291c' },
        { id: 'L7',  name: 'Línea 7',  color: '#e87722' },
        { id: 'L8',  name: 'Línea 8',  color: '#009a44' },
        { id: 'L9',  name: 'Línea 9',  color: '#512f2e' },
        { id: 'LA',  name: 'Línea A',  color: '#981d97' },
        { id: 'LB',  name: 'Línea B',  color: '#9e9e9e' },
        { id: 'L12', name: 'Línea 12', color: '#b0a32a' },
      ],
    },
    alerts: { authorities: ['SSN', 'CENAPRED', 'SMN'], live: false },
  },
  'buenos-aires': {
    id: 'buenos-aires',
    name: 'Buenos Aires',
    short: 'Buenos Aires',
    country: 'Argentina',
    lat: -34.6083, lon: -58.3712,            // Plaza de Mayo
    tz: 'America/Argentina/Buenos_Aires',
    // The Pampas are quiet; the Andean belt that actually shakes the city
    // (San Juan, Mendoza, the deep Santiago del Estero events) sits
    // 900-1100 km out, so the radar reaches further here.
    radiusKm: 1100,
    localNetwork: null,                      // INPRES not wired
    transit: {
      name: 'Subte de Buenos Aires',
      label: 'Subte lines',
      live: null,
      lines: [
        { id: 'A', name: 'Línea A', color: '#00b3d7' },
        { id: 'B', name: 'Línea B', color: '#ec1c24' },
        { id: 'C', name: 'Línea C', color: '#0072bc' },
        { id: 'D', name: 'Línea D', color: '#00a650' },
        { id: 'E', name: 'Línea E', color: '#6e2c91' },
        { id: 'H', name: 'Línea H', color: '#ffd200' },
      ],
    },
    alerts: { authorities: ['INPRES', 'SMN'], live: false },
  },
};

export const DEFAULT_CITY = 'santiago';

/** City record for an id, or null when the id is not in the table. */
export function cityById(id) {
  return (id && Object.prototype.hasOwnProperty.call(CITIES, id)) ? CITIES[id] : null;
}

// Cloudflare Worker proxy. The app runs fully on the keyless client
// sources without it and enriches (local tremors, Metro, alerts)
// through it for the cities whose table entry declares a live source.
// See worker/ and README for deploy steps.
export const WORKER_URL = 'https://radar-api.neorgon.workers.dev';

export function workerReady() {
  return !WORKER_URL.startsWith('https://REPLACE');
}

// USGS global feed: reliable for M4.5+ everywhere, M2.5+ where a
// contributing network reports, works from the browser.
export function usgsQuery(city) {
  return 'https://earthquake.usgs.gov/fdsnws/event/1/query' +
    `?format=geojson&latitude=${city.lat}&longitude=${city.lon}` +
    `&maxradiuskm=${city.radiusKm}&minmagnitude=2.5&orderby=time&limit=60`;
}

// Open-Meteo: no key, CORS-friendly, city-local timezone. Times are
// requested as unix epochs: the default ISO strings carry no offset, and
// `new Date('2026-08-21T05:51')` parses in the *browser's* zone, which
// only matched the city's zone while the board was Santiago-only.
export function weatherUrl(city) {
  return 'https://api.open-meteo.com/v1/forecast' +
    `?latitude=${city.lat}&longitude=${city.lon}` +
    '&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,' +
    'precipitation,weather_code,wind_speed_10m,wind_direction_10m,surface_pressure' +
    '&hourly=temperature_2m,precipitation_probability,precipitation,weather_code' +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,' +
    'precipitation_probability_max,wind_speed_10m_max,sunrise,sunset' +
    `&timezone=${encodeURIComponent(city.tz)}&forecast_days=7&timeformat=unixtime`;
}

// Air quality: smog is a daily planning factor in every city on the table.
export function airUrl(city) {
  return 'https://air-quality-api.open-meteo.com/v1/air-quality' +
    `?latitude=${city.lat}&longitude=${city.lon}` +
    `&current=us_aqi,pm2_5&timezone=${encodeURIComponent(city.tz)}`;
}

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

// Would this event have been *felt* in the city? A pragmatic
// attenuation heuristic, not a seismological model: shaking carries
// further the stronger the quake, so we scale a "felt radius" off the
// magnitude and compare it to the event's distance from the city.
// Tuned against Chilean subduction events (an M5 is broadly felt
// ~120 km out, an M7 across most of central Chile) and applied as-is to
// every city on the table; Mexico City's lakebed amplification, which
// makes distant events felt harder than this predicts, is not modelled.
// Returns a small object so callers can show a graded label.
export function cityImpact(mag, distanceKm, city) {
  const m = Number(mag) || 0;
  const km = Number(distanceKm) || 0;
  if (m < 3) return { felt: false, level: 'none', label: '' };
  // Felt radius grows roughly exponentially with magnitude.
  const feltRadius = Math.pow(10, 0.5 * m - 1.0); // M4≈100km, M5≈316km, M6≈1000km
  if (km > feltRadius) return { felt: false, level: 'none', label: '' };
  const ratio = km / feltRadius;
  const where = city.short;
  if (ratio < 0.45 && m >= 4.5) return { felt: true, level: 'strong', label: `Felt in ${where}` };
  if (ratio < 0.75) return { felt: true, level: 'moderate', label: `Felt in ${where}` };
  return { felt: true, level: 'light', label: `Lightly felt in ${where}` };
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
