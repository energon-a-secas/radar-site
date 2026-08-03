// ── Weather panel ────────────────────────────────────────────
// Current conditions readout + a 7-day forecast strip, plus a
// compact air-quality gauge (Santiago's smog is a daily factor).
// Glyphs are hand-drawn inline SVG — no emoji, no icon font.

import { weatherCode, aqiBand } from './config.js';
import { state } from './state.js';
import { escHtml, fmtTemp, weekday, isToday, santiagoTime, compass } from './utils.js';

export function renderWeather() {
  const s = state.weather;
  if (s.status === 'loading' && !s.current) return skeleton();
  if (s.status === 'error' && !s.current) {
    return `<p class="panel-error">Weather feed unreachable. Retry from sync.</p>`;
  }
  if (!s.current) return `<p class="panel-empty">No weather data.</p>`;

  return `
    ${renderCurrent(s.current, s.hourly)}
    ${renderAqiGauge(s.air)}
    ${renderOutlook(s.daily)}
    ${renderForecast(s.daily)}
    ${renderHourly(s.hourly)}
  `;
}

// Qualitative rain intensity from an hourly mm rate. The point the
// planner cares about: 100% chance of 0.3 mm is a non-event; 4 mm is a
// wet commute. Thresholds follow common light/moderate/heavy bands.
function rainIntensity(mm) {
  const v = Number(mm) || 0;
  if (v <= 0)    return { label: 'none',     tone: 'muted' };
  if (v < 0.5)   return { label: 'trace',    tone: 'muted' };
  if (v < 2.5)   return { label: 'light',    tone: 'ok' };
  if (v < 7.6)   return { label: 'moderate', tone: 'warn' };
  return             { label: 'heavy',    tone: 'crit' };
}

// ── Air-quality gauge ──────────────────────────────────────
// A horizontal band gauge with a marker at the current AQI. Reads at a
// glance where today sits on the 0–300 scale — Santiago's smog is a
// daily planning factor, so it earns a dedicated visual.
function renderAqiGauge(air) {
  if (!air || air.aqi === null || air.aqi === undefined) return '';
  const aqi = Math.round(air.aqi);
  const band = aqiBand(aqi);
  const max = 300;
  const pct = Math.min(100, (aqi / max) * 100);
  // Segment stops mirror AQI_BANDS breakpoints as gradient positions.
  const gradient = `linear-gradient(90deg,
    #22c55e 0%, #22c55e ${(50 / max) * 100}%,
    #eab308 ${(51 / max) * 100}%, #eab308 ${(100 / max) * 100}%,
    #f97316 ${(101 / max) * 100}%, #f97316 ${(150 / max) * 100}%,
    #dc2626 ${(151 / max) * 100}%, #dc2626 ${(200 / max) * 100}%,
    #8b5cf6 ${(201 / max) * 100}%, #8b5cf6 100%)`;
  const pm = air.pm25 !== null && air.pm25 !== undefined
    ? `<span class="wx-aqi__pm">PM2.5 ${Math.round(air.pm25)} µg/m³</span>` : '';
  return `
    <div class="wx-aqi" aria-label="Air quality index ${aqi}, ${escHtml(band.label)}">
      <div class="wx-aqi__top">
        <span class="wx-aqi__title">Air quality</span>
        <span class="wx-aqi__val" style="color:${band.color}">${aqi} <em>${escHtml(band.label)}</em></span>
      </div>
      <div class="wx-aqi__track" style="background:${gradient}">
        ${[50, 100, 150, 200].map((v) =>
          `<span class="wx-aqi__tick" style="left:${(v / max) * 100}%"></span>`).join('')}
        <span class="wx-aqi__marker" style="left:${pct}%;--aqi:${band.color}"></span>
      </div>
      <div class="wx-aqi__scale" aria-hidden="true">
        ${[50, 100, 150, 200].map((v) =>
          `<span style="left:${(v / max) * 100}%">${v}</span>`).join('')}
      </div>
      <div class="wx-aqi__foot">
        <span>0</span>${pm}<span>300+</span>
      </div>
    </div>
  `;
}

// ── Collapsible hourly forecast ────────────────────────────
// A layered area chart: temperature curve over precipitation-probability
// bars, next 24h. Collapsed by default to keep the panel tight; the
// open/closed state persists via prefs.
function renderHourly(hourly) {
  if (!hourly || hourly.length < 2) return '';
  const open = state.prefs.hourlyOpen;
  return `
    <div class="wx-hourly${open ? ' is-open' : ''}">
      <button class="wx-hourly__toggle" id="hourlyToggle" type="button"
              aria-expanded="${open}" aria-controls="hourlyPanel">
        <svg class="wx-hourly__chev" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
        <span>Next 24 hours</span>
        <span class="wx-hourly__hint">hourly temp &amp; rain</span>
      </button>
      <div class="wx-hourly__panel" id="hourlyPanel"${open ? '' : ' hidden'}>
        ${hourlyChart(hourly)}
      </div>
    </div>
  `;
}

function hourlyChart(hours) {
  const unit = state.prefs.tempUnit;
  const conv = (c) => (unit === 'F' ? (c * 9) / 5 + 32 : c);
  const w = 320, h = 132;
  const padL = 4, padR = 4, padTop = 16, baseY = h - 22;
  const plotW = w - padL - padR;

  const temps = hours.map((x) => conv(x.temp)).filter((t) => t !== null && !Number.isNaN(t));
  const tMin = Math.min(...temps), tMax = Math.max(...temps);
  const range = Math.max(1, tMax - tMin);
  const n = hours.length;
  const xAt = (i) => padL + (i / (n - 1)) * plotW;
  const yAt = (t) => baseY - ((conv(t) - tMin) / range) * (baseY - padTop);

  // Precip-probability bars (light, behind the curve).
  const barW = Math.max(2, (plotW / n) - 2);
  const bars = hours.map((x, i) => {
    const bh = (Math.max(0, Math.min(100, x.pop)) / 100) * (baseY - padTop);
    if (bh < 1) return '';
    const bx = (xAt(i) - barW / 2).toFixed(1);
    return `<rect x="${bx}" y="${(baseY - bh).toFixed(1)}" width="${barW.toFixed(1)}" height="${bh.toFixed(1)}" rx="1.5" class="wx-hr-bar"/>`;
  }).join('');

  // Temperature line + area.
  const pts = hours.map((x, i) => `${xAt(i).toFixed(1)},${yAt(x.temp).toFixed(1)}`);
  const linePath = `M${pts.join(' L')}`;
  const areaPath = `${linePath} L${xAt(n - 1).toFixed(1)},${baseY} L${padL},${baseY} Z`;

  // Hour ticks every 6 hours + temperature dots with tooltips.
  const ticks = hours.map((x, i) => {
    if (i % 6 !== 0 && i !== n - 1) return '';
    return `<text x="${xAt(i).toFixed(1)}" y="${h - 6}" class="wx-hr-tick" text-anchor="${i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}">${santiagoTime(x.iso)}</text>`;
  }).join('');

  const dots = hours.map((x, i) => {
    if (i % 3 !== 0) return '';
    return `<circle cx="${xAt(i).toFixed(1)}" cy="${yAt(x.temp).toFixed(1)}" r="2.2" class="wx-hr-dot"><title>${santiagoTime(x.iso)} · ${fmtTemp(x.temp, unit)}${unit} · ${x.pop}% rain</title></circle>`;
  }).join('');

  const hi = fmtTemp(tMax, unit), lo = fmtTemp(tMin, unit);

  return `
    <svg class="wx-hr-svg" viewBox="0 0 ${w} ${h}" width="100%" height="${h}" preserveAspectRatio="none" role="img" aria-label="Hourly temperature and rain probability for the next 24 hours">
      <defs>
        <linearGradient id="wxHrArea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--accent-bright)" stop-opacity=".34"/>
          <stop offset="100%" stop-color="var(--accent-bright)" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <text x="${padL}" y="11" class="wx-hr-axis">${hi}${unit}</text>
      <text x="${padL}" y="${baseY}" class="wx-hr-axis" dy="-2">${lo}${unit}</text>
      ${bars}
      <path d="${areaPath}" fill="url(#wxHrArea)"/>
      <path d="${linePath}" class="wx-hr-line"/>
      ${dots}
      ${ticks}
    </svg>
    <p class="wx-hr-legend"><span class="wx-hr-legend__temp"></span> Temperature <span class="wx-hr-legend__rain"></span> Rain chance</p>
  `;
}

// Forward-looking one-liner from the 7-day set: the signal a planner
// actually wants, not another number to parse.
function renderOutlook(daily) {
  if (daily.length < 2) return '';
  const wettest = daily.reduce((max, d) => ((d.pop ?? 0) > (max.pop ?? 0) ? d : max), daily[0]);
  const wetLabel = isToday(wettest.date) ? 'today' : weekday(wettest.date);
  const rest = daily.slice(1);
  const warming = rest.length > 1 && rest[rest.length - 1].max > rest[0].max;

  let msg;
  if ((wettest.pop ?? 0) >= 50) {
    msg = `Rain most likely ${wetLabel} at ${wettest.pop}%`;
  } else if ((wettest.pop ?? 0) >= 20) {
    msg = `Mostly dry week, some chance ${wetLabel}`;
  } else {
    msg = 'Dry through the week';
  }
  msg += warming ? '. Warming trend.' : '.';

  return `<p class="wx-outlook">${escHtml(msg)}</p>`;
}

function renderCurrent(cur, hourly) {
  const wc = weatherCode(cur.weather_code);
  const unit = state.prefs.tempUnit;
  const feels = fmtTemp(cur.apparent_temperature, unit);

  // Current-hour rain chance comes from the hourly series (the `current`
  // block carries the mm rate but no probability). Fall back gracefully.
  const nowHour = (hourly && hourly.length) ? hourly[0] : null;
  const pop = nowHour ? Math.max(0, Math.min(100, Math.round(nowHour.pop))) : null;
  const mm = cur.precipitation ?? nowHour?.precip ?? 0;
  const rain = rainIntensity(mm);
  // Rain line: chance % + mm + a qualitative intensity word, so
  // "100% · 0.3 mm trace" reads clearly as "wet but nothing to worry about".
  const rainValue = pop !== null
    ? `${pop}% <span class="wx-rain__mm">${mm.toFixed(1)} mm</span>`
    : `${mm.toFixed(1)} mm`;
  const rainTag = mm > 0
    ? `<span class="wx-rain__tag wx-rain__tag--${rain.tone}">${rain.label}</span>`
    : '';

  return `
    <div class="wx-now" data-wx="${wc.icon}">
      <div class="wx-now__glyph">${glyph(wc.icon, 56)}</div>
      <div class="wx-now__read">
        <span class="wx-now__temp">${fmtTemp(cur.temperature_2m, unit)}${unit}</span>
        <span class="wx-now__label">${escHtml(wc.label)}</span>
        <span class="wx-now__feels">Feels ${feels}</span>
      </div>
      <dl class="wx-stats">
        <div><dt>Wind</dt><dd>${Math.round(cur.wind_speed_10m)} km/h ${compass(cur.wind_direction_10m)}</dd></div>
        <div><dt>Humidity</dt><dd>${Math.round(cur.relative_humidity_2m)}%</dd></div>
        <div class="wx-stats__rain"><dt>Rain</dt><dd>${rainValue} ${rainTag}</dd></div>
        <div><dt>Pressure</dt><dd>${Math.round(cur.surface_pressure ?? 0)} hPa</dd></div>
      </dl>
    </div>
  `;
}

function renderForecast(daily) {
  if (!daily.length) return '';
  const unit = state.prefs.tempUnit;
  const conv = (c) => (unit === 'F' ? (c * 9) / 5 + 32 : c);

  // One temperature envelope across the whole week. Each day's bar is a
  // slice of it, so the seven columns read as a single trend line rather
  // than fourteen unrelated numbers.
  const floor = Math.min(...daily.map((d) => conv(d.min)));
  const ceil = Math.max(...daily.map((d) => conv(d.max)));
  const span = Math.max(1, ceil - floor);

  return `
    <div class="wx-week" role="list" aria-label="Seven day forecast">
      ${daily.map((d) => {
        const wc = weatherCode(d.code);
        const today = isToday(d.date);
        const pop = d.pop ?? 0;
        const hi = conv(d.max);
        const lo = conv(d.min);
        const top = ((ceil - hi) / span) * 100;
        const height = Math.max(4, ((hi - lo) / span) * 100);
        // Warmth of the day's midpoint within the week, as a mix ratio.
        const warmth = (((hi + lo) / 2 - floor) / span) * 100;
        return `
          <div class="wx-day${today ? ' wx-day--today' : ''}" role="listitem">
            <span class="wx-day__name">${today ? 'Today' : weekday(d.date)}</span>
            <span class="wx-day__glyph">${glyph(wc.icon, 26)}</span>
            <span class="wx-day__hi">${fmtTemp(d.max, unit)}</span>
            <span class="wx-day__bar" aria-hidden="true">
              <span class="wx-day__range" style="top:${top.toFixed(1)}%;height:${height.toFixed(1)}%;--warmth:${warmth.toFixed(0)}%"></span>
            </span>
            <span class="wx-day__lo">${fmtTemp(d.min, unit)}</span>
            <span class="wx-day__pop${pop >= 40 ? ' is-wet' : ''}" title="Chance of precipitation">${pop}%</span>
          </div>
        `;
      }).join('')}
    </div>
    <p class="wx-sun">Sun ${sunWindow(daily[0])}</p>
  `;
}

function sunWindow(day) {
  if (!day?.sunrise || !day?.sunset) return '--';
  return `${santiagoTime(day.sunrise)} to ${santiagoTime(day.sunset)}`;
}

// ── Inline SVG glyphs ──────────────────────────────────────
const P = 'stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"';
function glyph(kind, size = 32) {
  const open = `<svg viewBox="0 0 32 32" width="${size}" height="${size}" aria-hidden="true" class="wx-glyph wx-glyph--${kind}">`;
  const cloud = `<path ${P} d="M9 22h13a4 4 0 0 0 .4-8 6 6 0 0 0-11.6-1.6A4 4 0 0 0 9 22Z"/>`;
  const sun = `<circle cx="16" cy="16" r="6" ${P}/>` +
    [0, 45, 90, 135, 180, 225, 270, 315].map((a) => {
      const r = (a * Math.PI) / 180;
      const x1 = 16 + 9 * Math.cos(r), y1 = 16 + 9 * Math.sin(r);
      const x2 = 16 + 12 * Math.cos(r), y2 = 16 + 12 * Math.sin(r);
      return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" ${P}/>`;
    }).join('');
  const drops = (n) => Array.from({ length: n }, (_, i) =>
    `<line x1="${11 + i * 5}" y1="24" x2="${9 + i * 5}" y2="28" ${P}/>`).join('');

  const bodies = {
    sun: `${open}${sun}</svg>`,
    'sun-cloud': `${open}<circle cx="11" cy="10" r="3.5" ${P}/><path ${P} d="M13 22h9a3.5 3.5 0 0 0 .3-7 5 5 0 0 0-9.6-1"/></svg>`,
    cloud: `${open}${cloud}</svg>`,
    fog: `${open}${cloud}<line x1="7" y1="26" x2="21" y2="26" ${P}/><line x1="10" y1="29" x2="24" y2="29" ${P}/></svg>`,
    drizzle: `${open}${cloud}${drops(3)}</svg>`,
    rain: `${open}${cloud}${drops(4)}</svg>`,
    snow: `${open}${cloud}<line x1="12" y1="26" x2="12" y2="26" ${P}/><line x1="16" y1="28" x2="16" y2="28" ${P}/><line x1="20" y1="26" x2="20" y2="26" ${P}/></svg>`,
    storm: `${open}${cloud}<path ${P} d="M16 23l-3 4h4l-3 4"/></svg>`,
  };
  return bodies[kind] || bodies.cloud;
}

function skeleton() {
  return `
    <div class="wx-now">
      <div class="skeleton" style="width:56px;height:56px;border-radius:12px"></div>
      <div style="flex:1"><div class="skeleton" style="height:28px;width:50%;margin-bottom:8px"></div>
      <div class="skeleton" style="height:12px;width:70%"></div></div>
    </div>
    <div class="skeleton" style="height:88px;width:100%;border-radius:10px;margin-top:14px"></div>
  `;
}
