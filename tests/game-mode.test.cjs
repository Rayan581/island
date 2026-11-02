const test = require('node:test');
const assert = require('node:assert');
const gm = require('../electron/features/game-mode.cjs');

test('classify: games, video players and office apps', () => {
  assert.strictEqual(gm.classify('eldenring.exe', false), 'game');
  assert.strictEqual(gm.classify('C:\\Games\\Hades.EXE', false), 'game');
  assert.strictEqual(gm.classify('chrome.exe', false), 'video');
  assert.strictEqual(gm.classify('vlc.exe', false), 'video');
  assert.strictEqual(gm.classify('POWERPNT.EXE', false), 'other');
  assert.strictEqual(gm.classify('chrome.exe', true), 'game', 'exclusive D3D fullscreen counts as a game');
  assert.strictEqual(gm.classify('', false), 'unknown');
});

test('shouldHide: hideForVideo only affects non-games', () => {
  const on = (exe, d3d = false) => ({ on: true, exe, d3d });
  assert.strictEqual(gm.shouldHide(null, { hideForVideo: true }), false);
  assert.strictEqual(gm.shouldHide({ on: false, exe: 'x.exe' }, { hideForVideo: true }), false);
  assert.strictEqual(gm.shouldHide(on('game.exe'), { hideForVideo: false }), true);
  assert.strictEqual(gm.shouldHide(on('chrome.exe'), { hideForVideo: false }), false);
  assert.strictEqual(gm.shouldHide(on('chrome.exe'), { hideForVideo: true }), true);
  assert.strictEqual(gm.shouldHide(on(''), { hideForVideo: true }), true, 'an unnamed fullscreen app still hides by default');
  assert.strictEqual(gm.shouldHide(on(''), { hideForVideo: false }), false);
});

test('formatDuration', () => {
  assert.strictEqual(gm.formatDuration(30), '<1m');
  assert.strictEqual(gm.formatDuration(120), '2m');
  assert.strictEqual(gm.formatDuration(2700), '45m');
  assert.strictEqual(gm.formatDuration(4320), '1h 12m');
  assert.strictEqual(gm.formatDuration(7200), '2h');
  assert.strictEqual(gm.formatDuration(-5), '<1m');
});

test('names: window title when tidy, else the exe', () => {
  assert.strictEqual(gm.prettyExe('eldenring.exe'), 'Eldenring');
  assert.strictEqual(gm.prettyExe('hades_ii.exe'), 'Hades Ii');
  assert.strictEqual(gm.prettyExe('FactoryGame-Win64-Shipping.exe'), 'FactoryGame');
  assert.strictEqual(gm.displayName('x.exe', 'Hades II'), 'Hades II');
  assert.strictEqual(gm.displayName('hades_ii.exe', ''), 'Hades Ii');
  assert.strictEqual(gm.displayName('game.exe', 'A'.repeat(60)), 'Game');
});

const S = 1000;
const game = (exe = 'game.exe', title = 'My Game') => ({ on: true, exe, title, d3d: true });
const off = { on: false, exe: '', title: '', d3d: false };

test('session: a 45 minute game ends 20 s after leaving fullscreen', () => {
  const t = new gm.SessionTracker();
  assert.strictEqual(t.update(game(), 0), null);
  assert.strictEqual(t.update(off, 45 * 60 * S), null);
  assert.strictEqual(t.tick(45 * 60 * S + 10 * S), null, 'still inside the grace period');
  assert.deepStrictEqual(t.tick(45 * 60 * S + 20 * S), { exe: 'game.exe', title: 'My Game', seconds: 2700 });
  assert.strictEqual(t.active, false);
});

test('session: alt-tab and back is one session; time away is not counted', () => {
  const t = new gm.SessionTracker();
  t.update(game(), 0);
  t.update(off, 30 * 60 * S);
  assert.strictEqual(t.update(game(), 30 * 60 * S + 8 * S), null);
  t.update(off, 60 * 60 * S + 8 * S);
  const ended = t.tick(60 * 60 * S + 30 * S);
  assert.strictEqual(ended.seconds, 3600);
});

test('session: short sessions are dropped; back after the grace period is a new session', () => {
  const t = new gm.SessionTracker();
  t.update(game(), 0);
  t.update(off, 90 * S);
  assert.strictEqual(t.tick(200 * S), null, '90 s < 2 min');
  t.update(game(), 300 * S);
  t.update(off, 300 * S + 10 * 60 * S);
  // a returning game after the grace period: update() itself expires the old session
  const ended = t.update(game(), 300 * S + 10 * 60 * S + 25 * S);
  assert.strictEqual(ended.seconds, 600);
  assert.strictEqual(t.active, true);
});

test('session: switching straight to another game closes the first; video and unnamed apps never start one', () => {
  const t = new gm.SessionTracker();
  t.update(game('a.exe', 'A'), 0);
  const ended = t.update(game('b.exe', 'B'), 10 * 60 * S);
  assert.deepStrictEqual(ended, { exe: 'a.exe', title: 'A', seconds: 600 });
  assert.strictEqual(t.current.exe, 'b.exe');

  const v = new gm.SessionTracker();
  v.update({ on: true, exe: 'chrome.exe', title: 'YouTube', d3d: false }, 0);
  assert.strictEqual(v.active, false);
  v.update({ on: true, exe: '', title: '', d3d: false }, 0);
  assert.strictEqual(v.active, false);
});

test('session: video fullscreen while away from a game does not extend it', () => {
  const t = new gm.SessionTracker();
  t.update(game(), 0);
  t.update({ on: true, exe: 'chrome.exe', title: 'x', d3d: false }, 10 * 60 * S);
  assert.deepStrictEqual(t.tick(10 * 60 * S + 21 * S), { exe: 'game.exe', title: 'My Game', seconds: 600 });
});

test('config: defaults and junk', () => {
  assert.deepStrictEqual(gm.normalizeConfig(undefined), { hideForVideo: true, showSessionTime: true });
  assert.deepStrictEqual(gm.normalizeConfig({ hideForVideo: false, showSessionTime: 'no' }), { hideForVideo: false, showSessionTime: true });
});

// The feature end to end with a stubbed ctx: debounce, suppress, stale helper, disable switch.
function harness(initialCfg = {}) {
  const calls = [], sent = [], handlers = {}, listeners = {};
  let enabled = true, cfgStore = initialCfg;
  const ctx = {
    enabled: () => enabled, log() {}, send: (d) => sent.push(d), suppress: (on) => calls.push(on),
    handle: (a, fn) => { handlers[a] = fn; },
    config: { get: () => cfgStore, set: (o) => (cfgStore = o) },
    helper: { on: (type, cb) => { listeners[type] = cb; }, send() {} }
  };
  const stop = gm.start(ctx);
  return { calls, sent, handlers, emit: (m) => listeners.fullscreen(m), setEnabled: (v) => { enabled = v; }, stop };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('feature: debounces flicker, hides once, shows once', async () => {
  const h = harness();
  h.emit({ on: false, exe: '', title: '', d3d: false });
  h.emit({ on: true, exe: 'game.exe', title: 'G', d3d: true });
  await sleep(300);
  h.emit({ on: false, exe: '', title: '', d3d: false }); // flicker back before the debounce ends
  await sleep(gm.DEBOUNCE_MS + 200);
  assert.deepStrictEqual(h.calls, [], 'a blip shorter than the debounce does nothing');
  h.emit({ on: true, exe: 'game.exe', title: 'G', d3d: true });
  await sleep(gm.DEBOUNCE_MS - 500);
  assert.deepStrictEqual(h.calls, []);
  await sleep(700);
  assert.deepStrictEqual(h.calls, [true]);
  h.emit({ on: false, exe: '', title: '', d3d: false });
  await sleep(gm.DEBOUNCE_MS + 200);
  assert.deepStrictEqual(h.calls, [true, false]);
  h.stop();
});

test('feature: switch off while hidden releases the island; hideForVideo false ignores video', async () => {
  const h = harness();
  h.emit({ on: true, exe: 'game.exe', title: 'G', d3d: true });
  assert.deepStrictEqual(h.calls, [true], 'the first report applies at once');
  h.setEnabled(false);
  await sleep(1200);
  assert.deepStrictEqual(h.calls, [true, false]);
  h.stop();

  const v = harness({ hideForVideo: false });
  v.emit({ on: true, exe: 'chrome.exe', title: 'YouTube', d3d: false });
  assert.deepStrictEqual(v.calls, []);
  await v.handlers['config:set']({ hideForVideo: true, showSessionTime: true });
  assert.deepStrictEqual(v.calls, [true]);
  v.stop();
  assert.deepStrictEqual(v.calls, [true, false], 'stopping releases the island');
});
