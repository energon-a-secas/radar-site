// ── Entry point ──────────────────────────────────────────────
// Wire modules together, paint the shell, kick off the first sync.

import { state, loadSaved } from './state.js';
import { render } from './render.js';
import { bindEvents } from './events.js';
import { syncAll } from './sync.js';

function init() {
  loadSaved(state);
  render(state);
  bindEvents();
  syncAll();
}

init();
