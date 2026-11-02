const test = require('node:test');
const assert = require('node:assert');
const { sanitizeRect, inRect, toWindow, pathKey, addPaths, pruneMissing, loadPaths, MAX_ITEMS } = require('../electron/features/shelf/logic.cjs');
const { createGate, FORCE_MAX_MS, POLL_MAX_MS } = require('../electron/features/shelf/gate.cjs');

test('rect hit-test: edges, margin, outside, junk', () => {
  const r = { x: 100, y: 0, w: 300, h: 32 };
  assert.ok(inRect({ x: 100, y: 0 }, r));
  assert.ok(inRect({ x: 400, y: 32 }, r));
  assert.ok(!inRect({ x: 401, y: 10 }, r));
  assert.ok(inRect({ x: 410, y: 40 }, r, 12));
  assert.ok(!inRect({ x: 413, y: 10 }, r, 12));
  assert.ok(!inRect(null, r) && !inRect({ x: 1, y: 1 }, null));
  assert.deepStrictEqual(toWindow({ x: 1000, y: 5 }, { x: 610, y: 0 }), { x: 390, y: 5 });
});

test('sanitizeRect accepts only sane rects', () => {
  assert.deepStrictEqual(sanitizeRect({ x: '1', y: 2, w: 3, h: 4 }), { x: 1, y: 2, w: 3, h: 4 });
  for (const bad of [null, 5, {}, { x: 0, y: 0, w: 0, h: 5 }, { x: NaN, y: 0, w: 5, h: 5 }, { x: 0, y: 0, w: 1e6, h: 5 }]) assert.strictEqual(sanitizeRect(bad), null);
});

test('addPaths: dedupes (case-insensitive on win32), skips missing, caps at max, never drops old items', () => {
  const have = new Set(['C:\\a\\One.txt', 'C:\\a\\two.txt', 'C:\\a\\three.txt', 'C:\\a\\four.txt']);
  const exists = (p) => have.has(p);
  let r = addPaths([], ['C:\\a\\One.txt', 'c:\\A\\one.TXT', 'C:\\a\\gone.txt', 'C:\\a\\two.txt', '', 5], exists, { platform: 'win32' });
  assert.deepStrictEqual(r.paths, ['C:\\a\\One.txt', 'C:\\a\\two.txt']);
  assert.strictEqual(r.duplicates, 1); assert.strictEqual(r.missing, 1); assert.strictEqual(r.added.length, 2);
  r = addPaths(r.paths, ['C:\\a\\TWO.txt/', 'C:\\a\\three.txt', 'C:\\a\\four.txt'], exists, { platform: 'win32', max: 3 });
  assert.deepStrictEqual(r.paths, ['C:\\a\\One.txt', 'C:\\a\\two.txt', 'C:\\a\\three.txt']);
  assert.strictEqual(r.duplicates, 1); assert.strictEqual(r.full, 1);
  // case matters off Windows
  r = addPaths(['/a/x'], ['/a/X'], () => true, { platform: 'linux' });
  assert.strictEqual(r.paths.length, 2);
  assert.strictEqual(MAX_ITEMS, 24);
  assert.deepStrictEqual(addPaths(['x'], null, exists).paths, ['x']);
  assert.strictEqual(addPaths([], ['boom'], () => { throw new Error('x'); }).missing, 1);
});

test('pruneMissing and loadPaths (persisted config)', () => {
  assert.deepStrictEqual(pruneMissing(['a', 'b', 'c'], (p) => p !== 'b'), { paths: ['a', 'c'], removed: 1 });
  assert.deepStrictEqual(loadPaths({ paths: ['a', 'A', 7, '', 'b', null] }, 'win32'), ['a', 'b']);
  assert.deepStrictEqual(loadPaths({}), []);
  assert.deepStrictEqual(loadPaths(null), []);
  assert.strictEqual(loadPaths({ paths: Array.from({ length: 50 }, (_, i) => 'p' + i) }).length, MAX_ITEMS);
  // round trip: what we persist is what we load
  const r = addPaths([], ['/x/a', '/x/b'], () => true, { platform: 'linux' });
  assert.deepStrictEqual(loadPaths(JSON.parse(JSON.stringify({ paths: r.paths })), 'linux'), r.paths);
  assert.strictEqual(pathKey('C:/A/b/', 'win32'), 'c:\\a\\b');
});

// ---- the click-through gate, with a fake clock, cursor and window ----
function rig() {
  const s = { t: 0, cursor: { x: 1000, y: 500 }, ignore: true, calls: [], notes: [], timers: [] };
  const gate = createGate({
    getCursor: () => s.cursor, getBounds: () => ({ x: 600, y: 0, width: 700, height: 400 }),
    setIgnore: (on) => { s.ignore = on; s.calls.push(on); }, notify: (w) => s.notes.push(w),
    now: () => s.t, setTimer: (fn) => { const h = { fn }; s.timers.push(h); return h; }, clearTimer: (h) => { s.timers = s.timers.filter((x) => x !== h); }
  });
  s.gate = gate;
  s.step = (ms) => { s.t += ms; gate.tick(); };
  return s;
}
const RECT = { x: 190, y: 0, w: 320, h: 32 };

test('gate: button down over the island makes the window interactive; release restores click-through and resyncs', () => {
  const s = rig();
  s.gate.setRect(RECT, false);
  s.cursor = { x: 600 + 300, y: 10 }; // inside
  s.gate.setButton(true);
  assert.strictEqual(s.ignore, false); assert.ok(s.gate.forced); assert.ok(s.gate.polling);
  s.step(50);
  assert.deepStrictEqual(s.calls, [false]); // no repeated calls
  s.gate.setButton(false);
  assert.strictEqual(s.ignore, true); assert.ok(!s.gate.forced); assert.ok(!s.gate.polling);
  assert.deepStrictEqual(s.notes, ['resync']);
});

test('gate: does nothing while the cursor is away, follows it in and out, never touches the window if never forced', () => {
  const s = rig();
  s.gate.setRect(RECT, false);
  s.gate.setButton(true);
  s.step(50); s.step(50);
  assert.deepStrictEqual(s.calls, []);
  s.cursor = { x: 600 + 300, y: 40 }; s.step(50); // 8px below: inside the 12px margin
  assert.strictEqual(s.ignore, false);
  s.cursor = { x: 600 + 300, y: 200 }; s.step(50); // left
  assert.strictEqual(s.ignore, true);
  s.gate.setButton(false);
  assert.deepStrictEqual(s.calls, [false, true]);
  const s2 = rig(); s2.gate.setRect(RECT, false); s2.gate.setButton(true); s2.gate.setButton(false);
  assert.deepStrictEqual(s2.calls, []); assert.deepStrictEqual(s2.notes, []);
});

test('gate: Ctrl pass-through and a missing rect keep it out of the way', () => {
  const s = rig();
  s.cursor = { x: 900, y: 10 };
  s.gate.setButton(true); // no rect yet
  assert.deepStrictEqual(s.calls, []);
  s.gate.setRect(RECT, true); s.step(50); // passing
  assert.deepStrictEqual(s.calls, []);
  s.gate.setRect(RECT, false); s.step(50);
  assert.strictEqual(s.ignore, false);
  s.gate.setRect(RECT, true); // Ctrl pressed mid-drag: released at once
  assert.strictEqual(s.ignore, true);
  s.gate.setRect(null, false);
  assert.ok(!s.gate.forced);
});

test('gate safety: held-too-long forcing is released and locked until the next press; a lost button-up stops the polling', () => {
  const s = rig();
  s.gate.setRect(RECT, false); s.cursor = { x: 900, y: 10 };
  s.gate.setButton(true);
  assert.strictEqual(s.ignore, false);
  s.step(FORCE_MAX_MS + 1);
  assert.strictEqual(s.ignore, true); assert.ok(!s.gate.forced);
  s.step(50); s.step(50);
  assert.strictEqual(s.ignore, true); // stays locked although the cursor is still inside
  s.gate.setButton(false); s.gate.setButton(true); // a new press unlocks
  assert.strictEqual(s.ignore, false);
  s.step(POLL_MAX_MS + 1); // the "up" never arrived
  assert.strictEqual(s.ignore, true); assert.ok(!s.gate.polling);
});

test('gate: errors from the window are swallowed and stop() always restores', () => {
  const s = rig();
  s.gate.setRect(RECT, false); s.cursor = { x: 900, y: 10 };
  s.gate.setButton(true);
  s.gate.stop();
  assert.strictEqual(s.ignore, true); assert.ok(!s.gate.polling);
  const g = createGate({ getCursor: () => { throw new Error('x'); }, getBounds: () => ({ x: 0, y: 0 }), setIgnore() {}, now: () => 0, setTimer: () => 1, clearTimer() {} });
  g.setRect(RECT, false);
  assert.doesNotThrow(() => g.setButton(true));
});
