// ── Radar API proxy ──────────────────────────────────────────
// Fetches the sources the browser can't reach directly (CORS or
// no CORS headers) and normalizes them to the shapes the frontend
// expects. Three POST endpoints, all CORS-restricted, each taking a
// JSON body `{ city }` naming a key of the frontend's CITIES table:
//
//   POST /quakes  → { items: [{ id, mag, place, time, depth, lat, lon, url }], city, supported }
//   POST /metro   → { lines: [{ id, state, detail }], notes: [], source, city, supported }
//   POST /feed    → { items: [{ source, title, summary, time, url }], city, supported }
//
// CITY_SOURCES maps a city to its handlers. A city with no handler for a
// kind (today: every city but Santiago) gets an empty payload with
// `supported: false`, never another city's data. A missing `city`
// defaults to santiago so older clients keep working.
//
// Every handler is defensive: upstream layout changes degrade to an
// empty array, never a 500 that blanks the board. The frontend
// already runs on USGS + Open-Meteo without this Worker; these
// endpoints only enrich.

const ALLOWED_ORIGINS = [
  'https://radar.neorgon.com',
  'https://sitrep.neorgon.com',
  'http://localhost:8852',
];

const UA = 'RadarBot/1.0 (+https://radar.neorgon.com)';
const CACHE_TTL = 60; // seconds — be polite to public feeds

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': `public, max-age=${CACHE_TTL}`,
    'Content-Type': 'application/json',
  };
}

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }
    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405, request);
    }

    const origin = request.headers.get('Origin') || '';
    if (origin && !ALLOWED_ORIGINS.includes(origin)) {
      return json({ error: 'Forbidden' }, 403, request);
    }

    const path = new URL(request.url).pathname;
    const kind = KIND_BY_PATH[path];
    if (!kind) return json({ error: 'Not found' }, 404, request);

    const body = await request.json().catch(() => ({}));
    const city = typeof body.city === 'string' && body.city ? body.city : DEFAULT_CITY;
    const handler = CITY_SOURCES[city]?.[kind];
    if (!handler) {
      return json({ ...emptyPayload(kind), city, supported: false }, 200, request);
    }
    try {
      return json({ ...(await handler()), city, supported: true }, 200, request);
    } catch {
      // Never blank the board: return an empty-but-valid payload.
      return json({ ...emptyPayload(kind), city, supported: true }, 200, request);
    }
  },
};

const DEFAULT_CITY = 'santiago';

const KIND_BY_PATH = { '/quakes': 'quakes', '/metro': 'metro', '/feed': 'feed' };

// City → { quakes, metro, feed } handlers. Only Santiago has sources
// today; adding a city's national network, transit feed or alert RSS is
// one handler here plus the matching `live` flag in the frontend table.
const CITY_SOURCES = {
  santiago: { quakes: getQuakesCSN, metro: getMetroSantiago, feed: getFeedChile },
};

function emptyPayload(kind) {
  return kind === 'metro' ? { lines: [], notes: [], source: null } : { items: [] };
}

function json(obj, status, request) {
  return new Response(JSON.stringify(obj), { status, headers: corsHeaders(request) });
}

async function getText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'application/json, text/html' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// ── Quakes: Chilean CSN (Centro Sismológico Nacional) ──────
// CSN publishes recent events at sismologia.cl. The public listing
// is HTML; we parse the tabular rows. Values that don't parse are
// dropped rather than guessed.
async function getQuakesCSN() {
  const html = await getText('https://www.sismologia.cl/');
  const items = [];

  // Rows look like: <a href="/events/.../..">2026-07-15 14:03:22</a> ...
  // Fecha Local | Latitud | Longitud | Profundidad | Magnitud | Ref
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let m;
  while ((m = rowRe.exec(html)) && items.length < 40) {
    const cells = [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) =>
      c[1].replace(/<[^>]+>/g, '').trim()
    );
    if (cells.length < 5) continue;

    // Heuristic column detection: find a lat, lon, depth (km), mag.
    const nums = cells.map((c) => parseFloat(c.replace(',', '.')));
    const dateStr = cells.find((c) => /\d{4}-\d{2}-\d{2}/.test(c));
    const time = dateStr ? Date.parse(dateStr.replace(' ', 'T') + '-04:00') : NaN;
    const lat = nums.find((n) => n < 0 && n > -60);
    const mag = nums.find((n) => n >= 1 && n <= 9.9);
    const ref = cells.find((c) => /[A-Za-z]{3,}/.test(c) && !/\d{4}-/.test(c));

    if (!Number.isFinite(time) || !Number.isFinite(mag)) continue;
    items.push({
      id: `csn-${time}`,
      mag,
      place: ref || 'Chile',
      time,
      depth: nums.find((n) => n > 0 && n < 700) || 0,
      lat: lat || 0,
      lon: nums.find((n) => n < -60 && n > -80) || 0,
      url: 'https://www.sismologia.cl/',
    });
  }
  return { items };
}

// ── Metro de Santiago status ───────────────────────────────
// metro.cl publishes a JSON status API: `estadoRedDetalle.php` gives
// a per-line `estado` code plus a human `mensaje_app` / `mensaje`, and
// the full station list. We read the line codes and surface any
// disruption message. A line we can't read defaults to "unknown"
// (the frontend shows "No data", never a false green).
async function getMetroSantiago() {
  // id → API key. L4A must precede L4 conceptually but keys are distinct.
  const IDS = { L1: 'l1', L2: 'l2', L3: 'l3', L4: 'l4', L4A: 'l4a', L5: 'l5', L6: 'l6' };
  const data = JSON.parse(await getText('https://www.metro.cl/api/estadoRedDetalle.php'));

  const lines = [];
  const notes = [];
  for (const [id, key] of Object.entries(IDS)) {
    const info = data[key];
    if (!info) { lines.push({ id, state: 'unknown', detail: '' }); continue; }

    const state = metroState(info.estado, info.mensaje_app);
    // Prefer the specific message ("Santa Isabel estará cerrada…") over
    // the generic app label; only show detail when it adds signal.
    const msg = (info.mensaje || info.mensaje_app || '').replace(/\s+/g, ' ').trim();
    lines.push({ id, state, detail: state === 'operational' ? '' : msg });

    if (state !== 'operational' && info.mensaje) {
      notes.push(`${id}: ${info.mensaje.replace(/\s+/g, ' ').trim()}`);
    }
  }

  return { lines, notes, source: 'metro.cl' };
}

// Map metro.cl's status to our tone keys. The `mensaje_app` text is the
// clearest signal; the numeric `estado` code is the fallback.
//   1 = línea disponible · 2 = estaciones cerradas · 3 = servicio parcial
//   0/4/5 = suspended/closed (observed variants)
function metroState(code, msg) {
  const m = (msg || '').toLowerCase();
  if (/suspend|fuera de servicio|no disponible|cerrad[ao] (toda|la l|el servicio)/.test(m)) return 'closed';
  if (/parcial|tramo/.test(m)) return 'partial';
  if (/estacion(es)? cerrad/.test(m)) return 'partial';
  if (/demora|retras|lent/.test(m)) return 'delayed';
  if (/disponible|operativ|normal|habilitad/.test(m)) return 'operational';
  switch (String(code)) {
    case '1': return 'operational';
    case '2': return 'partial';
    case '3': return 'delayed';
    case '0':
    case '4':
    case '5': return 'closed';
    default:  return 'unknown';
  }
}

// ── Official alert feed ────────────────────────────────────
// Aggregates public RSS/Atom from CSN (seismology) and SENAPRED
// (emergencies). Each source is fetched independently so one dead
// feed doesn't sink the rest.
async function getFeedChile() {
  const sources = [
    { name: 'CSN', url: 'https://www.sismologia.cl/rss/ultimos_sismos.xml' },
    { name: 'SENAPRED', url: 'https://senapred.cl/feed/' },
    { name: 'Meteorología', url: 'https://www.meteochile.gob.cl/PortalDMC-web/rss/avisos.xml' },
  ];

  const results = await Promise.allSettled(sources.map((s) => parseRss(s)));
  const items = results
    .filter((r) => r.status === 'fulfilled')
    .flatMap((r) => r.value)
    .filter((it) => Number.isFinite(it.time))
    .sort((a, b) => b.time - a.time)
    .slice(0, 15);

  return { items };
}

async function parseRss(source) {
  const xml = await getText(source.url);
  const items = [];
  const itemRe = /<item[^>]*>([\s\S]*?)<\/item>|<entry[^>]*>([\s\S]*?)<\/entry>/gi;
  let m;
  while ((m = itemRe.exec(xml)) && items.length < 10) {
    const block = m[1] || m[2] || '';
    const title = tag(block, 'title');
    const desc = tag(block, 'description') || tag(block, 'summary');
    const link = tag(block, 'link') || (block.match(/<link[^>]*href="([^"]+)"/i)?.[1] || '');
    const dateStr = tag(block, 'pubDate') || tag(block, 'updated') || tag(block, 'published');
    if (!title) continue;
    items.push({
      source: source.name,
      title: clean(title).slice(0, 140),
      summary: clean(desc).slice(0, 160),
      time: dateStr ? Date.parse(dateStr) : Date.now(),
      url: clean(link),
    });
  }
  return items;
}

function tag(block, name) {
  const re = new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i');
  return block.match(re)?.[1] || '';
}

function clean(str) {
  return str
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}
