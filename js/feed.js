// ── Alert feed panel ─────────────────────────────────────────
// A reverse-chronological stream of official notices from the active
// city's authorities (Santiago: CSN seismology, SENAPRED emergency
// alerts, Meteorología bulletins), aggregated by the Worker. Each item
// is source-tagged so the reader knows the authority behind it. Cities
// whose table entry has no live feed get a placeholder that names the
// authorities instead of pretending there is nothing to report.

import { workerReady } from './config.js';
import { state, activeCity } from './state.js';
import { escHtml, timeAgo } from './utils.js';

// Source → tone class for the tag chip.
const SOURCE_TONE = {
  CSN: 'seismic',
  SENAPRED: 'emergency',
  ONEMI: 'emergency',
  Meteorologia: 'weather',
  Meteorología: 'weather',
  SHOA: 'tsunami',
};

/** "A, B and C" from a list of names. */
function listNames(names) {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export function renderFeed() {
  const city = activeCity();
  const s = state.feed;
  const authorities = city.alerts?.authorities || [];

  if (!city.alerts?.live) {
    return `
      <div class="panel-placeholder">
        <p>Official notices for ${escHtml(city.short)} come from ${escHtml(listNames(authorities))}.</p>
        <p class="panel-placeholder__note">Not wired into this board yet.</p>
      </div>
    `;
  }

  if (!workerReady()) {
    return `
      <div class="panel-placeholder">
        <p>Official alert stream aggregates ${escHtml(listNames(authorities))} bulletins.</p>
        <p class="panel-placeholder__note">Activates once the alert Worker is deployed.</p>
      </div>
    `;
  }

  if (s.status === 'loading' && !s.items.length) {
    return Array.from({ length: 3 }, () =>
      `<div class="skeleton" style="height:52px;border-radius:10px;margin-bottom:10px"></div>`
    ).join('');
  }

  if (!s.items.length) {
    return `<p class="panel-empty">No official notices in the current window. Quiet is good.</p>`;
  }

  return `
    <ul class="feed" aria-label="Official alerts">
      ${s.items.slice(0, 10).map(renderItem).join('')}
    </ul>
  `;
}

function renderItem(item) {
  const tone = SOURCE_TONE[item.source] || 'seismic';
  const link = item.url
    ? `<a class="feed-item__title" href="${escHtml(item.url)}" target="_blank" rel="noopener noreferrer">${escHtml(item.title)}</a>`
    : `<span class="feed-item__title">${escHtml(item.title)}</span>`;
  const when = item.time ? timeAgo(item.time) : '';
  return `
    <li class="feed-item feed-item--${tone}">
      <span class="feed-tag">${escHtml(item.source || 'Alert')}</span>
      <span class="feed-item__body">
        ${link}
        ${item.summary ? `<span class="feed-item__summary">${escHtml(item.summary)}</span>` : ''}
      </span>
      ${when ? `<span class="feed-item__ago"><time datetime="${new Date(item.time).toISOString()}">${when}</time></span>` : ''}
    </li>
  `;
}
