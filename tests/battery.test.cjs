const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// Load the TypeScript logic without a build step, via esbuild (a dependency of vite).
const { transformSync } = require('esbuild');
const code = transformSync(fs.readFileSync(path.join(__dirname, '..', 'src/features/battery/logic.ts'), 'utf8'), { loader: 'ts', format: 'cjs' }).code;
const m = { exports: {} }; new Function('module', 'exports', code)(m, m.exports);
const { nextWarn, clampThreshold, looksLikeDesktop, isLow, toneFor, toPercent, shouldAnnounce } = m.exports;

const run = (levels, threshold = 20, charging = false) => {
  let state = { done: [] }; const out = [];
  for (const level of levels) {
    const r = nextWarn(state, { level, charging, threshold }); state = r.state;
    out.push(r.warn ? r.warn.kind : null);
  }
  return out;
};

test('warns once at the threshold and once at 10% while discharging', () => {
  assert.deepStrictEqual(run([30, 21, 20, 19, 15, 11, 10, 9, 5]), [null, null, 'low', null, null, null, 'critical', null, null]);
});

test('a jump past both thresholds only shows the urgent warning, and nothing repeats after it', () => {
  assert.deepStrictEqual(run([25, 8, 7, 12]), [null, 'critical', null, null]);
});

test('plugging in starts a new discharge cycle', () => {
  let state = { done: [] };
  const step = (level, charging) => { const r = nextWarn(state, { level, charging, threshold: 20 }); state = r.state; return r.warn && r.warn.kind; };
  assert.strictEqual(step(19, false), 'low');
  assert.strictEqual(step(25, true), null);
  assert.strictEqual(step(60, true), null);
  assert.strictEqual(step(19, false), 'low');
});

test('never warns while charging, and already-low at startup warns once', () => {
  assert.deepStrictEqual(run([5, 3], 20, true), [null, null]);
  assert.deepStrictEqual(run([15, 14]), ['low', null]);
});

test('threshold of 10 gives a single critical warning; 30 gives low then critical', () => {
  assert.deepStrictEqual(run([12, 10, 9], 10), [null, 'critical', null]);
  assert.deepStrictEqual(run([31, 30, 12, 10], 30), [null, 'low', null, 'critical']);
});

test('clampThreshold stays within 10..30 and falls back to 20 for junk', () => {
  assert.deepStrictEqual([5, 99, 17.6, 'abc', undefined, null].map(clampThreshold), [10, 30, 18, 20, 20, 10]);
});

test('desktop signature, low state, tone, percent and announce dedupe', () => {
  assert.ok(looksLikeDesktop({ charging: true, level: 1, chargingTime: 0 }));
  assert.ok(!looksLikeDesktop({ charging: true, level: 0.8, chargingTime: 1200 }));
  assert.ok(!looksLikeDesktop({ charging: false, level: 1, chargingTime: Infinity }));
  assert.ok(isLow(19, false, 20) && !isLow(19, true, 20) && !isLow(21, false, 20));
  assert.deepStrictEqual([toneFor(50, true, 20), toneFor(50, false, 20), toneFor(18, false, 20), toneFor(9, false, 20)], ['charging', 'normal', 'low', 'critical']);
  assert.deepStrictEqual([0.824, 1, 1.2, -1, NaN].map(toPercent), [82, 100, 100, 0, 0]);
  assert.ok(shouldAnnounce(null, true) && shouldAnnounce(false, true) && !shouldAnnounce(true, true));
});
