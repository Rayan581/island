const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { transformSync } = require('esbuild');

const load = (rel) => {
  const code = transformSync(fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'), { loader: 'ts', format: 'cjs' }).code;
  const m = { exports: {} }; new Function('module', 'exports', 'require', code)(m, m.exports, require); return m.exports;
};
const { baseMood, resolveMood, nextTransient, SLEEPY_IDLE_MS } = load('src/features/robo/mood.ts');

const base = { enabled: true, claudeRunning: false, hour: 14, idleMs: 0, sleepyAtNight: true };

test('normal by default', () => assert.strictEqual(baseMood(base), 'normal'));
test('Claude running -> squint', () => assert.strictEqual(baseMood({ ...base, claudeRunning: true }), 'squint'));
test('night hours -> sleepy, 06:00 is awake', () => {
  assert.strictEqual(baseMood({ ...base, hour: 0 }), 'sleepy');
  assert.strictEqual(baseMood({ ...base, hour: 5 }), 'sleepy');
  assert.strictEqual(baseMood({ ...base, hour: 6 }), 'normal');
  assert.strictEqual(baseMood({ ...base, hour: 23 }), 'normal');
});
test('the night toggle only affects the night rule, not idle', () => {
  assert.strictEqual(baseMood({ ...base, hour: 3, sleepyAtNight: false }), 'normal');
  assert.strictEqual(baseMood({ ...base, hour: 3, sleepyAtNight: false, idleMs: SLEEPY_IDLE_MS }), 'sleepy');
});
test('10 minutes without cursor movement -> sleepy', () => {
  assert.strictEqual(baseMood({ ...base, idleMs: SLEEPY_IDLE_MS - 1 }), 'normal');
  assert.strictEqual(baseMood({ ...base, idleMs: SLEEPY_IDLE_MS }), 'sleepy');
});
test('working beats sleepy', () => assert.strictEqual(baseMood({ ...base, hour: 3, idleMs: SLEEPY_IDLE_MS, claudeRunning: true }), 'squint'));

test('transient overrides the base until it expires', () => {
  const t = { mood: 'happy', until: 1000 };
  const i = { ...base, claudeRunning: true };
  assert.strictEqual(resolveMood(i, t, 999), 'happy');
  assert.strictEqual(resolveMood(i, t, 1000), 'squint');
  assert.strictEqual(resolveMood(i, null, 0), 'squint');
});
test('disabled is always normal, even with a live transient', () => {
  const i = { ...base, enabled: false, claudeRunning: true, hour: 2 };
  assert.strictEqual(resolveMood(i, { mood: 'surprised', until: 5000 }, 10), 'normal');
});
test('nextTransient: newest wins, but a cheerful event does not cut surprise short', () => {
  const s = nextTransient(null, 'surprised', 2000, 100);
  assert.deepStrictEqual(s, { mood: 'surprised', until: 2100 });
  assert.deepStrictEqual(nextTransient(s, 'happy', 2500, 500), s);
  assert.deepStrictEqual(nextTransient(s, 'happy', 2500, 2100), { mood: 'happy', until: 4600 });
  const h = nextTransient(null, 'happy', 2500, 0);
  assert.deepStrictEqual(nextTransient(h, 'surprised', 2000, 100), { mood: 'surprised', until: 2100 });
});
