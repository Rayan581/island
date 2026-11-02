// User-adjustable look and behaviour. Every value is clamped here, so a hand-edited file can never break the layout.
const fs = require('fs');

const DEFAULTS = {
  style: 'floating',   // 'floating' (pill with a gap above) | 'notch' (attached to the top edge, with curved ears)
  idleWidth: 132,      // collapsed pill width when nothing is happening
  activeWidth: 280,    // collapsed pill width when it shows something (lyrics and volume get +80)
  height: 36,          // collapsed pill height
  topOffset: 6,        // gap above the pill (floating style only)
  radius: 18,          // bottom corner curve, vertical
  radiusX: 18,         // bottom corner curve, horizontal (bigger = more bowl-like)
  ear: 0,              // notch style: size of the curved ears at the top corners
  expandedWidth: 520,  // width when opened
  eyesFollow: true,    // Robo's eyes look at the cursor when it is near
  keepOnTop: true      // keep re-asserting "always on top" so other windows can't cover the pill
};

const NUMBERS = {
  idleWidth: [80, 560], activeWidth: [180, 560], height: [26, 64], topOffset: [0, 30], radius: [4, 40],
  radiusX: [4, 260], ear: [0, 28], expandedWidth: [420, 600]
};
const BOOLEANS = ['eyesFollow', 'keepOnTop'];
const STYLES = ['floating', 'notch'];

/** Returns `base` with the valid parts of `patch` applied. Unknown keys and bad values are ignored. */
function sanitize(patch, base = DEFAULTS) {
  const out = { ...base };
  if (!patch || typeof patch !== 'object') return out;
  for (const [k, [lo, hi]] of Object.entries(NUMBERS)) {
    const v = Number(patch[k]);
    if (patch[k] !== undefined && patch[k] !== null && patch[k] !== '' && Number.isFinite(v)) out[k] = Math.min(hi, Math.max(lo, Math.round(v)));
  }
  for (const k of BOOLEANS) if (typeof patch[k] === 'boolean') out[k] = patch[k];
  if (STYLES.includes(patch.style)) out.style = patch.style;
  return out;
}

class SettingsStore {
  constructor(file, delayMs = 300) {
    this.file = file; this.delayMs = delayMs; this.timer = null;
    let saved = {};
    try { saved = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* first run or unreadable: use defaults */ }
    this.value = sanitize(saved);
  }
  update(patch) {
    this.value = sanitize(patch, this.value);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), this.delayMs);
    return this.value;
  }
  flush() {
    clearTimeout(this.timer); this.timer = null;
    try { fs.writeFileSync(this.file, JSON.stringify(this.value, null, 2) + '\n'); } catch (e) { console.error('[island] could not save settings:', e.message); }
  }
}

module.exports = { SettingsStore, sanitize, DEFAULTS, NUMBERS };
