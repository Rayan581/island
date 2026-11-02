// The "drop gate": lets a file drag reach the island although the window is normally click-through.
//
// While the left mouse button is down (reported by the helper) and the cursor is over the island (rect reported by the
// renderer), the window is switched to receive mouse/drag events. As soon as the button is released, the cursor leaves,
// Ctrl pass-through is on, or a safety timeout expires, click-through is restored and the renderer is asked to
// re-sync its own hover state. The gate only ever *forces* the window non-click-through, and only briefly.
const { inRect, toWindow } = require('./logic.cjs');

const MARGIN = 12;          // px around the island that already counts as "over it"
const POLL_MS = 50;
const FORCE_MAX_MS = 20000; // never keep the window interactive longer than this in one go
const POLL_MAX_MS = 60000;  // a button that seems to be held for a minute is a lost "up" event

function createGate({ getCursor, getBounds, setIgnore, notify = () => {}, now = Date.now, setTimer = setInterval, clearTimer = clearInterval }) {
  let rect = null, passing = false, down = false, forced = false, locked = false;
  let timer = null, pollStart = 0, forcedAt = 0;

  function release() {
    if (!forced) return;
    forced = false;
    try { setIgnore(true); } catch { /* window is closing */ }
    try { notify('resync'); } catch { /* ignore */ }
  }

  function tick() {
    try {
      const t = now();
      if (!down || t - pollStart > POLL_MAX_MS) { down = false; stopTimer(); release(); return; }
      if (forced && t - forcedAt > FORCE_MAX_MS) { release(); locked = true; return; }
      if (locked || !rect || passing) { release(); return; }
      const b = getBounds();
      if (!b) { release(); return; }
      const inside = inRect(toWindow(getCursor(), b), rect, MARGIN);
      if (inside && !forced) { forced = true; forcedAt = t; setIgnore(false); }
      else if (!inside && forced) release();
    } catch { release(); }
  }

  function stopTimer() { if (timer) { clearTimer(timer); timer = null; } }

  return {
    /** The renderer's latest island rect (window-relative CSS px) and whether Ctrl pass-through is active. */
    setRect(r, isPassing) { rect = r; passing = !!isPassing; if (forced && (passing || !rect)) release(); },
    /** Left mouse button changed (from the helper). */
    setButton(isDown) {
      if (isDown) { down = true; locked = false; pollStart = now(); if (!timer) timer = setTimer(tick, POLL_MS); tick(); }
      else { down = false; stopTimer(); release(); }
    },
    stop() { down = false; stopTimer(); release(); },
    get forced() { return forced; },
    get polling() { return !!timer; },
    tick
  };
}

module.exports = { createGate, MARGIN, POLL_MS, FORCE_MAX_MS, POLL_MAX_MS };
