// ── Transport panel ──────────────────────────────────────────
// The active city's metro / subte line board. Three honest modes, read
// from the city table:
//   live       a Worker source exists (Santiago: metro.cl); live states
//              overlay the static lines, "No data" when the feed is down
//   reference  lines exist but no status feed is wired; rows render
//              without a status chip and the footer says why
//   none       the city has no metro in service; one explanatory line
// Never a misleading green: a line we cannot read is never "Operational".

import { METRO_STATES } from './config.js';
import { state, activeCity } from './state.js';
import { escHtml, timeAgo } from './utils.js';

/** Merge live states onto the city's static line list. */
function mergedLines(city = activeCity()) {
  const base = city.transit?.lines || [];
  const live = new Map((state.transport.lines || []).map((l) => [l.id, l]));
  return base.map((b) => {
    const hit = live.get(b.id);
    const key = hit?.state && METRO_STATES[hit.state] ? hit.state : 'unknown';
    return { ...b, state: key, detail: hit?.detail || '' };
  });
}

/** Worst operational rank across all lines (drives posture). */
export function transportRank() {
  return mergedLines().reduce(
    (max, l) => Math.max(max, METRO_STATES[l.state].rank), 0
  );
}

/** Count of lines not fully operational. */
export function disruptedCount() {
  return mergedLines().filter(
    (l) => l.state !== 'operational' && l.state !== 'unknown'
  ).length;
}

export function renderTransport() {
  const city = activeCity();
  const transit = city.transit;
  if (!transit) return renderNoTransit(city);

  const reference = !transit.live;
  const lines = mergedLines(city);

  return `
    <div class="metro-board${reference ? ' metro-board--ref' : ''}" role="list" aria-label="${escHtml(transit.name)} line status">
      ${lines.map((l) => renderLine(l, reference)).join('')}
    </div>
    ${renderNotes()}
    <p class="metro-source">${sourceLine(transit, reference)}</p>
  `;
}

/** The footer line under the board: where the status comes from, or why
 *  there is none. */
function sourceLine(transit, reference) {
  if (reference) {
    return `No live status feed for ${escHtml(transit.name)}. Lines shown for reference.`;
  }
  const t = state.transport;
  if (t.source && t.lines?.length) {
    return `Live from ${escHtml(t.source)} &middot; ${timeAgo(t.updated)}`;
  }
  if (t.status === 'loading' || t.status === 'idle') {
    return `Checking ${escHtml(transit.name)} status…`;
  }
  return `${escHtml(transit.name)} status feed unreachable right now. Lines shown for reference.`;
}

function renderLine(l, reference) {
  const st = METRO_STATES[l.state];
  const title = reference
    ? l.name
    : `${l.name}: ${st.label}${l.detail ? '. ' + l.detail : ''}`;
  const status = reference ? '' : `
      <span class="metro-status metro-status--${st.tone}">
        <span class="metro-dot"></span>${st.label}
      </span>`;
  return `
    <div class="metro-line metro-line--${reference ? 'ref' : st.tone}" role="listitem" style="--line:${l.color}"
         title="${escHtml(title)}">
      <span class="metro-badge">${escHtml(l.id)}</span>
      <span class="metro-line__name">${escHtml(l.name)}</span>${status}
    </div>
  `;
}

function renderNoTransit(city) {
  return `
    <div class="panel-placeholder">
      <p>No metro in service in ${escHtml(city.short)}.</p>
      ${city.transitNote ? `<p class="panel-placeholder__note">${escHtml(city.transitNote)}</p>` : ''}
    </div>
  `;
}

function renderNotes() {
  const notes = state.transport.notes || [];
  if (!notes.length) return '';
  return `
    <ul class="metro-notes" aria-label="Service notices">
      ${notes.slice(0, 3).map((n) => `<li>${escHtml(typeof n === 'string' ? n : n.text || '')}</li>`).join('')}
    </ul>
  `;
}
