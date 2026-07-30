// ── Alert feed panel ─────────────────────────────────────────
// A reverse-chronological stream of official notices: CSN
// seismology, SENAPRED emergency alerts, and Meteorología
// bulletins, aggregated by the Worker. Each item is source-tagged
// so the reader knows the authority behind it.

import { workerReady } from './config.js';
import { state } from './state.js';
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

export function renderFeed() {
  const s = state.feed;

  if (!workerReady()) {
    return `
      <div class="feed-placeholder">
        <p>Official alert stream aggregates CSN seismology, SENAPRED emergencies,
        and Meteorología bulletins.</p>
        <p class="feed-placeholder__note">Activates once the alert Worker is deployed.</p>
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
    <li class="feed-item">
      <span class="feed-tag feed-tag--${tone}">${escHtml(item.source || 'Alert')}</span>
      <span class="feed-item__body">
        ${link}
        ${item.summary ? `<span class="feed-item__summary">${escHtml(item.summary)}</span>` : ''}
      </span>
      ${when ? `<span class="feed-item__ago"><time datetime="${new Date(item.time).toISOString()}">${when}</time></span>` : ''}
    </li>
  `;
}
