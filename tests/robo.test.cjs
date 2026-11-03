const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { transformSync } = require('esbuild');

const load = (rel) => {
  const code = transformSync(fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'), { loader: 'ts', format: 'cjs' }).code;
  const m = { exports: {} }; new Function('module', 'exports', 'require', code)(m, m.exports, require); return m.exports;
};
const { baseMood, resolveMood, nextTransient, shakeTurns, isStartle, dayKey, ENERGY, SLEEPY_IDLE_MS, BORED_IDLE_MS, YAWN_IDLE_MS } = load('src/features/robo/mood.ts');

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
test('the idle ladder: normal, then bored at 90 s, then sleepy at 4 min', () => {
  assert.ok(BORED_IDLE_MS < YAWN_IDLE_MS && YAWN_IDLE_MS < SLEEPY_IDLE_MS);
  assert.strictEqual(baseMood({ ...base, idleMs: BORED_IDLE_MS - 1 }), 'normal');
  assert.strictEqual(baseMood({ ...base, idleMs: BORED_IDLE_MS }), 'bored');
  assert.strictEqual(baseMood({ ...base, idleMs: SLEEPY_IDLE_MS - 1 }), 'bored');
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

test('resting moods and their priority', () => {
  assert.strictEqual(baseMood({ ...base, focusRunning: true }), 'determined');
  assert.strictEqual(baseMood({ ...base, batteryLow: true }), 'worried');
  assert.strictEqual(baseMood({ ...base, near: true }), 'curious');
  assert.strictEqual(baseMood({ ...base, musicPlaying: true }), 'music');
  // Claude working beats focus; focus beats a low battery; a low battery beats sleeping; sleeping beats curiosity and music
  assert.strictEqual(baseMood({ ...base, claudeRunning: true, focusRunning: true }), 'squint');
  assert.strictEqual(baseMood({ ...base, focusRunning: true, batteryLow: true }), 'determined');
  assert.strictEqual(baseMood({ ...base, batteryLow: true, idleMs: SLEEPY_IDLE_MS }), 'worried');
  assert.strictEqual(baseMood({ ...base, idleMs: SLEEPY_IDLE_MS, near: true, musicPlaying: true }), 'sleepy');
  assert.strictEqual(baseMood({ ...base, near: true, musicPlaying: true }), 'curious');
  assert.strictEqual(baseMood({ ...base, enabled: false, focusRunning: true, batteryLow: true, near: true }), 'normal');
});

test('ranks: surprise and dizziness are not cut short by cheerful moods, love is not cut short by a wink', () => {
  const d = nextTransient(null, 'dizzy', 2200, 0);
  assert.deepStrictEqual(nextTransient(d, 'happy', 2500, 500), d);
  assert.deepStrictEqual(nextTransient(d, 'wink', 700, 500), d);
  const l = nextTransient(null, 'love', 2300, 0);
  assert.deepStrictEqual(nextTransient(l, 'wink', 700, 100), l);
  assert.deepStrictEqual(nextTransient(l, 'surprised', 700, 100), { mood: 'surprised', until: 800 });
});

test('shakeTurns counts real back-and-forth swings and ignores jitter and straight movement', () => {
  assert.strictEqual(shakeTurns([0, 30, 0, 30, 0, 30]), 4);
  assert.strictEqual(shakeTurns([0, 10, 0, 10, 0, 10, 0]), 0);              // too small to count
  assert.strictEqual(shakeTurns([0, 40, 80, 120, 160, 200]), 0);           // one direction
  assert.strictEqual(shakeTurns([]), 0);
  assert.strictEqual(shakeTurns([5, 5, 5]), 0);
  assert.ok(shakeTurns([0, 60, 0, 60, 0, 60, 0, 60]) >= ENERGY.normal.shakeTurns);
});

test('startle: fast AND towards the pill AND close enough; calm never does', () => {
  const n = ENERGY.normal;
  assert.strictEqual(isStartle(2500, 300, 200, n), true);
  assert.strictEqual(isStartle(1000, 300, 200, n), false); // too slow
  assert.strictEqual(isStartle(2500, 200, 300, n), false); // moving away
  assert.strictEqual(isStartle(2500, 900, 400, n), false); // still too far
  assert.strictEqual(isStartle(2500, 300, 200, ENERGY.calm), false);
  assert.ok(ENERGY.playful.startleSpeed < n.startleSpeed && ENERGY.playful.nearPx > n.nearPx && ENERGY.playful.lifeMult < ENERGY.calm.lifeMult);
});

test('dayKey is the local calendar day', () => {
  assert.strictEqual(dayKey(new Date(2026, 10, 3, 9, 5).getTime()), '2026-11-03');
  assert.strictEqual(dayKey(new Date(2026, 0, 9, 23, 59).getTime()), '2026-01-09');
});
