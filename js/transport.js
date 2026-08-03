// ── Transport panel ──────────────────────────────────────────
// Metro de Santiago line board. Always renders all seven lines as
// a HUD map; live states overlay when the Worker returns them.
// Without the Worker each line shows "No data" rather than a
// misleading green.

import { METRO_LINES, METRO_STATES } from './config.js';
import { state } from './state.js';
import { escHtml, timeAgo } from './utils.js';

/** Merge live states onto the static line list. */
function mergedLines() {
  const live = new Map((state.transport.lines || []).map((l) => [l.id, l]));
  return METRO_LINES.map((base) => {
    const hit = live.get(base.id);
    const key = hit?.state && METRO_STATES[hit.state] ? hit.state : 'unknown';
    return { ...base, state: key, detail: hit?.detail || '' };
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
  const lines = mergedLines();
  const anyLive = state.transport.source && state.transport.lines?.length;

  return `
    <div class="metro-board" role="list" aria-label="Metro de Santiago line status">
      ${lines.map(renderLine).join('')}
    </div>
    ${renderNotes()}
    <p class="metro-source">
      ${anyLive
        ? `Live from ${escHtml(state.transport.source)} &middot; ${timeAgo(state.transport.updated)}`
        : 'Live status activates once the status Worker is deployed. Lines shown for reference.'}
    </p>
  `;
}

function renderLine(l) {
  const st = METRO_STATES[l.state];
  return `
    <div class="metro-line metro-line--${st.tone}" role="listitem" style="--line:${l.color}"
         title="${escHtml(l.name)}: ${st.label}${l.detail ? '. ' + escHtml(l.detail) : ''}">
      <span class="metro-badge">${escHtml(l.id)}</span>
      <span class="metro-line__name">${escHtml(l.name)}</span>
      <span class="metro-status metro-status--${st.tone}">
        <span class="metro-dot"></span>${st.label}
      </span>
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
